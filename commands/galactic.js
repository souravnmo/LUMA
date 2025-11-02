// === commands/galactic.js ===
const bank = require('./bank');

// The single key to track the continuous game state in globalState.gameStates
// We use the threadID so only one game can run per thread.
const GAME_KEY_PREFIX = 'galactic_game_';

/**
 * Manually defined Galactic Events (50+).
 * 'actionType': 'reaction' or 'reply'
 * 'input': The exact emoji (for reaction) or keyword (for reply)
 */
const EVENT_POOL = [
    // --- Reaction Events (Emoji Answer) ---
    { event: '🌌 WORMHOLE JUMP', info: 'Rapid FTL calculations needed! Verify the route now.', actionType: 'reaction', action: 'React 🚀 to confirm jump!', input: '🚀' },
    { event: '🚨 SHIELD FAILURE', info: 'Meteoroid impact imminent! Emergency shields required.', actionType: 'reaction', action: 'React 🛡️ to activate shields!', input: '🛡️' },
    { event: '💰 ASTEROID MINING', info: 'Found a rich gold asteroid! Claim it before pirates arrive.', actionType: 'reaction', action: 'React ✨ to start drilling!', input: '✨' },
    { event: '🛰️ ALIEN SIGNAL', info: 'A complex data packet is broadcasting from Proxima B.', actionType: 'reaction', action: 'React 👽 to decode the signal!', input: '👽' },
    { event: '🛠️ ENGINE OVERHEAT', info: 'The main reactor is spiking temperature. Coolant flush!', actionType: 'reaction', action: 'React 🧊 to cool down the core!', input: '🧊' },
    { event: '🌑 LUNAR LANDING', info: 'Preparing to touch down on the Moon. Gravity check is nominal.', actionType: 'reaction', action: 'React 🌕 for a soft landing!', input: '🌕' },
    { event: '💫 NEBULA TRAP', info: 'We have entered a beautiful but dangerous dust cloud. Navigate carefully.', actionType: 'reaction', action: 'React 🧭 to navigate out!', input: '🧭' },
    { event: '☀️ SOLAR FLARE', info: 'Massive X-ray burst detected! Raise the heat shields!', actionType: 'reaction', action: 'React 🔥 for full shield strength!', input: '🔥' },
    { event: '🧪 STRANGE LIFEFORM', info: 'A new bioluminescent creature is floating by. Take a sample!', actionType: 'reaction', action: 'React 🔬 to analyze the sample!', input: '🔬' },
    { event: '🔌 POWER DRAIN', info: 'A malfunction is draining all power from non-essential systems.', actionType: 'reaction', action: 'React 🔋 to reroute power!', input: '🔋' },
    { event: '☄️ COMET DANGER', info: 'A fast-moving comet is on a collision course. Evasive maneuver!', actionType: 'reaction', action: 'React 📉 for a quick dive!', input: '📉' },
    { event: '🌀 SPACE VORTEX', info: 'A temporal anomaly has opened ahead. Proceed with caution.', actionType: 'reaction', action: 'React ⏳ to stabilize the anomaly!', input: '⏳' },
    { event: '💬 INTERSTELLAR CHAT', info: 'An ancient language is detected on a secure channel. Respond correctly!', actionType: 'reaction', action: 'React 🗣️ to reply!', input: '🗣️' },
    { event: '🔑 ABANDONED SHIP', info: 'A derelict ship floats nearby. Search for survivors or loot?', actionType: 'reaction', action: 'React 📦 to loot the cargo!', input: '📦' },
    { event: '🧊 ICE GIANT', info: 'We are approaching Uranus. Record the atmospheric composition.', actionType: 'reaction', action: 'React 📝 to take notes!', input: '📝' },
    { event: '👾 BUG IN SYSTEM', info: 'Critical error in the navigation system. A rapid patch is required.', actionType: 'reaction', action: 'React 💻 to apply the patch!', input: '💻' },
    { event: '💸 GALACTIC BARTER', info: 'A trade ship is offering rare element-115. Accept the deal?', actionType: 'reaction', action: 'React 👍 to accept the trade!', input: '👍' },
    { event: '🌪️ ION STORM', info: 'Heavy radiation burst. Power down all sensitive equipment!', actionType: 'reaction', action: 'React 🛑 to shut down!', input: '🛑' },
    { event: '🗺️ NEW GALAXY', info: 'We have mapped a previously unknown galaxy. Name it!', actionType: 'reaction', action: 'React 📍 to mark the new map!', input: '📍' },
    { event: '🍎 SPACE GARDEN', info: 'The hydroponics bay is ready for harvest. Collect the food!', actionType: 'reaction', action: 'React 🌱 to collect the harvest!', input: '🌱' },

    // --- Reply Events (Keyword Answer) ---
    { event: '🟠 MARS ORBIT', info: 'Approaching the Red Planet. Should we deploy rovers or orbit?', actionType: 'reply', action: 'Reply `ROVER` or `ORBIT`!', input: 'ROVER' },
    { event: '🛰️ TITAN LANDING', info: 'Landing on Saturn\'s largest moon. What is the surface made of?', actionType: 'reply', action: 'Reply `METHANE` or `AMMONIA`!', input: 'METHANE' },
    { event: '🚀 ESCAPE VELOCITY', info: 'To leave Earth, what speed must we reach (in km/s)?', actionType: 'reply', action: 'Reply `11.2` or `7.9`!', input: '11.2' },
    { event: '⭐ STAR CLASSIFICATION', info: 'The star Betelgeuse is what color?', actionType: 'reply', action: 'Reply `RED` or `BLUE`!', input: 'RED' },
    { event: '🔭 HUBBLE FINDING', info: 'The Hubble Deep Field captured images of what?', actionType: 'reply', action: 'Reply `GALAXIES` or `PLANETS`!', input: 'GALAXIES' },
    { event: '👨‍🚀 APOLLO MISTAKE', info: 'The Apollo 11 moon landing happened in what year?', actionType: 'reply', action: 'Reply `1969` or `1972`!', input: '1969' },
    { event: '🌀 BLACK HOLE NAME', info: 'What is the name of the black hole at the center of the Milky Way?', actionType: 'reply', action: 'Reply `SAGITTARIUS` or `CYGNUS`!', input: 'SAGITTARIUS' },
    { event: '🔥 SUN LAYER', info: 'What is the visible surface layer of the Sun called?', actionType: 'reply', action: 'Reply `PHOTOSPHERE` or `CHROMOSPHERE`!', input: 'PHOTOSPHERE' },
    { event: '💧 WATER ON MARS', info: 'Is the water on Mars mostly in the form of ICE or LIQUID?', actionType: 'reply', action: 'Reply `ICE` or `LIQUID`!', input: 'ICE' },
    { event: '👽 FAMOUS TELESCOPE', info: 'What radio telescope was used in the movie Contact?', actionType: 'reply', action: 'Reply `ARECIBO` or `VLA`!', input: 'ARECIBO' },
    { event: '🌍 EARTH SIZE', info: 'Is Jupiter smaller or larger than Earth?', actionType: 'reply', action: 'Reply `LARGER` or `SMALLER`!', input: 'LARGER' },
    { event: '🧪 SPACE SUIT GAS', info: 'What gas do modern space suits use for breathing?', actionType: 'reply', action: 'Reply `OXYGEN` or `AIR`!', input: 'OXYGEN' },
    { event: '🪐 RINGS', info: 'Which planet has the most prominent rings?', actionType: 'reply', action: 'Reply `SATURN` or `JUPITER`!', input: 'SATURN' },
    { event: '🕰️ LIGHT SPEED', info: 'How long does it take light to travel from the Sun to Earth (in minutes)?', actionType: 'reply', action: 'Reply `8` or `16`!', input: '8' },
    { event: '🛰️ MIR STATION', info: 'The Soviet/Russian space station Mir operated until what year?', actionType: 'reply', action: 'Reply `2001` or `1998`!', input: '2001' },
    { event: '🛰️ ISRAEL SATELLITE', info: 'What is the name of Israel\'s spy satellite program?', actionType: 'reply', action: 'Reply `OFEC` or `AMOS`!', input: 'OFEC' },
    { event: '🧪 ELEMENT NAME', info: 'What element makes up most of the universe?', actionType: 'reply', action: 'Reply `HYDROGEN` or `HELIUM`!', input: 'HYDROGEN' },
    { event: '🚀 FIRST SATELLITE', info: 'What was the name of the first artificial satellite launched into space?', actionType: 'reply', action: 'Reply `SPUTNIK` or `EXPLORER`!', input: 'SPUTNIK' },
    { event: '🔭 EXOPLANETS', info: 'Are most known exoplanets larger or smaller than Earth?', actionType: 'reply', action: 'Reply `LARGER` or `SMALLER`!', input: 'LARGER' },
    { event: '🧪 PLANETARY BODY', info: 'What is the name of the dwarf planet in the asteroid belt?', actionType: 'reply', action: 'Reply `CERES` or `PLUTO`!', input: 'CERES' },
    // More Reply Events to reach 50+ total
    { event: '🪐 GAS GIANTS', info: 'Are Uranus and Neptune considered Ice Giants or Gas Giants?', actionType: 'reply', action: 'Reply `ICE` or `GAS`!', input: 'ICE' },
    { event: '🚀 FIRST MANNED', info: 'Who was the first person to orbit the Earth?', actionType: 'reply', action: 'Reply `GAGARIN` or `GLENN`!', input: 'GAGARIN' },
    { event: '🔭 MOON PHASE', info: 'What is the phase where the Moon is between the Earth and Sun?', actionType: 'reply', action: 'Reply `NEW` or `FULL`!', input: 'NEW' },
    { event: '🌑 MERCURY FACT', info: 'Does Mercury have a permanent atmosphere?', actionType: 'reply', action: 'Reply `NO` or `YES`!', input: 'NO' },
    { event: '⭐ NEUTRON STAR', info: 'Is a Neutron Star heavier or lighter than the Sun?', actionType: 'reply', action: 'Reply `HEAVIER` or `LIGHTER`!', input: 'HEAVIER' },
    { event: '🛸 INTERSTELLAR DUST', info: 'Does interstellar dust contain molecules?', actionType: 'reply', action: 'Reply `YES` or `NO`!', input: 'YES' },
    { event: '🛰️ SPACE TELESCOPE', info: 'The James Webb Space Telescope primarily observes in which light spectrum?', actionType: 'reply', action: 'Reply `INFRARED` or `VISIBLE`!', input: 'INFRARED' },
    { event: '💥 SUPERNOVA TYPE', info: 'A Type Ia supernova occurs from a white dwarf exceeding the...', actionType: 'reply', action: 'Reply `CHANDRASEKHAR` or `OPPENHEIMER`!', input: 'CHANDRASEKHAR' },
    { event: '🌌 DARK MATTER', info: 'Does Dark Matter interact strongly with electromagnetic force?', actionType: 'reply', action: 'Reply `NO` or `YES`!', input: 'NO' },
    { event: '🚀 LEO HEIGHT', info: 'The International Space Station orbits in what region of space?', actionType: 'reply', action: 'Reply `LEO` or `GEO`!', input: 'LEO' },
];

