// commands/qar.js
const bank = require('./bank'); // Import the bank system as requested

/**
 * You can manually add more questions here.
 * 'question': The text that will be asked.
 * 'answer': true (for 😆) or false (for 😮).
 */
const basicQuestions = [
  { question: "The sun is a star.", answer: true },
  { question: "The Earth is flat.", answer: false },
  { question: "Water boils at 100°C at sea level.", answer: true },
  { question: "Mount Everest is the tallest mountain in the solar system.", answer: false },
  { question: "Sharks are mammals.", answer: false },
  { question: "The capital of Japan is Tokyo.", answer: true },
  { question: "Bananas grow on trees.", answer: false }, // They grow on plants that look like trees
  { question: "The Great Wall of China is visible from the moon.", answer: false },
  { question: "A 'googol' is a number with 100 zeros.", answer: true },
  { question: "Australia is both a country and a continent.", answer: true },
  { question: "Venus is the hottest planet in our solar system.", answer: true },
  { question: "Mice are taller than elephants.", answer: false },
  
  { question: "The capital of Australia is Sydney.", answer: false }, // It's Canberra
  { question: "The Amazon River carries more water than any other river in the world.", answer: true },
  { question: "Africa is the only continent to be in all four hemispheres.", answer: true },
  { question: "The Sahara Desert is the largest desert in the world.", answer: false }, // Antarctica is
  { question: "Russia spans 11 time zones.", answer: true },
  { question: "The Vatican City is the smallest country in the world.", answer: true },
  { question: "Canada has more lakes than the rest of the world's lakes combined.", answer: true },
  { question: "Mount Kilimanjaro is located in Nepal.", answer: false }, // It's in Tanzania
  { question: "The capital of Brazil is Rio de Janeiro.", answer: false }, // It's Brasília
  { question: "Greenland is covered in more ice than Antarctica.", answer: false },

  // Science
  { question: "An octopus has three hearts.", answer: true },
  { question: "Humans have more than five senses.", answer: true }, // e.g., balance, temperature
  { question: "Peanuts are technically a type of nut.", answer: false }, // They are legumes
  { question: "A day on Venus is longer than a year on Venus.", answer: true },
  { question: "The human stomach acid is strong enough to dissolve razor blades.", answer: true },
  { question: "The opposite of matter is called 'dark matter'.", answer: false }, // It's antimatter
  { question: "Sound travels faster in water than in air.", answer: true },
  { question: "Gold is the hardest known natural substance.", answer: false }, // Diamond is
  { question: "A 'googol' is a number with 1,000 zeros.", answer: false }, // It's 100 zeros
  { question: "Sharks are mammals.", answer: false }, // They are fish

  // History
  { question: "The Titanic sank in 1912.", answer: true },
  { question: "Napoleon Bonaparte was famously very short.", answer: false }, // He was average height
  { question: "The 100 Years' War lasted exactly 100 years.", answer: false }, // It lasted 116 years
  { question: "Christopher Columbus was the first European to discover America.", answer: false }, // Leif Erikson
  { question: "The first U.S. President to live in the White House was George Washington.", answer: false }, // It was John Adams
  { question: "The French Revolution began in 1789.", answer: true },
  { question: "Albert Einstein failed math in school.", answer: false }, // This is a common myth
  { question: "The Great Wall of China is a single, continuous wall.", answer: false },
  { question: "The Colosseum in Rome was used for chariot racing.", answer: false }, // Circus Maximus was
  { question: "The Statue of Liberty was a gift to the USA from Spain.", answer: false }, // It was from France

  // Arts & Culture
  { question: "The Mona Lisa was painted by Michelangelo.", answer: false }, // Leonardo da Vinci
  { question: "The 'Harry Potter' series consists of eight books.", answer: false }, // Seven books
  { question: "The Eiffel Tower was originally intended to be a temporary structure.", answer: true },
  { question: "The song 'Smells Like Teen Spirit' is by the band Pearl Jam.", answer: false }, // Nirvana
  { question: "In Greek mythology, Zeus is the king of the gods.", answer: true },
  { question: "The author of '1984' is George Orwell.", answer: true },
  { question: "The currency of Japan is the Yen.", answer: true },
  { question: "Beethoven was deaf when he composed some of his most famous music.", answer: true },
  { question: "The original 'Star Wars' movie (A New Hope) was released in 1980.", answer: false }, // 1977
  { question: "'Bohemian Rhapsody' was released by The Beatles.", answer: false }, // Queen

  // Miscellaneous GK
  { question: "A 'baker's dozen' is 13.", answer: true },
  { question: "The QWERTY keyboard layout was designed to slow typists down.", answer: true },
  { question: "A tomato is botanically classified as a fruit.", answer: true },
  { question: "The national animal of Scotland is the unicorn.", answer: true },
  { question: "The 'Internet' and the 'World Wide Web' are the same thing.", answer: false },
  { question: "In chess, the Queen can only move horizontally and vertically.", answer: false },
  { question: "A 'quarantine' originally lasted for 40 days.", answer: true },
  { question: "The human body has 208 bones.", answer: false }, // 206
  { question: "A group of crows is called a 'murder'.", answer: true },
  { question: "Coffee beans are a type of berry.", answer: true },
  { question: "A violin has 6 strings.", answer: false }, // It has 4
  { question: "The official language of the United States is English.", answer: false }, // No official federal language
  { question: "Penguins are found at the North Pole.", answer: false }, // Southern Hemisphere only
  { question: "'O' is the most common blood type in the world.", answer: true },
  { question: "The game 'Fortnite' was developed by Nintendo.", answer: false }, // Epic Games
  { question: "The atomic number of Carbon is 6.", answer: true },
];

