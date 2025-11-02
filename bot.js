// Load env from .env if present (dev/local)
try { require('dotenv').config(); } catch (_) {}

// Safe no-op used as default callback for reactions
const safeNoop = () => {};

const login = require('@dongdev/fca-unofficial');
const fs = require('fs');
const path = require('path');

const qar = require('./commands/qar');

const tts = require('./commands/tts');

// New dependency check for moderation
const adminControl = require('./commands/admincontrol.js'); // Fixed extension
const handleReels = require('./commands/reels');

// Add this line near other command requires
const bank = require('./commands/bank');

// === IMPORT GALACTIC GAME STATE ===
const galactic = require('./commands/galactic.js');

// Global state initialization
const globalState = {
  aiCooldown: new Map(),
  aiConversations: new Map(),
  deepSeekConversations: new Map(), // Add DeepSeek conversation tracking
  youtubeSearches: new Map(),
  wordGames: new Map(),
  gameStates: new Map(),
  adminOnlyMode: new Map(),
  pairHistory: new Map(),
  downloadQueue: new Map(),
  botMessages: new Map(),
  chatCounts: new Map(),
  userSettings: new Map(),
  commandStats: new Map(),
  moderation: adminControl.getModerationData(), // Link Moderation State
  xpGains: new Map(),           // ← Global per-user (same across all groups)
  xpThreadTimestamps: new Map(), // ← NEW: Track last processed timestamp per thread for XP
  agiConversations: new Map(),
  agiCooldown: new Map(),
  galacticGames: new Map(),
  threadTimestamps: new Map(), // ← Existing: For leaderboard (per-thread chat counts)
  bankBalances: new Map()
};

const downloadQueue = new Map();

// Load config
const config = require('./config.json');

// Command cooldown tracking
const commandCooldowns = new Map();
const userCommandUsage = new Map();

// Store bot UID globally
let BOT_UID = null;

// --- UTILITY FUNCTIONS ---

function loadAppState() {
  try {
    const appStatePath = path.join(__dirname, 'appstate.json');
    if (!fs.existsSync(appStatePath)) {
      console.error('appstate.json not found at', appStatePath);
      return null;
    }
    const raw = fs.readFileSync(appStatePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.error('appstate.json is not an array. Please provide a valid appState cookie array.');
      return null;
    }
    if (parsed.length === 0) {
      console.error('appstate.json array is empty.');
      return null;
    }
    // Workaround: library sets cookies on http://, which drops secure cookies; force secure=false
    const normalized = parsed.map((c) => ({
      key: c.key,
      value: c.value,
      domain: c.domain || '.facebook.com',
      path: c.path || '/',
      expires: c.expires || Date.now() + 60 * 60 * 24 * 365,
      secure: false,
      httponly: Boolean(c.httponly)
    }));
    return normalized;
  } catch (e) {
    console.error('Failed to read/parse appstate.json:', e && e.message ? e.message : e);
    return null;
  }
}

function loadChatData() {
  try {
    if (fs.existsSync('chatData.json')) {
      const data = fs.readFileSync('chatData.json', 'utf8');
      const parsedData = JSON.parse(data);
      for (const [key, value] of Object.entries(parsedData)) {
        globalState.chatCounts.set(key, value);
      }
      console.log('Chat data loaded.');
    }
  } catch (e) {
    console.error('Error loading chat data:', e);
  }
}

function loadThreadTimestamps() {
  try {
    if (fs.existsSync('threadTimestamps.json')) {
      const data = fs.readFileSync('threadTimestamps.json', 'utf8');
      const parsedData = JSON.parse(data);
      for (const [key, value] of Object.entries(parsedData)) {
        globalState.threadTimestamps.set(key, value);
      }
      console.log('Thread timestamps loaded.');
    }
  } catch (e) {
    console.error('Error loading thread timestamps:', e);
  }
}

function saveThreadTimestamps() {
  try {
    const data = JSON.stringify(Object.fromEntries(globalState.threadTimestamps), null, 2);
    fs.writeFileSync('threadTimestamps.json', data, 'utf8');
  } catch (e) {
    console.error('Error saving thread timestamps:', e);
  }
}

