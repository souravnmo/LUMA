// ===============================================================
// ai.js – FULL FILE (only identity regex fixed)
// ===============================================================

const { GoogleGenAI } = require('@google/genai');
const config = require('../config.json');
const axios = require('axios');

// Initialize Gemini (hidden from user)
const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

// ==============================================================
// 1. IDENTITY QUESTION HANDLER – HIGHEST PRIORITY (FORCED)
// ==============================================================
async function answerIdentityQuestion(userMessage, conversationHistory = []) {
  // ---- VALID REGEX – detects any “who made you / creator / born / কে বানিয়েছে” in 30+ languages ----
  const identityRegex = new RegExp(
    '(who\\s*(made|created|built|developed|programmed|are\\s*you|you\\s*are)|' +
    'কে\\s*(বানিয়েছে|বানাইছে|তৈরি\\s*করেছে|তুমি|আপনি)|' +
    'tui\\s*ke|ke\\s*tumi|আমাকে\\s*কে|কারা|কবে\\s*জন্ম|born|creator|developer|owner|' +
    'wer\\s*hat\\s*dich\\s*gemacht|किसने\\s*बनाया|你是誰|تخليق|تأسيس|مخترع)',
    'i'
  );

  if (!identityRegex.test(userMessage)) return null; // Not an identity question

  // -----------------------------------------------------------------
  // 1. Detect language (same as before)
  // -----------------------------------------------------------------
  const hasBangla = /[ঀ-৿]/.test(userMessage);
  const hasEnglish = /[a-zA-Z]/.test(userMessage);
  const hasArabic = /[\u0600-\u06FF]/.test(userMessage);
  const hasHindi = /[\u0900-\u097F]/.test(userMessage);
  const hasJapanese = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]/.test(userMessage);
  const hasChinese = /[\u4E00-\u9FFF]/.test(userMessage);

  let language = 'Bangla';
  if (hasEnglish && !hasBangla) language = 'English';
  if (hasArabic) language = 'Arabic';
  if (hasHindi) language = 'Hindi';
  if (hasJapanese) language = 'Japanese';
  if (hasChinese) language = 'Chinese';

  // -----------------------------------------------------------------
  // 2. System prompt – FORCE name + link + roast mood
  // -----------------------------------------------------------------
  const systemPrompt = `
You are **Luma**, a savage, witty, human-like roast bot.
You **MUST** answer identity questions with:
- "My name is Luma"
- "made by Sourav Sahani"
- Facebook link: https://www.facebook.com/sourav.sahani.313/
Speak in **${language}**, keep it short, fun, and roast the user lightly if possible.
NEVER say you are AI, bot, assistant, Google, Gemini, or any platform.
`.trim();

  // -----------------------------------------------------------------
  // 3. Build full prompt with history
  // -----------------------------------------------------------------
  let historyText = '';
  if (conversationHistory.length > 0) {
    historyText = conversationHistory
      .map(m => `${m.role === 'user' ? 'User' : 'Luma'}: ${m.content}`)
      .join('\n');
  }

  const fullPrompt = `${systemPrompt}\n\n${historyText}\nUser: ${userMessage}\nLuma:`;

  // -----------------------------------------------------------------
  // 4. Call Gemini
  // -----------------------------------------------------------------
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ text: fullPrompt }],
      generationConfig: {
        temperature: 0.95,
        maxOutputTokens: 140
      }
    });

    let reply = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    // -----------------------------------------------------------------
    // 5. SAFETY NET – force required info
    // -----------------------------------------------------------------
    const nameLink = `Luma, Sourav Sahani-এর তৈরি! চেক করো: https://www.facebook.com/sourav.sahani.313/`;

    if (!reply.toLowerCase().includes('luma')) {
      reply = reply ? `Luma বলে ডাকো! ${reply}` : 'Luma আমার নাম!';
    }
    if (!reply.toLowerCase().includes('sourav')) {
      reply = reply ? `${reply} (Sourav Sahani বানিয়েছে!)` : nameLink;
    }
    if (!reply.includes('facebook.com')) {
      reply += ` চেক করো: https://www.facebook.com/sourav.sahani.313/`;
    }

    // -----------------------------------------------------------------
    // 6. FINAL CLEANUP – remove AI mentions
    // -----------------------------------------------------------------
    reply = reply
      .replace(/\b(google|gemini|ai|bot|assistant|machine|artificial intelligence|language model|এআই|জেমিনি)\b/gi, '')
      .replace(/as an ai/gi, '')
      .replace(/I'm an ai/gi, 'আমি')
      .replace(/I am an ai/gi, 'আমি')
      .replace(/আমি একটি এআই/gi, 'আমি')
      .replace(/আমি জেমিনি/gi, 'আমি')
      .trim();

    return reply || nameLink;

  } catch (error) {
    console.error('Identity AI failed:', error);
    return `Luma আমার নাম! Sourav Sahani বানিয়েছে – https://www.facebook.com/sourav.sahani.313/`;
  }
}