/**
 * Handles the <qar command.
 */
exports.handleCommand = (api, event, args, globalState) => {
  const { threadID, messageID } = event;

  if (args[1] === 'basic') {
    // 1. Select a random question
    const randomQuestion = basicQuestions[Math.floor(Math.random() * basicQuestions.length)];

    // 2. Format the "attractive" question message
    const questionMsg = `🌟 Basic T/F Quiz! 🌟
──────────────────
${randomQuestion.question}
──────────────────
React with 😆 for TRUE
React with 😮 for FALSE`;

    // 3. Send the message
    api.sendMessage(questionMsg, threadID, (err, info) => {
      if (err) return console.error('QAR Send Error:', err);

      const gameMessageID = info.messageID;
      const gameKey = `qar_basic_${gameMessageID}`;

      // 4. Store the game state so the reaction handler knows about it
      globalState.gameStates.set(gameKey, {
        type: 'qar_basic',
        messageID: gameMessageID,
        threadID: threadID,
        correctAnswer: randomQuestion.answer, // true or false
        correctEmoji: randomQuestion.answer ? '😆' : '😮',
        wrongEmoji: randomQuestion.answer ? '😮' : '😆'
      });

      // 5. Set a 20-second timer to auto-unsend the question
      setTimeout(() => {
        // Only unsend and delete if the game is still active (i.e., wasn't answered)
        if (globalState.gameStates.has(gameKey)) {
          api.unsendMessage(gameMessageID, (err) => {
            if (err) console.error('QAR Unsend Error:', err);
          });
          globalState.gameStates.delete(gameKey); // Clean up state
        }
      }, 20000); // 20 seconds
    }, messageID);
  } else {
    // This handles other <qar commands if you add them later
    api.sendMessage("Unknown <qar command. Try '<qar basic'.", threadID, messageID);
  }
};

/**
 * Handles all reactions to check for quiz answers.
 */
exports.handleReaction = async (api, event, globalState) => {
  const { messageID, reaction, userID, threadID } = event;
  
  // Create the key to check if this message is an active quiz
  const gameKey = `qar_basic_${messageID}`;

  // 1. Check if this reaction is for an active basic quiz
  if (!globalState.gameStates.has(gameKey)) {
    return; // Not a quiz, do nothing
  }

  // 2. Get the quiz data
  const game = globalState.gameStates.get(gameKey);

  // 3. Ignore reactions from the bot itself
  if (userID === api.getCurrentUserID()) {
    return;
  }

  // 4. Check if the reaction is the correct answer
  if (reaction === game.correctEmoji) {
    // --- CORRECT ANSWER ---
    
    // 1. Send congratulations message
    api.sendMessage(`🎉 Congratulations! That's correct.\n\nYou've won $100! 💰`, threadID);

    // 2. Add money to the user's bank
    // We use 'usd' as that is the correct currency key from your bank.js
    try {
      // bank.addMoney(userID, amount, currency, globalState)
      await bank.addMoney(userID, 100, 'usd', globalState);
    } catch (e) {
      console.error("QAR Bank Error:", e);
      api.sendMessage("There was an error adding your reward. Please contact an admin.", threadID);
    }

    // 3. Clean up: Unsend original question and delete game state
    api.unsendMessage(game.messageID, (err) => {
      if (err) console.error('QAR Unsend Error:', err);
    });
    globalState.gameStates.delete(gameKey);

  } else if (reaction === game.wrongEmoji) {
    // --- WRONG ANSWER ---

    // 1. Send "wrong" message
    api.sendMessage(`Oops, that's incorrect. Try again next time!`, threadID);

    // 2. Clean up: Unsend original question and delete game state
    api.unsendMessage(game.messageID, (err) => {
      if (err) console.error('QAR Unsend Error:', err);
    });
    globalState.gameStates.delete(gameKey);

  }
  // If the reaction is not 😆 or 😮, do nothing.
};