function loadXPThreadTimestamps() {
  try {
    if (fs.existsSync('xpThreadTimestamps.json')) {
      const data = fs.readFileSync('xpThreadTimestamps.json', 'utf8');
      const parsedData = JSON.parse(data);
      for (const [key, value] of Object.entries(parsedData)) {
        globalState.xpThreadTimestamps.set(key, value);
      }
      console.log('XP thread timestamps loaded.');
    }
  } catch (e) {
    console.error('Error loading XP thread timestamps:', e);
  }
}

function saveXPThreadTimestamps() {
  try {
    const data = JSON.stringify(Object.fromEntries(globalState.xpThreadTimestamps), null, 2);
    fs.writeFileSync('xpThreadTimestamps.json', data, 'utf8');
  } catch (e) {
    console.error('Error saving XP thread timestamps:', e);
  }
}

function loadCommandStats() {
  try {
    if (fs.existsSync('commandStats.json')) {
      const data = fs.readFileSync('commandStats.json', 'utf8');
      const parsedData = JSON.parse(data);
      for (const [key, value] of Object.entries(parsedData)) {
        globalState.commandStats.set(key, value);
      }
      console.log('Command stats loaded.');
    }
  } catch (e) {
    console.error('Error loading command stats:', e);
  }
}

function loadXPData() {
  try {
    if (fs.existsSync('xpData.json')) {
      const raw = fs.readFileSync('xpData.json', 'utf8');
      const obj = JSON.parse(raw);
      for (const [uid, xp] of Object.entries(obj)) {
        globalState.xpGains.set(uid, xp);
      }
      console.log('XP data loaded');
    }
  } catch (e) { console.error('XP load error:', e); }
}

function saveXPData() {
  try {
    const obj = Object.fromEntries(globalState.xpGains);
    fs.writeFileSync('xpData.json', JSON.stringify(obj, null, 2));
  } catch (e) { console.error('XP save error:', e); }
}

function saveChatData() {
  try {
    const data = JSON.stringify(Object.fromEntries(globalState.chatCounts), null, 2);
    fs.writeFileSync('chatData.json', data, 'utf8');
  } catch (e) {
    console.error('Error saving chat data:', e);
  }
}

// === BANK SYSTEM: LOAD & SAVE DATA ===
function loadBankData() {
  const bank = require('./commands/bank');
  try {
    if (fs.existsSync(path.join(__dirname, 'bankData.json'))) {
      const raw = fs.readFileSync(path.join(__dirname, 'bankData.json'), 'utf8');
      const data = JSON.parse(raw);
      for (const [uid, balances] of Object.entries(data)) {
        globalState.bankBalances.set(uid, {
          usd: Number(balances.usd) || 0,
          inr: Number(balances.inr) || 0,
          bdt: Number(balances.bdt) || 0
        });
      }
      console.log(`Bank data loaded: ${globalState.bankBalances.size} users`);
    } else {
      console.log('No bankData.json found. Starting fresh.');
    }
  } catch (error) {
    console.error('Failed to load bank data:', error.message);
  }
}

function saveBankData() {
  try {
    const dataToSave = {};
    for (const [uid, balances] of globalState.bankBalances.entries()) {
      dataToSave[uid] = {
        usd: balances.usd || 0,
        inr: balances.inr || 0,
        bdt: balances.bdt || 0
      };
    }
    fs.writeFileSync(path.join(__dirname, 'bankData.json'), JSON.stringify(dataToSave, null, 2), 'utf8');
    // Optional: log every 10 saves
    if (!saveBankData.count) saveBankData.count = 0;
    saveBankData.count++;
    if (saveBankData.count % 10 === 0) {
      console.log(`Bank data auto-saved (${saveBankData.count} times)`);
    }
  } catch (error) {
    console.error('Failed to save bank data:', error.message);
  }
}

function saveCommandStats() {
  try {
    const data = JSON.stringify(Object.fromEntries(globalState.commandStats), null, 2);
    fs.writeFileSync('commandStats.json', data, 'utf8');
  } catch (e) {
    console.error('Error saving command stats:', e);
  }
}

