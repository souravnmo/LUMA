module.exports = async function handleLeaderboard(api, event, state) {
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
    // Convert chatCounts to array and sort
    const sortedUsers = Array.from(state.chatCounts.entries())
      .filter(([key]) => key.startsWith(`${threadID}-`))
      .map(([key, count]) => {
        const userID = key.split('-')[1];
        return { userID, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    if (sortedUsers.length === 0) {
      return await utils.sendMessage('📊 No chat data available yet for this group.');
    }

    // Get user info for top users
    const leaderboardPromises = sortedUsers.map(async (user, index) => {
      try {
        const userInfo = await utils.getUserInfo(user.userID);
        return `${index + 1}. ${userInfo.name} - ${user.count} messages`;
      } catch (error) {
        return `${index + 1}. User ${user.userID} - ${user.count} messages`;
      }
    });

    const leaderboardLines = await Promise.all(leaderboardPromises);
    
    const message = `❇LEADERBOARD💠\n\n${leaderboardLines.join('\n')}`;
    
    await utils.sendMessage(message);
    
  } catch (error) {
    console.error('Leaderboard error:', error);
    await utils.sendMessage('❌ Failed to generate leaderboard.');
  }
};