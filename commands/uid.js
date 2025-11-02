const fs = require('fs');

module.exports = async function handleUID(api, event, state) {
  const { threadID, messageID, senderID, messageReply, mentions } = event;

  // Utils for this command
  const utils = {
    async sendMessage(message) {
      return new Promise((resolve) => {
        api.sendMessage(message, threadID, (err, info) => {
          if (!err && info && info.messageID) {
            storeBotMessage(info.messageID);
          }
          resolve(info);
        }, messageID);
      });
    },

    storeBotMessage(messageID) {
      if (!state.botMessages.has(threadID)) {
        state.botMessages.set(threadID, []);
      }
      const threadMsgs = state.botMessages.get(threadID);
      threadMsgs.push(messageID);
      if (threadMsgs.length > 50) threadMsgs.splice(0, threadMsgs.length - 50);
    },

    async getUserInfo(uid) {
      return new Promise((resolve, reject) => {
        api.getUserInfo(uid, (err, data) => {
          if (err) return reject(err);
          const user = data[uid];
          resolve({
            name: user.name,
            profilePic: user.thumbSrc || user.profileUrl
          });
        });
      });
    }
  };

  // Command handler
  try {
    let targetID = null;
    let targetName = null;
    
    // Method 1: Reply to message
    if (messageReply && messageReply.senderID) {
      targetID = messageReply.senderID;
    }
    // Method 2: Mention
    else if (mentions && Object.keys(mentions).length > 0) {
      targetID = Object.keys(mentions)[0];
      targetName = mentions[targetID];
    }
    // Method 3: Self
    else {
      targetID = senderID;
    }

    // Get user info
    if (targetID && !targetName) {
      const userInfo = await utils.getUserInfo(targetID);
      targetName = userInfo.name;
    }

    if (targetID && targetName) {
      await utils.sendMessage(
        `👤 User Info:\n` +
        `📛 Name: ${targetName}\n` +
        `🆔 UID: ${targetID}`
      );
    } else {
      await utils.sendMessage('❌ Could not find user information.');
    }
    
  } catch (error) {
    console.error('UID command error:', error);
    api.sendMessage('❌ Failed to get user information.', threadID, messageID);
  }
};