function updateCommandStats(command) {
  const key = `command_${command}`;
  const currentCount = globalState.commandStats.get(key) || 0;
  globalState.commandStats.set(key, currentCount + 1);
  
  // Save every 10 uses
  if ((currentCount + 1) % 10 === 0) saveCommandStats();
}

function checkCooldown(userID, command, cooldownTime = 3000) {
  const now = Date.now();
  const key = `${userID}_${command}`;
  const lastUsed = commandCooldowns.get(key) || 0;
  
  if (now - lastUsed < cooldownTime) {
    return Math.ceil((cooldownTime - (now - lastUsed)) / 1000);
  }
  
  commandCooldowns.set(key, now);
  return 0;
}

function checkSpam(userID) {
  const now = Date.now();
  const userKey = `spam_${userID}`;
  const userUsage = userCommandUsage.get(userKey) || { count: 0, lastReset: now };
  
  // Reset counter every minute
  if (now - userUsage.lastReset > 60000) {
    userUsage.count = 0;
    userUsage.lastReset = now;
  }
  
  userUsage.count++;
  userCommandUsage.set(userKey, userUsage);
  
  return userUsage.count > 15; // More than 15 commands per minute = spam
}

// Check if message is a reply to the bot
function isReplyToBot(messageReply, botUID) {
  return messageReply && messageReply.senderID === botUID;
}

// Function to unsend bot messages
async function unsendBotMessages(api, threadID, messageIDs) {
  if (!messageIDs || messageIDs.length === 0) return;
  
  let unsentCount = 0;
  for (const msgID of messageIDs) {
    try {
      await new Promise((resolve) => {
        api.unsendMessage(msgID, (err) => {
          if (!err) unsentCount++;
          resolve();
        });
      });
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
    } catch (error) {
      console.error('Error unsending message:', msgID, error);
    }
  }
  console.log(`Unsended ${unsentCount} messages.`);
}

// Helper function to send and store messages
async function sendAndStoreMessage(api, message, threadID, messageID = null) {
  const axios = require('axios');

  const customAxios = axios.create({
    timeout: 300000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive'
    }
  });

  return new Promise((resolve) => {
    let restored = false;

    const send = () => {
      api.sendMessage(message, threadID, (err, info) => {
        // RESTORE DEFAULT AXIOS SAFELY
        if (!restored) {
          try {
            const requestUtils = require('@dongdev/fca-unofficial/src/utils/request');
            if (requestUtils && requestUtils.axios) {
              requestUtils.axios = axios.create(); // default
            }
            restored = true;
          } catch (_) {}
        }

        if (!err && info?.messageID) {
          storeBotMessage(threadID, info.messageID);
        }
        resolve(info);
      }, messageID);
    };

    // ONLY OVERRIDE IF ATTACHMENT
    if (message.attachment) {
      try {
        const requestUtils = require('@dongdev/fca-unofficial/src/utils/request');
        if (requestUtils && requestUtils.axios) {
          requestUtils.axios = customAxios;
        }
      } catch (e) {
        console.warn('Axios override skipped (safe)');
      }
    }

    send();
  });
}

// Helper function to store bot messages
function storeBotMessage(threadID, messageID) {
  if (!globalState.botMessages.has(threadID)) {
    globalState.botMessages.set(threadID, []);
  }
  const threadMsgs = globalState.botMessages.get(threadID);
  threadMsgs.push(messageID);
  if (threadMsgs.length > 50) {
    threadMsgs.splice(0, threadMsgs.length - 50);
  }
}

// --- BACKFILL XP: Process last 5000 messages per thread on startup ---
function backfillXP(api, tid, limit = 5000) {
  const lastTs = globalState.xpThreadTimestamps.get(tid) || 0;
  api.getThreadHistory(tid, limit, null, (err, history) => {
    if (err) return console.error('XP backfill history error:', err);

    let newMaxTs = lastTs;
    let added = 0;
    history.forEach(msg => {
      if (msg.timestamp <= lastTs) return;
      if (msg.type !== 'message' && msg.type !== 'message_reply') return;
      if (msg.senderID === BOT_UID) return;

      const uid = msg.senderID;
      const currentXP = globalState.xpGains.get(uid) || 0;
      const gain = Math.floor(Math.random() * 11) + 15; // 15–25 XP
      globalState.xpGains.set(uid, currentXP + gain);
      added++;

      if (msg.timestamp > newMaxTs) newMaxTs = msg.timestamp;
    });

    if (newMaxTs > lastTs) {
      globalState.xpThreadTimestamps.set(tid, newMaxTs);
      saveXPData();
      saveXPThreadTimestamps();
      console.log(`XP backfilled ${added} msgs → ${tid}`);
    }
  });
}

