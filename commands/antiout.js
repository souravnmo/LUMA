// Toggle antiout per thread; only group admins can toggle

async function isThreadAdmin(api, threadID, uid) {
  return new Promise((resolve) => {
    api.getThreadInfo(threadID, (err, info) => {
      if (err || !info || !Array.isArray(info.adminIDs)) return resolve(false);
      const adminIds = info.adminIDs.map(a => (typeof a === 'string' ? a : a.id));
      resolve(adminIds.includes(uid));
    });
  });
}

module.exports = async function antioutToggle(api, event, args, state, config) {
  const { threadID, messageID, senderID } = event;
  const sub = (args[1] || '').toLowerCase();

  const isAdmin = await isThreadAdmin(api, threadID, senderID);
  if (!isAdmin && !config.adminUIDs.includes(senderID)) {
    return api.sendMessage('❌ Only group admins can use this.', threadID, messageID);
  }

  if (!state.userSettings.has(threadID)) state.userSettings.set(threadID, {});
  const settings = state.userSettings.get(threadID);

  if (sub === 'on') {
    settings.antiout = true;
    state.userSettings.set(threadID, settings);
    return api.sendMessage('✅ Antiout enabled. I will re-add users who leave.', threadID, messageID);
  }
  if (sub === 'off') {
    settings.antiout = false;
    state.userSettings.set(threadID, settings);
    return api.sendMessage('✅ Antiout disabled.', threadID, messageID);
  }

  return api.sendMessage('❌ Usage: <antiout on | <antiout off', threadID, messageID);
};

