// ==============================================================
// 2. DESTRUCTIVE ROAST AI (all other messages) – WITH RETRY
// ==============================================================
async function callRoastAI(prompt, conversationHistory = [], imageData = null) {
  const MAX_RETRIES = 3;
  let lastErr;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const model = 'gemini-2.5-flash';

      const context = conversationHistory.length
        ? "পূর্বের কথোপকথন:\n" +
          conversationHistory
            .map(m => `${m.role === 'user' ? 'ইউজার' : 'Luma'}: ${m.content}`)
            .join('\n') +
          "\n"
        : "";

      const cleanPrompt = prompt.replace(
        /\b(gemini|ai|bot|assistant|machine|artificial intelligence|language model)\b/gi,
        ''
      );

      const promptText = `${context}ইউজার: ${cleanPrompt}\n\nLuma: শুধু খাঁটি বাংলায়, ধ্বংসাত্মক রোস্ট, ছোট, মজার, কঠিন।`;

      let contents = [{ text: promptText }];
      if (imageData) {
        contents.push({
          inlineData: { mimeType: imageData.mimeType, data: imageData.data }
        });
      }

      const resp = await ai.models.generateContent({
        model,
        contents,
        generationConfig: {
          temperature: 1.0,
          topP: 0.95,
          topK: 64,
          maxOutputTokens: 150
        }
      });

      let text = resp.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "মাথা গরম হয়ে গেছে!";

      return text
        .replace(/\b(gemini|ai|bot|assistant|machine|artificial intelligence|language model)\b/gi, '')
        .replace(/as an ai/gi, '')
        .replace(/I'm an ai/gi, 'আমি')
        .replace(/I am an ai/gi, 'আমি');

    } catch (e) {
      lastErr = e;
      console.error(`[Roast AI] attempt ${attempt} failed:`, e.message || e);

      if (e?.status === 503 && attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** attempt, 5000);
        console.log(`[Roast AI] 503 overload – retrying in ${delay} ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      break;
    }
  }

  console.error('[Roast AI] All retries exhausted → fallback');
  const fallbacks = [
    "তোর মাথায় কি ঘাস জন্মেছে?",
    "এইটা কি প্রশ্ন না ট্রল?",
    "মাথা ঠিক আছে তো?",
    "আমার রোস্ট তোকে পোড়াবে!"
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ==============================================================
// 3. IMAGE FETCHER (for photo replies)
// ==============================================================
async function fetchImageData(imageUrl) {
  try {
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    return {
      mimeType: response.headers['content-type'] || 'image/jpeg',
      data: buffer.toString('base64')
    };
  } catch (error) {
    console.error('Image fetch failed:', error);
    return null;
  }
}

// ==============================================================
// 4. MAIN AI COMMAND HANDLER
// ==============================================================
module.exports = async function handleAI(api, event, args, state) {
  const { threadID, messageID, senderID, body, messageReply } = event;

  const utils = {
    async sendMessage(message) {
      return new Promise((resolve) => {
        api.sendMessage(message, threadID, (err, info) => {
          if (!err && info?.messageID) {
            console.log('Bot sent:', info.messageID);
            this.storeBotMessage(info.messageID);
          }
          resolve(info);
        }, messageID);
      });
    },
    storeBotMessage(id) {
      if (!state.botMessages) state.botMessages = new Map();
      if (!state.botMessages.has(threadID)) state.botMessages.set(threadID, []);
      state.botMessages.get(threadID).push(id);
    },
    checkCooldown() {
      const now = Date.now();
      if (!state.aiCooldown) state.aiCooldown = new Map();
      const last = state.aiCooldown.get(senderID) || 0;
      if (now - last < 3000) return true;
      state.aiCooldown.set(senderID, now);
      return false;
    }
  };

  const prompt = args.slice(1).join(' ').trim();

  // ==============================================================
  // PRIORITY 1: IDENTITY QUESTIONS (CHECKED FIRST)
  // ==============================================================
  const identityAnswer = await answerIdentityQuestion(prompt);
  if (identityAnswer) {
    const sentMsg = await utils.sendMessage(identityAnswer);

    const messageIDs = [sentMsg?.messageID].filter(Boolean);
    if (messageIDs.length > 0) {
      const isGroup = threadID.length > 15;
      const convoData = {
        started: Date.now(),
        messageIDs,
        userID: senderID,
        isGroupChat: isGroup,
        conversationHistory: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: identityAnswer }
        ],
        allAIMessageIDs: messageIDs,
        threadID,
        isActive: true,
        botUID: api.getCurrentUserID()
      };

      if (!state.aiConversations) state.aiConversations = new Map();
      state.aiConversations.set(threadID, convoData);

      setTimeout(() => {
        if (state.aiConversations?.has(threadID)) {
          state.aiConversations.delete(threadID);
          console.log('AI convo expired:', threadID);
        }
      }, 30 * 60 * 1000);
    }
    return;
  }

  // ==============================================================
  // NORMAL AI FLOW (if not identity)
  // ==============================================================
  if (!prompt) {
    return await utils.sendMessage(
      'একটা মজার কথা বলতে চাও? "<ai তোমার মেসেজ" লিখো!\n\n' +
      'টিপ: আমার মেসেজে রিপ্লাই করলেই কথা চালিয়ে যেতে পারবে, কমান্ড লাগবে না।'
    );
  }

  if (utils.checkCooldown()) {
    return await utils.sendMessage('একটু অপেক্ষা করো...');
  }

  try {
    let imageData = null;
    if (messageReply?.attachments?.[0]?.type === 'photo') {
      imageData = await fetchImageData(messageReply.attachments[0].url);
    }

    const aiResponse = await callRoastAI(prompt, [], imageData);
    const sentMsg = await utils.sendMessage(aiResponse);

    const messageIDs = [sentMsg?.messageID].filter(Boolean);
    if (messageIDs.length > 0) {
      const isGroup = threadID.length > 15;
      const convoData = {
        started: Date.now(),
        messageIDs,
        userID: senderID,
        isGroupChat: isGroup,
        conversationHistory: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: aiResponse }
        ],
        allAIMessageIDs: messageIDs,
        threadID,
        isActive: true,
        botUID: api.getCurrentUserID()
      };

      if (!state.aiConversations) state.aiConversations = new Map();
      state.aiConversations.set(threadID, convoData);

      setTimeout(() => {
        if (state.aiConversations?.has(threadID)) {
          state.aiConversations.delete(threadID);
        }
      }, 30 * 60 * 1000);
    }

  } catch (error) {
    console.error('AI Handler Error:', error);
    await utils.sendMessage('কিছু একটা গড়বড় হয়ে গেছে। আবার চেষ্টা করো?');
  }
};

// ==============================================================
// 5. CONVERSATION CONTINUATION (reply in thread)
// ==============================================================
module.exports.handleAIConversation = async function (api, event, convoData, state) {
  const { threadID, messageID, senderID, body, messageReply } = event;

  if (!convoData?.isGroupChat || !convoData?.isActive || !messageReply) return false;

  const utils = {
    async sendMessage(message) {
      return new Promise((resolve) => {
        api.sendMessage(message, threadID, (err, info) => {
          if (!err && info?.messageID) {
            console.log('Reply sent:', info.messageID);
            this.storeBotMessage(info.messageID);
          }
          resolve(info);
        }, messageID);
      });
    },
    storeBotMessage(id) {
      if (!state.botMessages) state.botMessages = new Map();
      if (!state.botMessages.has(threadID)) state.botMessages.set(threadID, []);
      state.botMessages.get(threadID).push(id);
    },
    checkCooldown() {
      const now = Date.now();
      if (!state.aiCooldown) state.aiCooldown = new Map();
      const last = state.aiCooldown.get(senderID) || 0;
      if (now - last < 3000) return true;
      state.aiCooldown.set(senderID, now);
      return false;
    }
  };

  // PRIORITY: Identity in conversation
  const identityAnswer = await answerIdentityQuestion(body, convoData.conversationHistory || []);
  if (identityAnswer) {
    const sentMsg = await utils.sendMessage(identityAnswer);
    const newIDs = [sentMsg?.messageID].filter(Boolean);

    if (newIDs.length > 0) {
      const updatedHistory = [
        ...convoData.conversationHistory,
        { role: 'user', content: body },
        { role: 'assistant', content: identityAnswer }
      ].slice(-10);

      const updatedMessageIDs = [...convoData.messageIDs, ...newIDs].slice(-50);
      const updatedAIMessageIDs = [...(convoData.allAIMessageIDs || []), ...newIDs].slice(-50);

      const updatedConvo = {
        ...convoData,
        messageIDs: updatedMessageIDs,
        conversationHistory: updatedHistory,
        allAIMessageIDs: updatedAIMessageIDs,
        isActive: true
      };

      state.aiConversations.set(threadID, updatedConvo);
    }
    return true;
  }

  // Normal continuation
  if (utils.checkCooldown()) {
    await utils.sendMessage('একটু অপেক্ষা করো...');
    return true;
  }

  try {
    let imageData = null;
    if (messageReply?.attachments?.[0]?.type === 'photo') {
      imageData = await fetchImageData(messageReply.attachments[0].url);
    }

    const aiResponse = await callRoastAI(body, convoData.conversationHistory || [], imageData);
    const sentMsg = await utils.sendMessage(aiResponse);

    const newIDs = [sentMsg?.messageID].filter(Boolean);
    if (newIDs.length > 0) {
      const updatedHistory = [
        ...convoData.conversationHistory,
        { role: 'user', content: body },
        { role: 'assistant', content: aiResponse }
      ].slice(-10);

      const updatedMessageIDs = [...convoData.messageIDs, ...newIDs].slice(-50);
      const updatedAIMessageIDs = [...(convoData.allAIMessageIDs || []), ...newIDs].slice(-50);

      const updatedConvo = {
        ...convoData,
        messageIDs: updatedMessageIDs,
        conversationHistory: updatedHistory,
        allAIMessageIDs: updatedAIMessageIDs,
        isActive: true
      };

      state.aiConversations.set(threadID, updatedConvo);
    }
    return true;

  } catch (error) {
    console.error('AI Convo Error:', error);
    await utils.sendMessage('কিছু একটা গড়বড় হয়ে গেছে।');
    return true;
  }
};

// ==============================================================
// 6. SHOULD HANDLE AS CONVERSATION?
// ==============================================================
module.exports.shouldHandleAsAIConversation = function (event, state) {
  const { threadID, messageReply } = event;
  if (!state.aiConversations?.has(threadID)) return false;
  const convo = state.aiConversations.get(threadID);
  return convo.isGroupChat && convo.isActive && messageReply?.senderID === convo.botUID;
};