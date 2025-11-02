module.exports = async function handleHelp(api, event, state, config) {
  const { threadID, messageID, senderID, body } = event;

  // Check for specific help command
  const args = body.slice(1).trim().split(' ');
  if (args[1] && args[1].toLowerCase() === 'word') {
    return api.sendMessage(
      '🎮 Word Game Commands:\n' +
      '• <word or <word game - Create game lobby\n' +
      '• <join - Join game\n' +
      '• <wordstart - Start game\n' +
      '• <stop - Stop game\n' +
      '• <word your_word - Submit word during game',
      threadID,
      messageID
    );
  }

  // Check if config and adminUIDs exist
  const isAdmin = config && config.adminUIDs && config.adminUIDs.includes(senderID);

  const helpMessage = `
🤖 BOT COMMANDS MENU 🤖

🎮 GAMES
• <word - Word chain game
• <join - Join word game
• <wordstart - Start word game
• <stop - Stop word game
• <ttt @user - Tic Tac Toe
• <pair - Random pairing

🎵 MEDIA & MUSIC
• <play <song> - Play music (SoundCloud)
• <reels <url> - Download FB/IG reels
• <yta <song> - YouTube audio (direct download)
• <ytv <video> - YouTube video (10 options)
• <spotify <song> - Download music from Spotify
• <v2a - Convert video to audio (reply to video)
• <pin <query> - Search Pinterest images

🤖 AI & CHAT
• <ai <message> - Chat with AI
• <agi <question> - Ask AGI
• <geni <prompt> - Generate image
• <cinematic <prompt> - Generate cinematic AI image
• <tts (text) - Text to speech

🔧 TOOLS
• <pfp [@user] - Get profile picture
• <uid [@user] - Get user ID
• <xp [@user] - Get xp data
• <xp list - See top 10 xp holders
• <leaderboard - Chat leaderboard
• <u - Unsend bot message (reply to bot)

${isAdmin ? `
🛠️ ADMIN (You are admin)
• <adminonly on/off - Toggle admin mode
• <adminlist - Show admins
• <add (uid/reply) - Add anyone in the group
• <ban (uid/reply/mention) - Ban anyone from the group
• <kick (uid/reply/mention) - Kick anyone from the group
` : ''}
💡 TIP: After starting an AI conversation with <ai, you can just reply to my messages to continue chatting!
  `;

  api.sendMessage(helpMessage, threadID, messageID);
};