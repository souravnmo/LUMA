const axios = require('axios');
const fs = require('fs');
const path = require('path');

// AI Engine URL - automatically switches between local and cloud
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:5000';

// Temporary directory for images
const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Active generation tracking to prevent spam
const activeGenerations = new Map();

async function cleanupTempFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log(`🗑️ Cleaned up: ${filePath}`);
    }
  } catch (error) {
    console.error('Error cleaning up file:', error);
  }
}

async function generateAI(api, event, args, state) {
  const { threadID, messageID, senderID } = event;
  
  // Check if user has active generation
  if (activeGenerations.has(senderID)) {
    return api.sendMessage(
      '⏳ Please wait for your current generation to complete.',
      threadID,
      messageID
    );
  }

  // Parse command: <gen img <prompt> or <gen txt <prompt> or <gen <prompt>
  let mode = 'img'; // Default to image
  let prompt = '';

  if (args.length < 2) {
    return api.sendMessage(
      '❌ Usage:\n<gen img <prompt> - Generate image\n<gen txt <prompt> - Generate text\n<gen <prompt> - Generate image (default)',
      threadID,
      messageID
    );
  }

  // Check if first arg is mode (img/txt) or part of prompt
  const firstArg = args[1].toLowerCase();
  if (firstArg === 'img' || firstArg === 'image') {
    mode = 'img';
    prompt = args.slice(2).join(' ');
  } else if (firstArg === 'txt' || firstArg === 'text') {
    mode = 'txt';
    prompt = args.slice(2).join(' ');
  } else {
    // Default to image, entire args is prompt
    mode = 'img';
    prompt = args.slice(1).join(' ');
  }

  if (!prompt.trim()) {
    return api.sendMessage(
      '❌ Please provide a prompt for generation.',
      threadID,
      messageID
    );
  }

  // Mark user as having active generation
  activeGenerations.set(senderID, true);

  try {
    // Send initial message
    const loadingMsg = mode === 'img' 
      ? `🎨 Generating image for: "${prompt}"\n⏳ This may take 30-60 seconds...`
      : `💬 Generating text response...\n⏳ Please wait...`;
    
    api.sendMessage(loadingMsg, threadID, messageID);

    // Call Python AI Engine
    const response = await axios.post(`${AI_ENGINE_URL}/generate`, {
      mode: mode,
      prompt: prompt
    }, {
      timeout: 420000 // 7 minutes timeout
    });

    if (mode === 'txt') {
      // Text generation - send response directly
      const textResponse = response.data.response;
      api.sendMessage(
        `💬 AI Response:\n\n${textResponse}`,
        threadID,
        messageID
      );
    } else {
      // Image generation - decode base64 and send
      const imageBase64 = response.data.image;
      const imageBuffer = Buffer.from(imageBase64, 'base64');
      
      // Save to temporary file
      const timestamp = Date.now();
      const tempFileName = `gen_${senderID}_${timestamp}.png`;
      const tempFilePath = path.join(TEMP_DIR, tempFileName);
      
      await fs.promises.writeFile(tempFilePath, imageBuffer);
      
      // Send image
      const stream = fs.createReadStream(tempFilePath);
      api.sendMessage(
        {
          body: `🎨 Generated: "${prompt}"`,
          attachment: stream
        },
        threadID,
        async (err) => {
          // Clean up immediately after sending
          await cleanupTempFile(tempFilePath);
        },
        messageID
      );
    }

  } catch (error) {
    console.error('❌ Generation error:', error.message);
    
    let errorMsg = '❌ Generation failed. ';
    
    if (error.code === 'ECONNREFUSED') {
      errorMsg += 'AI Engine is not running. Please start it first:\npython ai_engine.py';
    } else if (error.response) {
      errorMsg += error.response.data?.error || error.message;
    } else if (error.code === 'ECONNABORTED') {
      errorMsg += 'Request timeout. The generation is taking too long.';
    } else {
      errorMsg += error.message;
    }
    
    api.sendMessage(errorMsg, threadID, messageID);
  } finally {
    // Remove user from active generations
    activeGenerations.delete(senderID);
  }
}

// Cleanup old temp files on startup
function cleanupOldTempFiles() {
  try {
    if (!fs.existsSync(TEMP_DIR)) return;
    
    const files = fs.readdirSync(TEMP_DIR);
    const now = Date.now();
    
    files.forEach(file => {
      const filePath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtimeMs;
      
      // Delete files older than 1 hour
      if (fileAge > 3600000) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Cleaned up old file: ${file}`);
      }
    });
  } catch (error) {
    console.error('Error cleaning old temp files:', error);
  }
}

// Run cleanup on module load
cleanupOldTempFiles();

// Periodic cleanup every 30 minutes
setInterval(cleanupOldTempFiles, 1800000);

module.exports = generateAI;