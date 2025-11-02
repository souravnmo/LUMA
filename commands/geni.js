const axios = require('axios');
const fs = require('fs');
const path = require('path');

const AI_ENGINE_LITE_URL = process.env.AI_ENGINE_LITE_URL || 'http://localhost:5001';
const TEMP_DIR = path.join(__dirname, '../temp');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const activeGenerations = new Map();

async function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

async function generateImage(api, event, args, state) {
  const { threadID, messageID, senderID } = event;
  
  if (activeGenerations.has(senderID)) {
    return api.setMessageReaction('⏳', messageID, () => {}, true);
  }

  const prompt = args.slice(1).join(' ');
  
  if (!prompt.trim()) {
    return api.sendMessage('❌ Usage: <geni <prompt>', threadID, messageID);
  }

  activeGenerations.set(senderID, true);
  api.setMessageReaction('⏳', messageID, () => {}, true);

  try {
    const response = await axios.post(`${AI_ENGINE_LITE_URL}/generate`, {
      mode: 'img',
      prompt: prompt
    }, { timeout: 120000 });

    const imageBase64 = response.data.image;
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    
    const timestamp = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `geni_${senderID}_${timestamp}.png`);
    
    await fs.promises.writeFile(tempFilePath, imageBuffer);
    
    api.setMessageReaction('✅', messageID, () => {}, true);
    
    const stream = fs.createReadStream(tempFilePath);
    api.sendMessage(
      { attachment: stream },
      threadID,
      async (err) => {
        await cleanupTempFile(tempFilePath);
      },
      messageID
    );

  } catch (error) {
    console.error('Image generation error:', error.message);
    api.setMessageReaction('❌', messageID, () => {}, true);
    
    let errorMsg = '❌ Fast image generation failed. ';
    if (error.code === 'ECONNREFUSED') {
      errorMsg += 'AI Lite Engine not running. Start: python ai_engine_lite.py';
    } else {
      errorMsg += error.response?.data?.error || error.message;
    }
    api.sendMessage(errorMsg, threadID, messageID);
  } finally {
    activeGenerations.delete(senderID);
  }
}

module.exports = generateImage;