/**
 * Sends a new random Galactic Event and sets up the timer for the next one.
 * @param {object} api
 * @param {string} threadID
 * @param {object} globalState
 */
async function startNewEvent(api, threadID, globalState) {
    const gameKey = GAME_KEY_PREFIX + threadID;

    // 1. Clear any existing timer for this thread to prevent duplicates
    const existingGame = globalState.gameStates.get(gameKey);
    if (existingGame && existingGame.timer) {
        clearTimeout(existingGame.timer);
    }

    // 2. Select a random event
    const eventData = EVENT_POOL[Math.floor(Math.random() * EVENT_POOL.length)];

    // 3. Format the message
    const message = `🚀 Galactic Event: ${eventData.event} 💫
──────────────────
Info: ${eventData.info}
──────────────────
ACTION: ${eventData.action}
Time limit: 20 seconds.`;

    // 4. Send the message and get the messageID
    api.sendMessage(message, threadID, (err, info) => {
        if (err) return console.error('Galactic Send Error:', err);

        const eventMessageID = info.messageID;

        // 5. Set up the auto-unsend/next event timer
        const timer = setTimeout(() => {
            // Check if the game is still active before un-sending
            const currentState = globalState.gameStates.get(gameKey);
            if (currentState && currentState.messageID === eventMessageID) {
                api.unsendMessage(eventMessageID, (err) => {
                    if (err) console.error('Galactic Unsend Error:', err);
                });
                // Start the next event continuously
                startNewEvent(api, threadID, globalState);
            }
        }, 20000); // 20 seconds

        // 6. Save the new game state
        globalState.gameStates.set(gameKey, {
            type: 'galactic',
            threadID: threadID,
            messageID: eventMessageID,
            timer: timer, // Store the timer reference
            event: eventData, // Store the full event data
            active: true
        });

    });
}

