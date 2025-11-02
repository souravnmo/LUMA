const axios = require('axios');
const fs = require('fs');
const path = require('path');
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:5000';

module.exports = async function handleTTS(api, event, args, state) {
  const { threadID, messageID } = event;
  const text = args.slice(1).join(' ').trim();
  if (!text) {
    return api.sendMessage('❌ Usage: <tts your text', threadID, messageID);
  }

  api.setMessageReaction('⏳', messageID, () => {}, true);

  try {
    const res = await axios.post(`${AI_ENGINE_URL}/tts`, {
      text: text,
      voice: 'hi-IN-SwaraNeural'
    }, { responseType: 'arraybuffer', timeout: 120000 });

    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const filePath = path.join(tempDir, `tts_${Date.now()}.mp3`);
    fs.writeFileSync(filePath, Buffer.from(res.data));

    api.sendMessage({ attachment: fs.createReadStream(filePath) }, threadID, () => {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }, messageID);

    api.setMessageReaction('✅', messageID, () => {}, true);
  } catch (e) {
    api.setMessageReaction('❌', messageID, () => {}, true);
    api.sendMessage('❌ TTS failed.', threadID, messageID);
  }
};




