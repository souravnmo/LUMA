// commands/bank.js
const fs = require('fs');
const path = require('path');

const CURRENCIES = ['usd', 'inr', 'bdt'];
const SYMBOLS = { usd: '$', inr: '₹', bdt: '৳' };
const RATES = { usd: 1, inr: 88, bdt: 122 };
const BANK_FILE = path.join(__dirname, '..', 'bankData.json');

// Bengali numeral converter
function toBengaliDigits(num) {
  const bengali = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(num).replace(/\d/g, d => bengali[d]);
}

// Safe number formatter – never crashes on undefined
function fmt(val, isBdt = false) {
  const n = Number(val) || 0;
  const str = n.toLocaleString();
  return isBdt ? toBengaliDigits(str) : str;
}

// Load bank data from file
function loadBankData(state) {
  try {
    if (fs.existsSync(BANK_FILE)) {
      const raw = fs.readFileSync(BANK_FILE, 'utf8');
      const data = JSON.parse(raw);
      for (const [uid, balances] of Object.entries(data)) {
        state.bankBalances.set(uid, {
          usd: Number(balances.usd) || 0,
          inr: Number(balances.inr) || 0,
          bdt: Number(balances.bdt) || 0
        });
      }
      console.log(`Bank loaded: ${state.bankBalances.size} users`);
    }
  } catch (err) {
    console.error('Bank load failed:', err.message);
  }
}

