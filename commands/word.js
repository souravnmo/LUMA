const axios = require('axios');
const bank = require('./bank');

module.exports = async function handleWord(api, event, args, state) {
  const { threadID, messageID, senderID, body } = event;
  const command = args[0]?.toLowerCase();

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

    async getUserInfo(uid) {
      return new Promise((resolve, reject) => {
        api.getUserInfo(uid, (err, data) => {
          if (err) return reject(err);
          const user = data[uid];
          resolve({ name: user.name });
        });
      });
    },

    async validateWord(word, game) {
      // Check word length
      if (word.length < game.minWordLength) {
        return { valid: false, reason: `Word too short! Minimum ${game.minWordLength} letters required.` };
      }

      // Check if word was already used
      if (game.usedWords.has(word)) {
        return { valid: false, reason: "Word already used in this game!" };
      }

      // Check if word starts with correct letter
      if (game.currentWord && word[0] !== game.currentWord.slice(-1)) {
        return { valid: false, reason: `Word must start with '${game.currentWord.slice(-1).toUpperCase()}'!` };
      }

      // Basic validation
      if (word.length < 2 || !/^[a-zA-Z]+$/.test(word)) {
        return { valid: false, reason: "Please enter a valid English word (letters only)!" };
      }

      // Dictionary validation
      try {
        const response = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`, {
          timeout: 5000
        });
        
        if (response.data && response.data.length > 0) {
          return { valid: true };
        } else {
          return { valid: false, reason: `"${word}" is not a valid English word!` };
        }
      } catch (error) {
        console.log('Dictionary API failed, accepting word:', word);
        return { valid: true };
      }
    },

    updateGameDifficulty(game) {
      game.minWordLength = Math.min(10, 3 + Math.floor((game.currentRound - 1) / 3));
      game.timePerTurn = Math.max(15000, 45000 - (game.currentRound * 1500));
    }
  };

  // Route to appropriate handler
  switch (command) {
    case 'word':
      // Check if there's a second argument
      if (args[1] && args[1].toLowerCase() === 'game') {
        return await handleWordGame();
      } else if (state.wordGames.has(threadID) && state.wordGames.get(threadID).isActive) {
        // If game is active and user just typed <word with a word after it
        return await handleWordSubmission();
      } else {
        // Just <word without game or active game - create game
        return await handleWordGame();
      }
    case 'join':
      return await handleJoinGame();
    case 'wordstart':
      return await handleWordStart();
    case 'stop':
      return await handleStopGame();
    default:
      return await utils.sendMessage(
        '🎮 Word Game Commands:\n' +
        '• <word or <word game - Create game lobby\n' +
        '• <join - Join game\n' +
        '• <wordstart - Start game\n' +
        '• <stop - Stop game\n' +
        '• <word your_word - Submit word during game'
      );
  }

  async function handleWordGame() {
    if (state.wordGames.has(threadID)) {
      const game = state.wordGames.get(threadID);
      if (game.isActive) {
        return await utils.sendMessage('❌ A word game is already active! Use <stop to end it.');
      } else {
        return await utils.sendMessage('❌ Word game lobby exists! Type <join to participate.');
      }
    }

    const userInfo = await utils.getUserInfo(senderID);
    
    const gameData = {
      isActive: false,
      players: [senderID],
      playerNames: { [senderID]: userInfo.name },
      currentTurn: 0,
      usedWords: new Set(),
      currentWord: '',
      lastActivity: Date.now(),
      joinable: true,
      gameStartTime: Date.now(),
      currentRound: 1,
      minWordLength: 3,
      timePerTurn: 45000,
      eliminated: new Set(),
      turnTimeout: null,
      creator: senderID,
      joinTimeout: null
    };

    state.wordGames.set(threadID, gameData);

    // Auto-start after 60 seconds
    gameData.joinTimeout = setTimeout(() => {
      if (state.wordGames.has(threadID)) {
        startWordGame();
      }
    }, 60000);

    await utils.sendMessage(
      `🎮 WORD GAME LOBBY CREATED! 🎮\n\n` +
      `👤 Host: ${userInfo.name}\n` +
      `👥 Players: 1/8\n\n` +
      `📖 Game Rules:\n` +
      `• Start: 3-letter words, 45 seconds/turn\n` +
      `• Progressive: Word length increases each round\n` +
      `• Max: 10 letters, 15 seconds/turn\n` +
      `• Any valid English word accepted\n` +
      `• Elimination: Invalid/short words, timeout, repeats\n\n` +
      `🎯 Commands:\n` +
      `✅ <join - Join the game\n` +
      `🚀 <wordstart - Start immediately\n` +
      `⏰ Auto-start in 60 seconds...\n\n` +
      `📋 Players:\n` +
      `1. ${userInfo.name} 👑`
    );
  }

  async function handleJoinGame() {
    const game = state.wordGames.get(threadID);
    if (!game) {
      return await utils.sendMessage('❌ No word game lobby! Create one with <word');
    }

    if (!game.joinable) {
      return await utils.sendMessage('❌ Game has already started! Cannot join now.');
    }

    if (game.players.includes(senderID)) {
      return await utils.sendMessage('❌ You have already joined the game!');
    }

    if (game.players.length >= 8) {
      return await utils.sendMessage('❌ Game is full! Maximum 8 players allowed.');
    }

    const userInfo = await utils.getUserInfo(senderID);
    game.players.push(senderID);
    game.playerNames[senderID] = userInfo.name;

    const playerList = game.players.map((playerID, index) => 
      `${index + 1}. ${game.playerNames[playerID]}${playerID === game.creator ? ' 👑' : ''}`
    ).join('\n');

    const timeLeft = Math.ceil((60000 - (Date.now() - game.gameStartTime)) / 1000);

    await utils.sendMessage(
      `✅ ${userInfo.name} joined the game!\n\n` +
      `👥 Players (${game.players.length}/8):\n` +
      playerList +
      `\n\n⏰ Auto-start in ${timeLeft} seconds...`
    );
  }

  async function handleWordStart() {
    const game = state.wordGames.get(threadID);
    if (!game) {
      return await utils.sendMessage('❌ No word game lobby found!');
    }

    if (game.isActive) {
      return await utils.sendMessage('❌ Game is already running!');
    }

    if (senderID !== game.creator) {
      return await utils.sendMessage('❌ Only the game creator can start the game!');
    }

    if (game.players.length < 2) {
      return await utils.sendMessage('❌ Need at least 2 players to start!');
    }

    if (game.joinTimeout) {
      clearTimeout(game.joinTimeout);
      game.joinTimeout = null;
    }

    startWordGame();
  }

  async function handleStopGame() {
    const game = state.wordGames.get(threadID);
    if (!game) {
      return await utils.sendMessage('❌ No active word game to stop!');
    }

    if (senderID !== game.creator && !isAdmin(senderID)) {
      return await utils.sendMessage('❌ Only the game creator or admin can stop the game!');
    }

    if (game.joinTimeout) clearTimeout(game.joinTimeout);
    if (game.turnTimeout) clearTimeout(game.turnTimeout);

    await utils.sendMessage(
      `🛑 Game stopped by ${game.playerNames[senderID]}\n\n` +
      `📊 Final Stats:\n` +
      `• Rounds Completed: ${game.currentRound}\n` +
      `• Total Players: ${game.players.length}\n` +
      `• Words Used: ${game.usedWords.size}\n` +
      `• Eliminated: ${game.eliminated.size}\n\n` +
      `🎮 Use <word to start a new game!`
    );

    state.wordGames.delete(threadID);
  }

  async function handleWordSubmission() {
    const game = state.wordGames.get(threadID);
    if (!game || !game.isActive) return;

    if (!game.players.includes(senderID)) {
      return await utils.sendMessage("❌ You're not in this game! Wait for the next one.");
    }

    if (game.eliminated.has(senderID)) {
      return await utils.sendMessage("❌ You've been eliminated from this game!");
    }

    const currentPlayer = game.players[game.currentTurn];
    if (senderID !== currentPlayer) {
      const currentPlayerName = game.playerNames[currentPlayer];
      return await utils.sendMessage(`❌ It's ${currentPlayerName}'s turn! Wait for your turn.`);
    }

    const word = args[1]?.toLowerCase().trim();
    if (!word) {
      return await utils.sendMessage("❌ Please provide a word: <word your_word");
    }

    if (game.turnTimeout) {
      clearTimeout(game.turnTimeout);
      game.turnTimeout = null;
    }

    await utils.sendMessage(`🔍 Validating: "${word}"...`);

    const validation = await utils.validateWord(word, game);
    if (!validation.valid) {
      return await eliminatePlayer(senderID, validation.reason);
    }

    game.usedWords.add(word);
    game.currentWord = word;
    game.currentRound++;
    utils.updateGameDifficulty(game);

    const playerName = game.playerNames[senderID];
    let levelUpMessage = '';
    const newMinLength = game.minWordLength;
    if (newMinLength > (3 + Math.floor((game.currentRound - 2) / 3))) {
      levelUpMessage = `\n\n🎯 **LEVEL UP!** Minimum length now: ${newMinLength} letters`;
      const newTime = Math.ceil(game.timePerTurn / 1000);
      if (newTime < 45) {
        levelUpMessage += ` | Time: ${newTime}s per turn`;
      }
    }

    await utils.sendMessage(
      `✅ ${playerName}: ${word.toUpperCase()} ✓\n` +
      `📏 Length: ${word.length} letters | Round: ${game.currentRound}\n` +
      `🎯 Next letter: ${word.slice(-1).toUpperCase()}` +
      levelUpMessage
    );

    setTimeout(() => nextTurn(), 3000);
  }

  function startWordGame() {
    const game = state.wordGames.get(threadID);
    if (!game) return;

    game.isActive = true;
    game.joinable = false;
    game.currentRound = 1;
    game.minWordLength = 3;
    game.timePerTurn = 45000;

    const playerNames = game.players.map(id => game.playerNames[id]).join(', ');

    utils.sendMessage(
      `🚀 WORD GAME STARTING! 🚀\n\n` +
      `🎯 Players: ${playerNames}\n` +
      `📏 First Round: 3-letter minimum\n` +
      `⏰ Time: 45 seconds per turn\n` +
      `🤞 Good luck everyone!\n\n` +
      `_First player will be chosen randomly..._`
    );

    game.currentTurn = Math.floor(Math.random() * game.players.length);
    setTimeout(() => nextTurn(), 4000);
  }

  async function nextTurn() {
    const game = state.wordGames.get(threadID);
    if (!game || !game.isActive) return;

    let attempts = 0;
    while (attempts < game.players.length) {
      game.currentTurn = (game.currentTurn + 1) % game.players.length;
      const currentPlayer = game.players[game.currentTurn];
      if (!game.eliminated.has(currentPlayer)) break;
      attempts++;
    }

    const activePlayers = game.players.filter(player => !game.eliminated.has(player));
    if (activePlayers.length <= 1) {
      return endWordGame(activePlayers[0]);
    }

    const currentPlayer = game.players[game.currentTurn];
    const playerName = game.playerNames[currentPlayer];
    const timeLeft = Math.ceil(game.timePerTurn / 1000);
    
    let message = `🎮 ROUND ${game.currentRound} | ${playerName}'s Turn! 🎮\n\n`;
    
    if (game.currentWord) {
      message += `📝 Current Word: ${game.currentWord.toUpperCase()}\n`;
      message += `🔤 Next word must start with: ${game.currentWord.slice(-1).toUpperCase()}\n`;
    } else {
      message += `🚀 Starting word! Any ${game.minWordLength}+ letter word\n`;
    }
    
    message += `📏 Minimum Length: ${game.minWordLength} letters\n`;
    message += `⏰ Time Limit: ${timeLeft} seconds\n\n`;
    message += `💡 Reply with: <word your_word\n\n`;
    message += `❌ Elimination: Wrong letter, short word, invalid word, or timeout`;

    await utils.sendMessage(message);

    game.lastActivity = Date.now();
    game.turnTimeout = setTimeout(() => {
      eliminatePlayer(currentPlayer, "Time's up! Failed to respond in time.");
    }, game.timePerTurn);
  }

  async function eliminatePlayer(playerID, reason) {
    const game = state.wordGames.get(threadID);
    if (!game) return;

    game.eliminated.add(playerID);
    const playerName = game.playerNames[playerID];
    const remainingPlayers = game.players.length - game.eliminated.size;

    await utils.sendMessage(
      `💀 ELIMINATED: ${playerName}\n` +
      `❌ Reason: ${reason}\n\n` +
      `👥 Remaining Players: ${remainingPlayers}`
    );

    setTimeout(() => nextTurn(), 3000);
  }

  async function endWordGame(winnerID) {
    const game = state.wordGames.get(threadID);
    if (!game) return;

    const winnerName = game.playerNames[winnerID];
    const celebrations = [
      `🏆🎉 VICTORY ROYALE! 🎉🏆\n\n${winnerName} is the ULTIMATE WORD CHAMPION! 👑\n\n`,
      `🌟✨ CHAMPION CROWNED! ✨🌟\n\n${winnerName} mastered the word chain! 🏆\n\n`,
      `👑💫 WORD MASTER SUPREME! 💫👑\n\n${winnerName} conquered all challenges! 🎯\n\n`
    ];
    
    const celebration = celebrations[Math.floor(Math.random() * celebrations.length)];
    const stats = `📊 **Game Statistics:**\n` +
      `• **Total Rounds:** ${game.currentRound}\n` +
      `• **Final Level:** ${game.minWordLength}-letter words\n` +
      `• **Final Time:** ${Math.ceil(game.timePerTurn / 1000)}s per turn\n` +
      `• **Words Used:** ${game.usedWords.size}\n` +
      `• **Players:** ${game.players.length}\n\n` +
      `🎮 **Thanks for playing!** Use <word to start a new adventure!`;

    await utils.sendMessage(celebration + stats);

    // ADD THIS LINE BEFORE SENDING FINAL MESSAGE
    await bank.addMoney(api, winnerID, 500, 'dollar', state);

    state.wordGames.delete(threadID);
  }

  function isAdmin(userID) {
    const config = require('../config.json');
    return config.adminUIDs.includes(userID);
  }
};