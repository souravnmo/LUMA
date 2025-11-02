const config = require('../config.json');

module.exports = async function handleAdminList(api, event, state, config) {
  const { threadID, messageID } = event;

  const utils = {
    async sendMessage(message) {
      return new Promise((resolve) => {
        api.sendMessage(message, threadID, (err, info) => {
          if (!err && info && info.messageID) {
            this.storeBotMessage(info.messageID);
          }
          resolve(info);
        }, messageID);
      });
    },

    storeBotMessage(messageID) {
      if (!state.botMessages.has(threadID)) {
        state.botMessages.set(threadID, []);
      }
      state.botMessages.get(threadID).push(messageID);
    },

    async getUserInfo(uid) {
      return new Promise((resolve, reject) => {
        api.getUserInfo(uid, (err, data) => {
          if (err) return reject(err);
          const user = data[uid];
          resolve({ name: user.name });
        });
      });
    }
  };

  try {
    const adminUIDs = config.adminUIDs;
    
    if (adminUIDs.length === 0) {
      return await utils.sendMessage('❌ No admin UIDs are configured in config.json.');
    }
    
    const adminInfoPromises = adminUIDs.map(uid => utils.getUserInfo(uid));
    const adminInfos = await Promise.all(adminInfoPromises);
    
    let responseMessage = '👑 Bot Administrators 👑\n\n';
    
    adminInfos.forEach((info, index) => {
      responseMessage += `${index + 1}. Name: ${info.name}\n`;
      responseMessage += `   UID: ${adminUIDs[index]}\n`;
    });
    
    await utils.sendMessage(responseMessage);
    
  } catch (error) {
    console.error('Admin List error:', error);
    await utils.sendMessage('❌ Failed to fetch admin list.');
  }
};