// --- COMMAND ROUTER FUNCTION ---
function routeCommand(api, event, args, command, state, config) {
  const { threadID, messageID, senderID } = event;

  // Check admin-only mode
  if (state.adminOnlyMode.get(threadID) && !config.adminUIDs.includes(senderID)) {
    if (command !== 'adminonly') {
      api.sendMessage('Admin-only mode is active. Only admins can use commands.', threadID, messageID);
      return;
    }
  }

  // After: const command = args[0].toLowerCase();
  if (['bank', 'net', 'networth', 'rich'].includes(command)) {
  bank.handleCommand(api, event, args, command, globalState);
  return;
  }

  // Handle commands
  switch (command) {
    
    // ========== HELP & INFO COMMANDS ==========
    case 'help':
    case 'menu':
    case 'commands':
      return require('./commands/help')(api, event, state, config);
    
    case 'info':
    case 'botinfo':
    case 'status':
      return require('./commands/info')(api, event, state, config);

    // ========== GAME COMMANDS ==========
    case 'qar':
      return qar.handleCommand(api, event, args, globalState);

    case 'pair':
    case 'couple':
    case 'ship':
      return require('./commands/pair')(api, event, state);
    
    case 'ttt':
    case 'tictactoe':
      return require('./commands/ttt')(api, event, args, state);
    
    case 'word':
    case 'wordgame':
    case 'join':
    case 'wordjoin':
    case 'wordstart':
    case 'startword':
    case 'stop':
    case 'stopword':
    case 'endword':
      return require('./commands/word')(api, event, args, state);

    case 'galactic':
    case 'gal':
            // This routes the entire command (e.g., ['galactic', 'end']) to the handler
            return galactic.handleCommand(api, event, args, globalState);
    
    // ========== YOUTUBE COMMANDS ==========
    
    case 'yta':
  const ytaCooldown = checkCooldown(senderID, 'yta', 10000);
  if (ytaCooldown > 0) {
    return api.setMessageReaction('clock', messageID, (err) => {
      if (err) console.error('Reaction error:', err);
    }, true);
  }
  return require('./commands/yta')(api, event, args, state, sendAndStoreMessage);
   
    case 'ytv':
  const ytvCooldown = checkCooldown(senderID, 'ytv', 10000);
  if (ytvCooldown > 0) {
    return api.setMessageReaction('clock', messageID, (err) => {
      if (err) console.error('Reaction error:', err);
    }, true);
  }
  return require('./commands/ytv')(api, event, args, state, sendAndStoreMessage);

    // ========== MEDIA & MUSIC COMMANDS ==========
    case 'play':
    case 'song':
    case 'music':
      const cooldown = checkCooldown(senderID, 'play', 5000);
      if (cooldown > 0) {
        return api.sendMessage(`Please wait ${cooldown} seconds before using play command again.`, threadID, messageID);
      }
      return require('./commands/play')(api, event, args, state);
    
    case 'reels':
    case 'reel':
    case 'instagram':
      return handleReels(api, event, args, state.downloadQueue, sendAndStoreMessage, storeBotMessage);
    
    // ========== AI & CHAT COMMANDS ==========

    case 'ai':
    case 'chat':
    case 'ask':
    case 'bot':
      const aiCooldown = checkCooldown(senderID, 'ai', 3000);
      if (aiCooldown > 0) {
        return api.sendMessage(`Please wait ${aiCooldown} seconds before using AI command again.`, threadID, messageID);
      }
        return require('./commands/ai')(api, event, args, state);

    case 'agi':
      const agiCommand = require('./commands/agi');
        return agiCommand(api, event, args, state);

    case 'gen':
    case 'generate':
    case 'ai-gen':
      const genCooldown = checkCooldown(senderID, 'gen', 10000); // 10 second cooldown
      if (genCooldown > 0) {
        return api.sendMessage(
          `Please wait ${genCooldown} seconds before generating again.`,
          threadID,
          messageID
        );
      }
     return require('./commands/gen')(api, event, args, state);

    case 'geni':
    case 'genimage':
      const geniCooldown = checkCooldown(senderID, 'geni', 10000);
      if (geniCooldown > 0) {
        return api.setMessageReaction('⏳', messageID, () => {}, true);
      }
        return require('./commands/geni')(api, event, args, state);

    case 'genci':
    case 'cinematic':
     const genciCooldown = checkCooldown(senderID, 'genci', 10000);
      if (genciCooldown > 0) {
       return api.setMessageReaction('⏳', messageID, () => {}, true);
  }
       return require('./commands/genci')(api, event, args, state);

    // ========== UTILITY COMMANDS ==========

    case 'tts':
       const ttsCooldown = checkCooldown(senderID, 'tts', 10000);  // Add cooldown to prevent spam (10s)
       if (ttsCooldown > 0) {
       return api.setMessageReaction('⏳', messageID, () => {}, true);
       }
       return tts(api, event, args, globalState);

    case 'pfp':
    case 'avatar':
    case 'profilepic':
      return require('./commands/pfp')(api, event, args, state);
    
    case 'uid':
    case 'id':
    case 'userid':
      return require('./commands/uid')(api, event, state);

    case 'clearai':
    case 'resetai':
    case 'newchat':
      if (state.aiConversations.has(threadID)) {
        state.aiConversations.delete(threadID);
        api.sendMessage('✅ AI conversation cleared! Start a new one with <ai', threadID, messageID);
      } else {
        api.sendMessage('❌ No active AI conversation to clear.', threadID, messageID);
      }
      return;
      
    case 'adminlist':
    case 'admins':
      return require('./commands/adminlist')(api, event, state, config);  

    case 'quote':
    case 'q':
      return require('./commands/quote')(api, event, state);

    case 'weather':
      return require('./commands/weather')(api, event, args);

    case 'time':
      return require('./commands/time')(api, event, args, state);

    case 'sim':
    case 'simsimi':
    case 'chatbot':
      return require('./commands/sim')(api, event, args, state);

    case 'settings':
      return require('./commands/settings')(api, event, args, state);

    case 'u':
    case 'unsend':
      return require('./commands/unsend')(api, event, state);

     // ========== GROUP MANAGEMENT ==========
    case 'antiout':
      return require('./commands/antiout')(api, event, args, state, config);

    case 'add':
      return require('./commands/add')(api, event, args, state, config);  


    // ========== ADMIN COMMANDS ==========
    case 'adminonly':
    case 'adminmode':
      return require('./commands/adminonly')(api, event, args, state, config);
    
    case 'adminlist':
    case 'admins':
      return require('./commands/adminlist')(api, event, state, config);
      
    case 'kick':
      return adminControl.kick(api, event, args, config);
      
    case 'ban':
      return adminControl.ban(api, event, args, config);
      
    case 'unban':
      return adminControl.unban(api, event, args, config);
      
    case 'warn':
      return adminControl.warn(api, event, args, config);
      
    case 'clearchat':
      return adminControl.clearchat(api, event, args, config);

    case 'mute':
      return adminControl.mute(api, event, args, config);
      
    case 'unmute':
      return adminControl.unmute(api, event, args, config);  

    // ========== LEADERBOARD COMMAND ==========
    case 'leaderboard':
    case 'top':
    case 'rank':
      return require('./commands/leaderboard')(api, event, state);

    case 'prefix':
      if (args[1]) {
        api.sendMessage('Prefix change coming soon!', threadID, messageID);
      } else {
        api.sendMessage('Current prefix: <', threadID, messageID);
      }
      return;

    case 'stats':
    case 'statistics':
      return require('./commands/stats')(api, event, state);

    // ========== XP COMMAND ==========
    case 'xp':
     if (args[1] === 'list' || args[1] === 'top') {
     return require('./commands/xp').showTop(api, event, state);
    }
     return require('./commands/xp')(api, event, state);

    // ========== DEFAULT CASE ==========
    default:
      const unknownResponses = [
        `Command "<${command}" isn't available. Use <help to see all commands.`,
        `Command not found: <${command}. Type <help for available commands.`,
        `I don't recognize "<${command}". Check <help for the command list.`,
        `Unknown command: <${command}. Use <help to see what I can do!`
      ];
      const randomResponse = unknownResponses[Math.floor(Math.random() * unknownResponses.length)];
      api.sendMessage(randomResponse, threadID, messageID);
      break;
  }
}

