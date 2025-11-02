// ===============================================================
// agi.js – FULL FILE (thinking messages removed)
// ===============================================================

const { GoogleGenAI } = require('@google/genai');
const config = require('../config.json');

// Initialize SDK
const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

// Call Gemini 2.5 Flash for neutral, human-like responses
async function callGemini(prompt, conversationHistory = []) {
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const model = 'gemini-2.5-flash'; // Free-tier model ID
      
      // Build context
      let context = '';
      if (conversationHistory && conversationHistory.length > 0) {
        context += "Previous conversation:\n";
        conversationHistory.forEach(msg => {
          const role = msg.role === 'user' ? 'User' : 'You';
          context += `${role}: ${msg.content}\n`;
        });
        context += "\n";
      }
      
      // Clean prompt
      let cleanPrompt = prompt.replace(/\b(gemini|ai|bot|assistant|machine|artificial intelligence|language model)\b/gi, '');
      const promptText = `${context}User: ${cleanPrompt}\n\nYou: `;
      
      const response = await ai.models.generateContent({
        model,
        contents: [{ text: promptText }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 64,
          maxOutputTokens: 150, // Single concise response
        }
      });
      
      // Extract text from SDK response
      const text = response.candidates[0]?.content?.parts[0]?.text?.trim() || "Sorry, couldn't get that.";
      
      // Clean response
      let cleanedText = text
        .replace(/\b(gemini|ai|bot|assistant|machine|artificial intelligence|language model)\b/gi, '')
        .replace(/as an ai/gi, '')
        .replace(/I'm an ai/gi, 'I')
        .replace(/I am an ai/gi, 'I');
      
      return cleanedText || "Sorry, couldn't get that.";
      
    } catch (error) {
      lastError = error;
      console.error(`Gemini 2.5 Flash attempt ${attempt} failed:`, error.message);
      
      // If overload (503), retry with backoff
      if (error.status === 503 && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // 2s, 4s, up to 5s
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Non-retryable error or max attempts
      break;
    }
  }
  
  console.error('Gemini 2.5 Flash final error after retries:', lastError);
  
  // Fallback responses
  const fallbacks = [
    "Hmm, something went wrong. Try again?",
    "I'm having trouble understanding that.",
    "Let's try that again.",
    "Oops, error on my end."
  ];
  
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

module.exports = async function handleAGI(api, event, args, state) {
  const { threadID, messageID, senderID, body } = event;

  const utils = {
    async sendMessage(message) {
      return new Promise((resolve) => {
        api.sendMessage(message, threadID, (err, info) => {
          if (!err && info && info.messageID) {
            console.log('Bot message sent:', info.messageID);
            this.storeBotMessage(info.messageID);
          } else if (err) {
            console.error('Send error:', err);
          }
          resolve(info);
        }, messageID);
      });
    },

    storeBotMessage(messageID) {
      if (!state.botMessages.has(threadID)) state.botMessages.set(threadID, []);
      state.botMessages.get(threadID).push(messageID);
    },

    checkCooldown() {
      const now = Date.now();
      const lastUsed = state.agiCooldown?.get(senderID) || 0;
      if (now - lastUsed < 3000) return true;
      if (!state.agiCooldown) state.agiCooldown = new Map();
      state.agiCooldown.set(senderID, now);
      return false;
    }
  };

  console.log('AGI command received:', body);
  
  const prompt = args.slice(1).join(' ');
  if (!prompt) {
    return await utils.sendMessage(
      'Type "<agi your_message" to start chatting!\n\nTip: Reply to me to keep going—no command needed.'
    );
  }

  if (utils.checkCooldown()) {
    return await utils.sendMessage('Hold on...');
  }

  try {
    // Removed: const thinkingMsg = await utils.sendMessage('Thinking...');
    
    const response = await callGemini(prompt, []);
    const sentMsg = await utils.sendMessage(response);
    
    const storedMessageIDs = [];
    // Removed thinkingMsg ID
    if (sentMsg?.messageID) storedMessageIDs.push(sentMsg.messageID);
    
    if (storedMessageIDs.length > 0) {
      const isGroupChat = threadID.length > 15;
      const conversationData = {
        started: Date.now(),
        messageIDs: storedMessageIDs,
        userID: senderID,
        isGroupChat,
        conversationHistory: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: response }
        ],
        allAGIMessageIDs: [...storedMessageIDs],
        threadID,
        isActive: true,
        botUID: api.getCurrentUserID()
      };
      
      state.agiConversations.set(threadID, conversationData);
      console.log('AGI convo started:', threadID);
      
      setTimeout(() => {
        if (state.agiConversations.has(threadID)) {
          state.agiConversations.delete(threadID);
          console.log('AGI convo cleaned up');
        }
      }, 30 * 60 * 1000);
    }
    
  } catch (error) {
    console.error('AGI error:', error);
    await utils.sendMessage('Something went wrong. Try again?');
  }
};

