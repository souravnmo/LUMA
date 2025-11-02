module.exports = async function handleDeleteBotMessages(api, event, state) {
  const { threadID, messageID, senderID, messageReply } = event;

  const utils = {
    async sendMessage(message) {
      return new Promise((resolve) => {
        api.sendMessage(message, threadID, (err, info) => {
          resolve(info);
        }, messageID);
      });
    },

    storeBotMessage(messageID) {
      if (!state.botMessages.has(threadID)) {
        state.botMessages.set(threadID, []);
      }
      state.botMessages.get(threadID).push(messageID);
    }
  };

  // Check if replying to a message
  if (!messageReply) {
    return await utils.sendMessage('❌ Please reply to my message with `<u` to delete it.');
  }

  // Check if the replied message is from the bot
  const threadBotMessages = state.botMessages.get(threadID) || [];
  const isBotMessage = threadBotMessages.includes(messageReply.messageID);
  
  if (!isBotMessage) {
    return await utils.sendMessage('❌ You can only delete my messages.');
  }

  try {
    // Delete the specific bot message
    await new Promise((resolve, reject) => {
      api.unsendMessage(messageReply.messageID, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Remove from stored messages
    const updatedMessages = threadBotMessages.filter(msgID => msgID !== messageReply.messageID);
    state.botMessages.set(threadID, updatedMessages);

    // Send confirmation (not stored so it can't be deleted)
    api.sendMessage('✅ Message deleted.', threadID, messageID);
  } catch (error) {
    await utils.sendMessage('❌ Failed to delete the message.');
  }
};