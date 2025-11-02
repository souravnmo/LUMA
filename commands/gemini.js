const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config.json');

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// Call Gemini API directly
async function callGemini(prompt) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp"
    });
    
    const safePrompt = `Please respond to the following user query in a helpful and appropriate way. 
    If the user asks for image generation, politely explain that you're a text-based AI and cannot create images, but offer to describe something instead.
    
    User query: "${prompt}"
    
    Your response:`;
    
    const result = await model.generateContent(safePrompt, {
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 1000,
      }
    });
    
    const response = await result.response;
    const text = response.text();
    
    // Clean up AI references
    text = text.replace(/\b(ai|bot|assistant|machine|artificial intelligence|language model)\b/gi, '');
    text = text.replace(/as an ai/gi, '');
    text = text.replace(/I'm an ai/gi, 'I');
    text = text.replace(/I am an ai/gi, 'I');
    
    return text.trim() || null;
    
  } catch (error) {
    console.error('Gemini API error:', error);
    
    // Fallback to basic model
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash"
      });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      return text.trim() || null;
    } catch (fallbackError) {
      console.error('Gemini fallback error:', fallbackError);
      return null;
    }
  }
}

module.exports = async function handleGemini(api, event, args, state) {
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

    checkCooldown() {
      const now = Date.now();
      const lastUsed = state.geminiCooldown?.get(senderID) || 0;
      if (now - lastUsed < 5000) {
        return Math.ceil((5000 - (now - lastUsed)) / 1000);
      }
      if (!state.geminiCooldown) state.geminiCooldown = new Map();
      state.geminiCooldown.set(senderID, now);
      return 0;
    }
  };

  // Cooldown check
  const cooldown = utils.checkCooldown();
  if (cooldown > 0) {
    return await utils.sendMessage(`⏳ Please wait ${cooldown} seconds between Gemini requests.`);
  }

  const prompt = args.slice(1).join(' ');
  if (!prompt) {
    return await utils.sendMessage('❌ Please provide a prompt: <gemini your prompt here');
  }

  try {
    await utils.sendMessage('🔄 Generating with Gemini...');

    const response = await callGemini(prompt);
    
    if (response) {
      await utils.sendMessage(`🤖 Gemini:\n\n${response}`);
    } else {
      await utils.sendMessage('❌ Gemini request failed. Please try a different prompt.');
    }
    
  } catch (error) {
    console.error('Gemini error:', error);
    await utils.sendMessage('❌ Gemini request failed. Please try a different prompt.');
  }
};