/**
 * Logic to handle a correct answer (Reaction or Reply).
 * @param {object} api
 * @param {string} winnerID
 * @param {string} threadID
 * @param {string} eventMessageID - The message to be unsent
 * @param {object} globalState
 */
async function handleWin(api, winnerID, threadID, eventMessageID, globalState) {
    const gameKey = GAME_KEY_PREFIX + threadID;
    const game = globalState.gameStates.get(gameKey);
    
    if (!game) return;

    // 1. Stop the current timer
    clearTimeout(game.timer);
    
    // 2. Send congratulations message
    api.sendMessage(`🎉 Congratulations, <@${winnerID}>! You secured the objective.\n\nYou've won $100 for your crew! 💰`, threadID, winnerID);

    // 3. Award money
    try {
        // bank.addMoney(userID, amount, currency, globalState)
        await bank.addMoney(winnerID, 100, 'usd', globalState);
    } catch (e) {
        console.error("Galactic Bank Error:", e);
        api.sendMessage("Error: Could not add $100 to the bank. Please check bank.js.", threadID);
    }

    // 4. Clean up: Unsend original question
    api.unsendMessage(eventMessageID, (err) => {
        if (err) console.error('Galactic Unsend Error:', err);
    });

    // 5. Immediately start the next event
    if (game.active) {
        startNewEvent(api, threadID, globalState);
    } else {
        // If game was explicitly stopped during the win process, clean up state
        globalState.gameStates.delete(gameKey);
    }
}


