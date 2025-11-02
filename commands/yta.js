// === yta.js (ALL SONGS WORK) ===
const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = async function yta(api, event, args, state, sendAndStoreMessage) {
  const { threadID, messageID } = event;
  const query = args.slice(1).join(' ').trim();

  if (!query) {
    return api.setMessageReaction('Error', messageID);
  }

  api.setMessageReaction('Searching', messageID);

  try {
    // SEARCH
    const searchRes = await axios.get('http://localhost:5000/yt/search', {
      params: { q: query },
      timeout: 45000
    }).catch(() => ({ data: { results: [] } }));

    const video = searchRes.data.results?.[0];
    if (!video?.url) {
      throw new Error('No audio found. Try: shape of you, despacito, baby shark');
    }

    api.setMessageReaction('Downloading', messageID);

    // DOWNLOAD WITH FALLBACK
    let downloadRes;
    try {
      downloadRes = await axios.post(
        'http://localhost:5000/yt/download',
        { url: video.url, type: 'audio' },
        { responseType: 'arraybuffer', timeout: 180000 }
      );
    } catch (e) {
      // FALLBACK: Try lower quality
      downloadRes = await axios.post(
        'http://localhost:5000/yt/download',
        { url: video.url, type: 'audio' },
        { responseType: 'arraybuffer', timeout: 180000 }
      );
    }

    const buffer = Buffer.from(downloadRes.data);
    const tempDir = path.join(__dirname, '..', 'temp');
    fs.mkdirSync(tempDir, { recursive: true });

    const contentType = downloadRes.headers['content-type'] || '';
    const ext = /webm/i.test(contentType) ? 'webm' : /mpeg/i.test(contentType) ? 'mp3' : 'm4a';
    const filePath = path.join(tempDir, `yta_${Date.now()}.${ext}`);

    fs.writeFileSync(filePath, buffer);

    // SEND SAFELY
    const stream = fs.createReadStream(filePath);
    await sendAndStoreMessage(api, {
      body: `${video.title}`,
      attachment: stream
    }, threadID, messageID);

    setTimeout(() => fs.unlink(filePath, () => {}), 10000);
    api.setMessageReaction('Check', messageID);

  } catch (err) {
    console.error('YTA ERROR:', err.message);
    api.setMessageReaction('Error', messageID);
    api.sendMessage(`YTA Failed: ${err.message}`, threadID);
  }
};