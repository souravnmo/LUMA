const config = require('../config');

module.exports = async function handleAdminOnly(api, event, args, state) {
  const { threadID, messageID, senderID } = event;

  // Utils for this command
  const utils = {
    sendMessage(message) {
      api.sendMessage(message, threadID, messageID);
    },

    isAdmin() {
      return config.adminUIDs.includes(senderID);
    }
  };

  // Command handler
  if (!utils.isAdmin()) {
    return utils.sendMessage('❌ Only admins can use this command');
  }

  const mode = args[1]?.toLowerCase();

  if (mode === 'on') {
    state.adminOnlyMode.set(threadID, true);
    utils.sendMessage('🔒 Admin-only mode enabled. Only admins can use commands.');
  } else if (mode === 'off') {
    state.adminOnlyMode.set(threadID, false);
    utils.sendMessage('🔓 Admin-only mode disabled. All users can use commands.');
  } else {
    utils.sendMessage('❌ Usage: <adminonly on|off');
  }
};