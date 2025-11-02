const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = async function handleImageGen(api, event, args, state) {
  const { threadID, messageID, senderID } = event;

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

    cleanupFile(filePath) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (error) {
        console.error('Error cleaning up file:', error);
      }
    },

    async downloadImage(url, filePath) {
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 45000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    }
  };

  const prompt = args.slice(1).join(' ');
  if (!prompt) {
    return await utils.sendMessage('❌ Please provide a prompt: <image your image description');
  }

  try {
    await utils.sendMessage('🎨 Generating image...');

    let imagePath;
    let success = false;

    // Service 1: Pollinations AI
    try {
      console.log('Trying Pollinations AI...');
      const enhancedPrompt = prompt + ", high quality, masterpiece, no watermark, no text";
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=1024&height=1024`;
      
      imagePath = path.join(__dirname, `../temp_image_${Date.now()}.png`);
      await utils.downloadImage(imageUrl, imagePath);
      
      console.log('✅ Success with Pollinations AI');
      await sendImage(prompt, imagePath);
      success = true;
      
    } catch (error) {
      console.log('❌ Pollinations AI failed:', error.message);
    }

    // Service 2: Prodia API
    if (!success) {
      try {
        console.log('Trying Prodia API...');
        const response = await axios({
          method: 'POST',
          url: 'https://api.prodia.com/v1/sd/generate',
          headers: {
            'Content-Type': 'application/json',
            'X-Prodia-Key': 'b4a80cd4-70a8-4c1e-9c0c-8074e40f2a9e'
          },
          data: {
            prompt: prompt + ", high quality, no watermark",
            model: "dreamshaper_8_93211.safetensors [b18c8111]",
            negative_prompt: "watermark, text, signature, logo",
            steps: 25,
            cfg_scale: 7,
            seed: -1,
            upscale: true
          },
          responseType: 'stream',
          timeout: 60000
        });

        imagePath = path.join(__dirname, `../temp_image_${Date.now()}.png`);
        const writer = fs.createWriteStream(imagePath);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
        
        console.log('✅ Success with Prodia API');
        await sendImage(prompt, imagePath);
        success = true;
        
      } catch (error) {
        console.log('❌ Prodia API failed:', error.message);
      }
    }

    // Service 3: Simple Fallback
    if (!success) {
      try {
        console.log('Trying Simple Image API...');
        const imageUrl = `https://imagegen.hf.space/generate?prompt=${encodeURIComponent(prompt)}&width=1024&height=1024`;
        
        imagePath = path.join(__dirname, `../temp_image_${Date.now()}.png`);
        await utils.downloadImage(imageUrl, imagePath);
        
        console.log('✅ Success with Simple Image API');
        await sendImage(prompt, imagePath);
        success = true;
        
      } catch (error) {
        console.log('❌ Simple Image API failed:', error.message);
      }
    }

    if (!success) {
      throw new Error('All image services failed');
    }

  } catch (error) {
    console.error('All image services failed:', error);
    await utils.sendMessage(
      `❌ Image generation failed.\n\n` +
      `💡 Try:\n` +
      `• Using simpler prompts\n` +
      `• Waiting 1 minute between requests\n` +
      `• Checking your internet connection\n\n` +
      `Example: <image a beautiful sunset`
    );
  }

  async function sendImage(prompt, filePath) {
    return new Promise((resolve) => {
      api.sendMessage({
        body: `🎨 Generated: ${prompt}`,
        attachment: fs.createReadStream(filePath)
      }, threadID, (err, info) => {
        utils.cleanupFile(filePath);
        if (!err && info && info.messageID) {
          utils.storeBotMessage(info.messageID);
        }
        resolve();
      });
    });
  }
};