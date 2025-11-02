const axios = require('axios');

// Admin-only unfiltered image generation via AI engine (mode: img)
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:5000';

module.exports = async function handleNSFI(api, event, args, state, config) {
  const { threadID, messageID, senderID } = event;

  if (!config.adminUIDs.includes(senderID)) {
    return api.sendMessage('❌ Admin only command.', threadID, messageID);
  }

  const prompt = args.slice(1).join(' ').trim();
  if (!prompt) {
    return api.sendMessage('❌ Usage: <nsfi prompt', threadID, messageID);
  }

  api.setMessageReaction('⏳', messageID, () => {}, true);

  try {
    const res = await axios.post(`${AI_ENGINE_URL}/generate`, {
      mode: 'img',
      prompt
    }, { timeout: 480000 }); // 8 min

    const b64 = res.data && res.data.image;
    if (!b64) throw new Error('No image returned');

    const buffer = Buffer.from(b64, 'base64');
    api.sendMessage({ body: '✅ Generated', attachment: buffer }, threadID, () => {}, messageID);
    api.setMessageReaction('✅', messageID, () => {}, true);
  } catch (e) {
    api.setMessageReaction('❌', messageID, () => {}, true);
    api.sendMessage('❌ Generation failed.', threadID, messageID);
  }
};




