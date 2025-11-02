// nickname.js
// ONLY nickname logic — NO api.listen()!

const nicknameDone = new Set();
let api = null;
let BOT_UID = null;

async function trySetNickname(threadID) {
  if (nicknameDone.has(threadID)) return;
  nicknameDone.add(threadID);
  if (!api || !BOT_UID) return;

  try {
    const info = await new Promise((resolve, reject) =>
      api.getThreadInfo(threadID, (err, data) => (err ? reject(err) : resolve(data)))
    );

    let currentNick = null;
    if (Array.isArray(info.participants)) {
      const bot = info.participants.find(p => p.id === BOT_UID);
      if (bot) currentNick = bot.nickName || null;
    }

    const botIsMember = Array.isArray(info.participantIDs) && info.participantIDs.includes(BOT_UID);
    if (!botIsMember) return;

    if (currentNick === 'Luma🌀') {
      console.log(`Nickname already "Luma🌀" in group ${threadID}`);
      return;
    }

    await new Promise(resolve => {
      api.changeNickname('Luma🌀', threadID, BOT_UID, err => {
        if (err) {
          if (err.message && err.message.includes('MQTT') || err.message === 'Connection closed') {
            console.warn(`MQTT not ready for ${threadID}, retry in 5s...`);
            setTimeout(() => trySetNickname(threadID), 5000);
          } else {
            console.error(`Failed to set "Luma" in ${threadID}:`, err.message);
          }
        } else {
          console.log(`Nickname set to "Luma" in group ${threadID}`);
        }
        resolve();
      });
    });

  } catch (e) {
    console.error('nickname.js error:', e);
  }
}

function applyToAllGroups() {
  api.getThreadList(200, null, ['INBOX'], (err, list) => {
    if (err || !list) return console.error('nickname.js: cannot fetch thread list', err);
    list.forEach(thread => {
      if (thread.isGroup && thread.participantIDs && thread.participantIDs.includes(BOT_UID)) {
        trySetNickname(thread.threadID);
      }
    });
  });
}

// Export functions
module.exports = {
  init: (fcaApi, botUID) => {
    api = fcaApi;
    BOT_UID = botUID || api.getCurrentUserID();
    console.log('nickname.js → ready (BOT_UID:', BOT_UID, ')');

    // Wait for MQTT
    const wait = setInterval(() => {
      try {
        api.getCurrentUserID();
        clearInterval(wait);
        setTimeout(applyToAllGroups, 3000);
      } catch (_) {}
    }, 1000);
  },

  // Called from bot.js when bot is added to a group
  onBotAdded: (threadID) => {
    setTimeout(() => trySetNickname(threadID), 2000);
  }
};