// --- MAIN MESSAGE HANDLER ---
async function handleMessage(api, event, state, config) {
  const { threadID, messageID, body, senderID, messageReply } = event;

  // Ignore messages from bots
  if (senderID === api.getCurrentUserID()) return;

  // 1. GLOBAL BAN CHECK (Kicks the user if they're banned)
  if (adminControl.checkBan(api, event)) {
      return; 
  }

  // 2. MUTE CHECK (Deletes the message if user is muted)
  if (adminControl.checkAndHandleMute(api, event)) {
      return; 
  }

  // 3. QUICK UNSEND: If someone replies to a bot message with <u, unsend that specific bot message
  if (
    messageReply &&
    messageReply.senderID === BOT_UID &&
    body && typeof body === 'string' && body.toLowerCase().startsWith('<u')
  ) {
    const repliedMessageId = messageReply.messageID;
    if (repliedMessageId) {
      api.unsendMessage(repliedMessageId, () => {});
    }
    return;
  }

  // Auto-detect Facebook/Instagram Reels links - IMPROVED
  if (body && (body.includes('facebook.com/reel') || 
             body.includes('facebook.com/share/r/') ||
             body.includes('instagram.com/reel') || 
             body.includes('instagram.com/p/') ||
             body.includes('fb.watch')) && 
             !body.startsWith('<')) {
  
    const urlMatch = body.match(/(https?:\/\/[^\s<]+)/);
    if (urlMatch) {
      handleReels(api, event, [], state.downloadQueue, sendAndStoreMessage, storeBotMessage);
      return;
    }
  }

  // === LEADERBOARD: Update chat counts (per thread, last 5000 msgs) ===
  const timestamp = event.timestamp || Date.now();
  const lastTs = state.threadTimestamps.get(threadID) || 0;
  if (timestamp > lastTs) {
    const chatKey = `${threadID}-${senderID}`;
    const currentCount = state.chatCounts.get(chatKey) || 0;
    state.chatCounts.set(chatKey, currentCount + 1);
    state.threadTimestamps.set(threadID, timestamp);
    saveChatData(); // Save immediately
    saveThreadTimestamps(); // Save immediately
  }

  // === XP: Update global XP (same across all groups, last 5000 msgs per thread) ===
  const xpLastTs = state.xpThreadTimestamps.get(threadID) || 0;
  if (timestamp > xpLastTs) {
    const userKey = senderID; // Global
    const currentXP = globalState.xpGains.get(userKey) || 0;
    const gain = Math.floor(Math.random() * 11) + 15; // 15–25 XP
    globalState.xpGains.set(userKey, currentXP + gain);

    state.xpThreadTimestamps.set(threadID, timestamp);
    saveXPData(); // Save immediately
    saveXPThreadTimestamps();
  }

  // ========== ENHANCED AI CONVERSATION HANDLING ========== //

    if (isReplyToBot(messageReply, BOT_UID)) {
    if (state.aiConversations.has(threadID)) {
      const convoData = state.aiConversations.get(threadID);

      // === CRITICAL FIX: Only continue if replying to a message in THIS AI chain ===
      const isInCurrentAIChain = convoData.allAIMessageIDs?.includes(messageReply.messageID);

      if (!isInCurrentAIChain) {
        // Reply is to bot, but NOT part of active <ai chain → ignore
        return;
      }

      // === Now safe: this reply is part of the current <ai conversation ===

      // Allow <u to unsend the entire AI chain
      if (body && body.toLowerCase().startsWith('<u')) {
        try {
          await unsendBotMessages(api, threadID, convoData.messageIDs);
          state.aiConversations.delete(threadID);
          console.log(`AI conversation unsent and cleared for thread ${threadID}`);
        } catch (error) {
          console.error('Error unsending AI messages:', error);
        }
        return;
      }

      // Continue the AI conversation
      try {
        const aiCommand = require('./commands/ai');
        if (aiCommand.handleAIConversation) {
          return aiCommand.handleAIConversation(api, event, convoData, state);
        }
      } catch (error) {
        console.error('Error in AI conversation handler:', error);
        api.sendMessage('AI error. Start a new chat with <ai', threadID, messageID);
      }
      return;
    }

    // === Fallback: <u on any bot message (not in AI chain) ===
    if (body && body.toLowerCase().startsWith('<u')) {
      const recentBotMessages = state.botMessages.get(threadID) || [];
      if (recentBotMessages.length > 0) {
        await unsendBotMessages(api, threadID, recentBotMessages.slice(-10));
        state.botMessages.set(threadID, []);
        console.log(`Unsended ${recentBotMessages.length} recent bot messages in ${threadID}`);
      } else {
        api.sendMessage('No recent bot messages to unsend.', threadID, messageID);
      }
      return;
    }
  }

  // ========== ENHANCED AGI CONVERSATION HANDLING ==========
  if (isReplyToBot(messageReply, BOT_UID)) {
    if (state.agiConversations.has(threadID)) {
      const convoData = state.agiConversations.get(threadID);
      
      if (convoData.isGroupChat) {
        if (body && body.toLowerCase().startsWith('<u')) {
          try {
            await unsendBotMessages(api, threadID, convoData.messageIDs);
            state.agiConversations.delete(threadID);
            return;
          } catch (error) {
            console.error('Error unsending messages:', error);
          }
        } else {
          try {
            const agiCommand = require('./commands/agi');
            if (agiCommand.handleAGIConversation) {
              return agiCommand.handleAGIConversation(api, event, convoData, state);
            }
          } catch (error) {
            console.error('Error handling AGI conversation:', error);
            api.sendMessage('Failed to continue conversation. Please start a new one with <agi', threadID, messageID);
          }
          return;
        }
      }

      else if (convoData.userID === senderID) {
        if (body && body.toLowerCase().startsWith('<u')) {
          try {
            await unsendBotMessages(api, threadID, convoData.messageIDs);
            state.agiConversations.delete(threadID);
            return;
          } catch (error) {
            console.error('Error unsending messages:', error);
          }
        } else {
          try {
            const agiCommand = require('./commands/agi');
            if (agiCommand.handleAGIConversation) {
              return agiCommand.handleAGIConversation(api, event, convoData, state);
            }
          } catch (error) {
            console.error('Error handling AGI conversation:', error);
            api.sendMessage('Failed to continue conversation. Please start a new one with <agi', threadID, messageID);
          }
          return;
        }
      }
    }
  }

  // 6. Process commands (must start with '<')
  if (!body || typeof body !== 'string' || !body.startsWith('<')) {
    return;
  }

  // Spam protection
  if (checkSpam(senderID)) {
    api.sendMessage('Slow down! You\'re sending too many commands too fast.', threadID, messageID);
    return;
  }

  const args = body.slice(1).trim().split(' ');
  const command = args[0].toLowerCase();

  // Update command statistics
  updateCommandStats(command);

  // Route to command handler
  routeCommand(api, event, args, command, state, config);
}