// Save bank data to file – ALWAYS write every currency (even 0)
function saveBankData(state) {
  try {
    const data = {};

    for (const [uid, bal] of state.bankBalances.entries()) {
      data[uid] = {
        usd: Number(bal.usd) || 0,
        inr: Number(bal.inr) || 0,
        bdt: Number(bal.bdt) || 0
      };
    }

    fs.writeFileSync(BANK_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Bank save failed:', err.message);
  }
}

// Add money (internal)
async function addMoney(userID, amount, currency, state) {
  if (!CURRENCIES.includes(currency)) return;
  if (!state.bankBalances.has(userID)) {
    state.bankBalances.set(userID, { usd: 0, inr: 0, bdt: 0 });
  }
  const bal = state.bankBalances.get(userID);
  bal[currency] += Math.round(amount);
  saveBankData(state);
}

// Get balance
function getBalance(userID, currency, state) {
  const bal = state.bankBalances.get(userID);
  return bal ? (bal[currency] || 0) : 0;
}

// Get user name
async function getUserName(api, uid) {
  try {
    const info = await new Promise(resolve =>
      api.getUserInfo(uid, (err, data) => resolve(data[uid]))
    );
    return info?.name || 'User';
  } catch {
    return 'User';
  }
}

// Deposit
async function deposit(api, userID, amount, currency, state, threadID, messageID) {
  if (!CURRENCIES.includes(currency) || amount <= 0) {
    return api.sendMessage('Invalid amount or currency.', threadID, messageID);
  }
  await addMoney(userID, amount, currency, state);
  const displayAmount = fmt(amount, currency === 'bdt');
  api.sendMessage(`Deposited ${SYMBOLS[currency]}${displayAmount}.`, threadID, messageID);
}

// Convert
async function convert(api, userID, from, to, amount, state, threadID, messageID) {
  if (!CURRENCIES.includes(from) || !CURRENCIES.includes(to)) {
    return api.sendMessage('Invalid currency.', threadID, messageID);
  }
  const bal = getBalance(userID, from, state);
  if (bal < amount) {
    return api.sendMessage('Insufficient balance.', threadID, messageID);
  }
  const converted = Math.round(amount * RATES[to] / RATES[from]);
  const b = state.bankBalances.get(userID);
  b[from] -= amount;
  b[to] += converted;
  saveBankData(state);

  const fromDisplay = fmt(amount, from === 'bdt');
  const toDisplay = fmt(converted, to === 'bdt');

  api.sendMessage(`Converted: ${SYMBOLS[from]}${fromDisplay} → ${SYMBOLS[to]}${toDisplay}`, threadID, messageID);
}

// Transfer
async function transfer(api, senderID, receiverID, amount, currency, state, threadID, messageID) {
  if (!CURRENCIES.includes(currency)) {
    return api.sendMessage('Invalid currency.', threadID, messageID);
  }
  const senderBal = getBalance(senderID, currency, state);
  if (senderBal < amount) {
    return api.sendMessage('Insufficient balance.', threadID, messageID);
  }
  if (!state.bankBalances.has(receiverID)) {
    state.bankBalances.set(receiverID, { usd: 0, inr: 0, bdt: 0 });
  }
  const s = state.bankBalances.get(senderID);
  const r = state.bankBalances.get(receiverID);
  s[currency] -= amount;
  r[currency] += amount;
  saveBankData(state);
  const [sName, rName] = await Promise.all([
    getUserName(api, senderID),
    getUserName(api, receiverID)
  ]);
  const displayAmount = fmt(amount, currency === 'bdt');
  api.sendMessage(`${sName} → ${rName}: ${SYMBOLS[currency]}${displayAmount}`, threadID, messageID);
}

// Withdraw
async function withdraw(api, userID, amount, currency, state, threadID, messageID) {
  if (!CURRENCIES.includes(currency)) {
    return api.sendMessage('Invalid currency.', threadID, messageID);
  }
  const bal = getBalance(userID, currency, state);
  if (bal < amount) {
    return api.sendMessage('Insufficient balance.', threadID, messageID);
  }
  const b = state.bankBalances.get(userID);
  b[currency] -= amount;
  saveBankData(state);
  const displayAmount = fmt(amount, currency === 'bdt');
  api.sendMessage(`Withdrew ${SYMBOLS[currency]}${displayAmount}`, threadID, messageID);
}

// Leaderboard (Minimal & Professional)
async function leaderboard(api, state, threadID, messageID, currency = null) {
  const users = Array.from(state.bankBalances.entries()).filter(([_, b]) => {
    if (currency) return b[currency] > 0;
    return b.usd > 0 || b.inr > 0 || b.bdt > 0;
  });

  const ranked = await Promise.all(
    users.map(async ([uid, b]) => {
      const name = await getUserName(api, uid);
      let value = 0;
      if (currency) {
        value = b[currency];
      } else {
        value = b.usd + Math.round(b.inr / RATES.inr) + Math.round(b.bdt / RATES.bdt);
      }
      return { name, value, b };
    })
  );

  ranked.sort((a, b) => b.value - a.value);
  const top10 = ranked.slice(0, 10);
  if (top10.length === 0) {
    return api.sendMessage('No data.', threadID, messageID);
  }

  const title = currency ? `Top ${currency.toUpperCase()} Holders` : 'Top Wealth Holders';
  let msg = `${title}\n${'─'.repeat(30)}\n`;
  top10.forEach((u, i) => {
    msg += `${i + 1}. ${u.name}\n`;
    if (currency) {
      const val = fmt(u.value, currency === 'bdt');
      msg += `   ${SYMBOLS[currency]}${val}\n`;
    } else {
      const parts = [];
      if (u.b.usd > 0) parts.push(`$${fmt(u.b.usd)}`);
      if (u.b.inr > 0) parts.push(`₹${fmt(u.b.inr)}`);
      if (u.b.bdt > 0) parts.push(`৳${fmt(u.b.bdt, true)}`);
      msg += `   ${parts.join(' | ')}\n`;
    }
  });
  msg += `${'─'.repeat(30)}\nUse <net usd>, <net inr>, or <net bdt>`;
  api.sendMessage(msg, threadID, messageID);
}

// Main command handler
async function handleCommand(api, event, args, command, state) {
  const { threadID, messageID, senderID, mentions } = event;
  const config = require('../config.json');
  const isAdmin = config.adminUIDs.includes(senderID);

  // <net> or <networth>
  if (command === 'net' || command === 'networth') {
    const targetID = Object.keys(mentions)[0] || senderID;
    const currency = args[1]?.toLowerCase();
    const b = state.bankBalances.get(targetID) || { usd: 0, inr: 0, bdt: 0 };
    let msg;

    if (currency && CURRENCIES.includes(currency)) {
      const val = fmt(b[currency], currency === 'bdt');
      msg = `Balance: ${SYMBOLS[currency]}${val}`;
    } else {
      const parts = [];
      if (b.usd > 0) parts.push(`$${fmt(b.usd)}`);
      if (b.inr > 0) parts.push(`₹${fmt(b.inr)}`);
      if (b.bdt > 0) parts.push(`৳${fmt(b.bdt, true)}`);
      msg = parts.length ? `Balances: ${parts.join(' | ')}` : 'Balance: 0';
    }
    api.sendMessage(msg, threadID, messageID);
    return;
  }

  // <rich user ...>
  if (command === 'rich' && args[1] === 'user') {
    const currency = args[2]?.toLowerCase();
    if (currency && !CURRENCIES.includes(currency)) {
      return api.sendMessage('Invalid currency.', threadID, messageID);
    }
    await leaderboard(api, state, threadID, messageID, currency);
    return;
  }

  // <bank ...>
  if (command !== 'bank') return;

  const sub = args[1]?.toLowerCase();

  // DEPOSIT
  if (sub === 'deposit') {
    const input = args[2];
    let currency, amount;
    if (input?.startsWith('$')) { currency = 'usd'; amount = parseInt(input.slice(1)); }
    else if (input?.startsWith('₹')) { currency = 'inr'; amount = parseInt(input.slice(1)); }
    else if (input?.startsWith('৳')) { currency = 'bdt'; amount = parseInt(input.slice(1)); }
    else { return api.sendMessage('Use $100, ₹5000, or ৳12000', threadID, messageID); }
    if (isNaN(amount) || amount <= 0) return api.sendMessage('Invalid amount.', threadID, messageID);
    await deposit(api, senderID, amount, currency, state, threadID, messageID);
  }

  // CONVERT
  if (sub === 'convert') {
    const from = args[2]?.toLowerCase();
    const toWord = args[3]?.toLowerCase();
    const to = args[4]?.toLowerCase();
    const amount = parseInt(args[5]);
    if (toWord !== 'to' || !from || !to || isNaN(amount) || amount <= 0) {
      return api.sendMessage('Usage: <bank convert usd to inr 5>', threadID, messageID);
    }
    await convert(api, senderID, from, to, amount, state, threadID, messageID);
  }

  // TRANSFER
  else if (sub === 'transfer') {
    const receiverID = Object.keys(mentions)[0];
    if (!receiverID) return api.sendMessage('Mention a user.', threadID, messageID);
    const input = args[args.length - 1];
    let currency, amount;
    if (input?.startsWith('$')) { currency = 'usd'; amount = parseInt(input.slice(1)); }
    else if (input?.startsWith('₹')) { currency = 'inr'; amount = parseInt(input.slice(1)); }
    else if (input?.startsWith('৳')) { currency = 'bdt'; amount = parseInt(input.slice(1)); }
    else { return api.sendMessage('Use $50, ₹1000, or ৳5000', threadID, messageID); }
    if (isNaN(amount) || amount <= 0) return api.sendMessage('Invalid amount.', threadID, messageID);
    await transfer(api, senderID, receiverID, amount, currency, state, threadID, messageID);
  }

  // ADMIN SET
  else if (sub === 'admin' && isAdmin && args[2] === 'set') {
    const targetID = Object.keys(mentions)[0] || args[3];
    const input = args[args.length - 1];
    let currency, amount;

    if (input?.startsWith('$')) { currency = 'usd'; amount = parseInt(input.slice(1)); }
    else if (input?.startsWith('₹')) { currency = 'inr'; amount = parseInt(input.slice(1)); }
    else if (input?.startsWith('৳')) { currency = 'bdt'; amount = parseInt(input.slice(1)); }
    else { currency = 'usd'; amount = parseInt(input); } // fallback

    if (!targetID || !CURRENCIES.includes(currency) || isNaN(amount) || amount < 0) {
      return api.sendMessage('Usage: <bank admin set @user $100>', threadID, messageID);
    }

    if (!state.bankBalances.has(targetID)) {
      state.bankBalances.set(targetID, { usd: 0, inr: 0, bdt: 0 });
    }
    state.bankBalances.get(targetID)[currency] = amount;
    saveBankData(state);
    const displayAmount = fmt(amount, currency === 'bdt');
    api.sendMessage(`Admin set ${currency.toUpperCase()}: ${SYMBOLS[currency]}${displayAmount}`, threadID, messageID);
  }

  else {
    api.sendMessage('Invalid command.', threadID, messageID);
  }
}

module.exports = {
  loadBankData,
  saveBankData,
  addMoney,
  handleCommand
};