// Handle conversation continuation
module.exports.handleAGIConversation = async function handleAGIConversation(api, event, convoData, state) {
  const { threadID, messageID, senderID, body } = event;
  
  console.log('AGI CONVO HANDLER');
  
  if (!convoData.isGroupChat) return false;

  const utils = {
    async sendMessage(message) {
      return new Promise((resolve) => {
        api.sendMessage(message, threadID, (err, info) => {
          if (!err && info && info.messageID) {
            console.log('Reply sent:', info.messageID);
            this.storeBotMessage(info.messageID);
          }
          resolve(info);
        }, messageID);
      });
    },

    storeBotMessage(messageID) {
      if (!state.botMessages.has(threadID)) state.botMessages.set(threadID, []);
      state.botMessages.get(threadID).push(messageID);
    },

    checkCooldown() {
      const now = Date.now();
      const lastUsed = state.agiCooldown?.get(senderID) || 0;
      if (now - lastUsed < 3000) return true;
      if (!state.agiCooldown) state.agiCooldown = new Map();
      state.agiCooldown.set(senderID, now);
      return false;
    }
  };

  if (utils.checkCooldown()) return await utils.sendMessage('Wait a sec...');

  try {
    convoData.started = Date.now();
    convoData.isActive = true;
    
    // Removed: const thinkingMsg = await utils.sendMessage('Thinking...');
    
    const response = await callGemini(body, convoData.conversationHistory || []);
    const sentMsg = await utils.sendMessage(response);
    
    const newMessageIDs = [];
    // Removed thinkingMsg ID
    if (sentMsg?.messageID) newMessageIDs.push(sentMsg.messageID);
    
    if (newMessageIDs.length > 0) {
      const updatedAGIMessageIDs = [...(convoData.allAGIMessageIDs || []), ...newMessageIDs];
      const updatedMessageIDs = [...convoData.messageIDs, ...newMessageIDs];
      const updatedHistory = [
        ...convoData.conversationHistory,
        { role: 'user', content: body },
        { role: 'assistant', content: response }
      ];
      
      const finalHistory = updatedHistory.length > 10 ? updatedHistory.slice(-10) : updatedHistory;
      const finalMessageIDs = updatedMessageIDs.length > 50 ? updatedMessageIDs.slice(-50) : updatedMessageIDs;
      const finalAGIMessageIDs = updatedAGIMessageIDs.length > 50 ? updatedAGIMessageIDs.slice(-50) : updatedAGIMessageIDs;
      
      state.agiConversations.set(threadID, {
        ...convoData,
        messageIDs: finalMessageIDs,
        conversationHistory: finalHistory,
        allAGIMessageIDs: finalAGIMessageIDs,
        isActive: true
      });
      console.log('AGI convo updated');
    }
    
    return true;
    
  } catch (error) {
    console.error('AGI Convo error:', error);
    await utils.sendMessage('Something went wrong.');
    return true;
  }
};

module.exports.shouldHandleAsAGIConversation = function shouldHandleAsAGIConversation(event, state) {
  const { threadID, messageReply } = event;
  
  if (!state.agiConversations.has(threadID)) return false;
  
  const convoData = state.agiConversations.get(threadID);
  if (!convoData.isGroupChat || !convoData.isActive || !messageReply) return false;
  
  return messageReply.senderID === convoData.botUID;
};