// --- BOT STARTUP ---
const loadedAppState = loadAppState();
if (!loadedAppState) {
  console.error('Bot cannot start without a valid appstate.json. Run login or update cookies.');
  process.exit(1);
}

login({ appState: loadedAppState }, { logLevel: 'silent', listenEvents: true, selfListen: false, forceLogin: false }, (err, api) => {
  if (err) return console.error('Login failed:', err);

  console.log('Bot connected successfully!');
  
  BOT_UID = api.getCurrentUserID();
  console.log('Bot UID:', BOT_UID);

  require('./nickname.js').init(api, BOT_UID);

  if (api && typeof api.setMessageReaction === 'function') {
    const originalSetMessageReaction = api.setMessageReaction.bind(api);
    api.setMessageReaction = (emoji, messageID, callback, isAdd) => {
      const cb = typeof callback === 'function' ? callback : safeNoop;
      try {
        return originalSetMessageReaction(emoji, messageID, cb, isAdd);
      } catch (e) {
        console.error('setMessageReaction error:', e && e.message ? e.message : e);
      }
    };
  }
  
  api.setOptions({
    listenEvents: true,
    logLevel: 'silent',
    selfListen: false
  });

  // Load all data
  loadChatData();
  loadThreadTimestamps();
  loadXPThreadTimestamps(); // NEW: For XP backfill
  loadCommandStats();
  loadXPData();
  loadBankData();

  // Backfill leaderboard (existing)
  api.getThreadList(50, null, ['INBOX'], (err, threads) => {
    if (err) return console.error('Thread list error:', err);

    threads.forEach(thread => {
      const tid = thread.threadID;
      const lastTs = globalState.threadTimestamps.get(tid) || 0;

      api.getThreadHistory(tid, 5000, null, (err, history) => {
        if (err) return console.error('History error:', err);

        let newMaxTs = lastTs;
        history.forEach(msg => {
          if (msg.timestamp <= lastTs) return;
          if (msg.type !== 'message' && msg.type !== 'message_reply') return;
          if (msg.senderID === BOT_UID) return;

          const key = `${tid}-${msg.senderID}`;
          const count = globalState.chatCounts.get(key) || 0;
          globalState.chatCounts.set(key, count + 1);

          if (msg.timestamp > newMaxTs) newMaxTs = msg.timestamp;
        });

        if (newMaxTs > lastTs) {
          globalState.threadTimestamps.set(tid, newMaxTs);
          saveChatData();
          saveThreadTimestamps();
          console.log(`Backfilled ${history.filter(m => m.timestamp > lastTs).length} messages for thread ${tid}`);
        }
      });
    });
  });

  // Backfill XP (new)
  api.getThreadList(50, null, ['INBOX'], (err, threads) => {
    if (err) return;
    threads.forEach(t => backfillXP(api, t.threadID, 5000));
  });

  // Save every 30 seconds
  setInterval(saveXPData, 30_000);

  api.listen((err, event) => {
    if (err) return console.error('Listen error:', err);
    if (event.type === 'event' && event.logMessageType === 'log:unsubscribe') {
      const threadID = event.threadID;
      const leftUserID = event.leftParticipantFbId || (event.logMessageData && event.logMessageData.leftParticipantFbId);
      const settings = globalState.userSettings.get(threadID) || {};
      if (settings.antiout && leftUserID) {
        api.addUserToGroup(leftUserID, threadID, (e) => {
          if (e) console.error('Antiout add back failed:', e);
        });
      }
      return;
    }

    if (event.type === 'event' && event.logMessageType === 'log:subscribe') {
      const threadID = event.threadID;
      const added = event.logMessageData?.addedParticipants || [];
      const botWasAdded = added.some(p => p.fullUserID === BOT_UID);

    if (botWasAdded) {
        require('./nickname.js').onBotAdded(threadID);
      }
      return;
    }

    // Handle message reactions (for qar, etc.)
    if (event.type === 'message_reaction') {
      qar.handleReaction(api, event, globalState);
     
      galactic.handleReaction(api, event, globalState);
      return;
    }

    // Handle new messages and replies
    if (event.type === 'message' || event.type === 'message_reply') {
      handleMessage(api, event, globalState, config);
      return; // Event handled
      galactic.handleReply(api, event, globalState);
    }

    handleMessage(api, event, globalState, config);
  });

});

// Auto-save data periodically
setInterval(() => {
  saveChatData();
  saveThreadTimestamps();
  saveXPThreadTimestamps();
  saveCommandStats();
  saveXPData();
  saveBankData();
}, 5 * 60 * 1000);

// Export for testing or other modules
module.exports = {
  globalState,
  checkCooldown,
  updateCommandStats,
  getBotUID: () => BOT_UID,
  sendAndStoreMessage,
  storeBotMessage,
};

console.log('Bot.js loaded with full moderation system!');