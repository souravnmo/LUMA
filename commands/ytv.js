// === ytv.js (FINAL FIXED VERSION) ===
const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = async function ytv(api, event, args, state, sendAndStoreMessage) {
  const { threadID, messageID } = event;
  const query = args.slice(1).join(' ').trim();

  if (!query) {
    return api.setMessageReaction('Error', messageID);
  }

  api.setMessageReaction('Searching', messageID);

  try {
    // === 1. SEARCH ===
    const searchRes = await axios.get('http://localhost:5000/yt/search', {
      params: { q: query },
      timeout: 45000
    }).catch(() => ({ data: { results: [] } }));

    const video = searchRes.data.results?.[0];
    if (!video?.url) {
      throw new Error('No video found. Try: never gonna give you up');
    }

    api.setMessageReaction('Downloading', messageID);

    // === 2. DOWNLOAD VIDEO ===
    const downloadRes = await axios.post(
      'http://localhost:5000/yt/download',
      { url: video.url, type: 'video' },
      { responseType: 'arraybuffer', timeout: 180000 }
    );

    const buffer = Buffer.from(downloadRes.data);
    const tempDir = path.join(__dirname, '..', 'temp');
    fs.mkdirSync(tempDir, { recursive: true });

    const contentType = downloadRes.headers['content-type'] || '';
    const ext = /webm/i.test(contentType) ? 'webm' : 'mp4';
    const filePath = path.join(tempDir, `ytv_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`);

    fs.writeFileSync(filePath, buffer);

    // === 3. SEND (FIXED: NO NULL ATTACHMENT) ===
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {});

    await sendAndStoreMessage(api, {
      body: `${video.title}`,
      attachment: stream
    }, threadID, messageID);

    setTimeout(() => fs.unlink(filePath, () => {}), 8000);
    api.setMessageReaction('Check', messageID);

  } catch (err) {
    console.error('YTV ERROR:', err.message);
    api.setMessageReaction('Error', messageID);
    api.sendMessage(`YTV Failed: ${err.message}`, threadID);
  }
};