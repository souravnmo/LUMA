async function isThreadAdmin(api, threadID, uid) {
  return new Promise((resolve) => {
    api.getThreadInfo(threadID, (err, info) => {
      if (err || !info || !Array.isArray(info.adminIDs)) return resolve(false);
      const adminIds = info.adminIDs.map(a => (typeof a === 'string' ? a : a.id));
      resolve(adminIds.includes(uid));
    });
  });
}

function getTargetUID(event, args) {
  if (event.messageReply && event.messageReply.senderID) return event.messageReply.senderID;
  if (event.mentions && Object.keys(event.mentions).length > 0) return Object.keys(event.mentions)[0];
  if (args[1] && /^\d+$/.test(args[1])) return args[1];
  return null;
}

module.exports = async function addUser(api, event, args, state, config) {
  const { threadID, messageID, senderID } = event;
  const isAdmin = await isThreadAdmin(api, threadID, senderID);
  if (!isAdmin && !config.adminUIDs.includes(senderID)) {
    return api.sendMessage('❌ Only group admins can use this.', threadID, messageID);
  }

  const targetID = getTargetUID(event, args);
  if (!targetID) {
    return api.sendMessage('❌ Usage: <add (reply/mention/uid)', threadID, messageID);
  }

  api.setMessageReaction('⏳', messageID, () => {}, true);
  api.addUserToGroup(targetID, threadID, (err) => {
    if (err) {
      api.setMessageReaction('❌', messageID, () => {}, true);
      return api.sendMessage('❌ Failed to add user. I may not have permission or user cannot be added.', threadID, messageID);
    }
    api.setMessageReaction('✅', messageID, () => {}, true);
    api.sendMessage(`✅ Added ${targetID} to the group.`, threadID, messageID);
  });
};





