// --- EXPORTED HANDLERS ---

/**
 * Handles the <galactic command.
 */
exports.handleCommand = (api, event, args, globalState) => {
    const { threadID, messageID, senderID } = event;
    const gameKey = GAME_KEY_PREFIX + threadID;
    const game = globalState.gameStates.get(gameKey);

    if (args[1] === 'end') {
        if (game && game.type === 'galactic') {
            clearTimeout(game.timer);
            api.unsendMessage(game.messageID, (err) => {
                if (err) console.error('Galactic Unsend Error:', err);
            });
            globalState.gameStates.delete(gameKey);
            api.sendMessage(`🛑 Galactic command center deactivated. The continuous event stream has been stopped.`, threadID, messageID);
            return;
        } else {
            api.sendMessage(`⚠️ The Galactic event stream is not currently active.`, threadID, messageID);
            return;
        }
    }

    if (args[1] === 'start' || !args[1]) {
        if (game && game.type === 'galactic') {
             api.sendMessage(`⚠️ Galactic event stream is already active! Use '<galactic end' to stop it.`, threadID, messageID);
             return;
        }
        api.sendMessage(`📡 Initiating Galactic Command Stream. Events will appear every 20 seconds until '<galactic end' is used.`, threadID, (err, info) => {
            if (err) return console.error('Galactic Start Error:', err);
            startNewEvent(api, threadID, globalState);
        }, messageID);
        return;
    }

    // Handle reply answers that are not commands (e.g. from handleMessage in bot.js)
    if (game && game.type === 'galactic' && event.type === 'message_reply') {
        exports.handleReply(api, event, globalState);
        return;
    }

    api.sendMessage("Unknown <galactic command. Use '<galactic' to start or '<galactic end' to stop.", threadID, messageID);
};


/**
 * Handles reactions to check for quiz answers.
 */
exports.handleReaction = async (api, event, globalState) => {
    const { messageID, reaction, userID, threadID } = event;
    const gameKey = GAME_KEY_PREFIX + threadID;
    
    // 1. Check if a game is active in this thread
    const game = globalState.gameStates.get(gameKey);
    if (!game || game.type !== 'galactic' || game.messageID !== messageID) {
        return; // Not the active Galactic message
    }

    // 2. Ignore reactions from the bot itself
    if (userID === api.getCurrentUserID()) {
        return;
    }

    // 3. Check if the reaction is the correct answer AND the event type is 'reaction'
    if (game.event.actionType === 'reaction' && reaction === game.event.input) {
        // Winner found!
        await handleWin(api, userID, threadID, messageID, globalState);
    }
    // Ignore wrong reactions
};

/**
 * Handles message replies to check for text answers.
 */
exports.handleReply = async (api, event, globalState) => {
    // The messageID here is the ID of the original message being replied to
    const { messageID: repliedToMessageID, body, senderID, threadID } = event;
    const gameKey = GAME_KEY_PREFIX + threadID;

    // 1. Check if a game is active in this thread
    const game = globalState.gameStates.get(gameKey);
    if (!game || game.type !== 'galactic' || game.messageID !== repliedToMessageID) {
        return; // Not a reply to the active Galactic message
    }

    // 2. Sanitize and normalize the input
    const normalizedReply = body.toUpperCase().trim();
    const normalizedInput = game.event.input.toUpperCase().trim();

    // 3. Check if the reply matches the correct answer AND the event type is 'reply'
    if (game.event.actionType === 'reply' && normalizedReply === normalizedInput) {
        // Winner found!
        await handleWin(api, senderID, threadID, repliedToMessageID, globalState);
    }
    // Ignore wrong replies
};