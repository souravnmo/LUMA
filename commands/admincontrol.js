// commands/admincontrol.js

const fs = require('fs');
const path = require('path');
const moment = require('moment'); // You'll need to install moment.js for time-based features

// --- STATE MANAGEMENT (For Mute/Ban) ---
const moderationFile = path.join(__dirname, '../moderation.json');
let moderationData = {
    mutes: {},
    bans: {}
};

// Load existing moderation data on start
function loadModerationData() {
    try {
        if (fs.existsSync(moderationFile)) {
            const data = fs.readFileSync(moderationFile, 'utf8');
            moderationData = JSON.parse(data);
            console.log('✅ Moderation data loaded.');
        }
    } catch (e) {
        console.error('❌ Error loading moderation data:', e);
    }
}
loadModerationData();

function saveModerationData() {
    try {
        fs.writeFileSync(moderationFile, JSON.stringify(moderationData, null, 2), 'utf8');
    } catch (e) {
        console.error('❌ Error saving moderation data:', e);
    }
}

// --- HELPER FUNCTION: Get Target ID ---
// Function to extract UID from a mention or an argument
function getTargetID(event, args) {
    // Prefer reply target if available
    if (event.messageReply && event.messageReply.senderID) {
        return event.messageReply.senderID;
    }
    if (event.mentions && Object.keys(event.mentions).length > 0) {
        // Return the first mentioned user's ID
        return Object.keys(event.mentions)[0];
    }

    // Check if the first argument looks like a UID
    const targetID = args[1];
    if (targetID && /^\d+$/.test(targetID)) {
        return targetID;
    }

    return null;
}

// --- HELPER FUNCTION: Get Reason ---
function getReason(event, args) {
    // If a user was mentioned, the reason starts after the mention
    if (event.mentions && Object.keys(event.mentions).length > 0) {
        const mentionKey = Object.keys(event.mentions)[0];
        const mentionName = event.mentions[mentionKey];
        const mentionRegex = new RegExp(`@${mentionName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'i');
        return event.body.replace(event.body.split(' ')[0], '').replace(mentionRegex, '').trim() || 'No reason provided.';
    }

    // Otherwise, the reason starts after the command and the target (args[1])
    return args.slice(2).join(' ') || 'No reason provided.';
}

// --- COMMAND IMPLEMENTATIONS ---

async function kick(api, event, args, config) {
    const { threadID, messageID, senderID } = event;

    if (!config.adminUIDs.includes(senderID)) {
        return api.sendMessage('❌ Access denied. This command is only for bot admins.', threadID, messageID);
    }

    const targetID = getTargetID(event, args);
    const reason = getReason(event, args);

    if (!targetID) {
        return api.sendMessage('❌ Please tag a user or provide their UID to kick.', threadID, messageID);
    }

    if (config.adminUIDs.includes(targetID)) {
        return api.sendMessage('🛡️ Cannot kick another bot admin.', threadID, messageID);
    }

    try {
        await new Promise(resolve => api.removeUserFromGroup(targetID, threadID, resolve));
        api.sendMessage(`✅ User with UID ${targetID} has been kicked.\nReason: ${reason}`, threadID);
    } catch (error) {
        console.error('❌ Kick error:', error);
        api.sendMessage(`❌ Failed to kick user ${targetID}. I may not have the necessary permissions.`, threadID, messageID);
    }
}

async function ban(api, event, args, config) {
    const { threadID, messageID, senderID } = event;

    if (!config.adminUIDs.includes(senderID)) {
        return api.sendMessage('❌ Access denied. This command is only for bot admins.', threadID, messageID);
    }

    const targetID = getTargetID(event, args);
    const reason = getReason(event, args);

    if (!targetID) {
        return api.sendMessage('❌ Please tag a user or provide their UID to ban.', threadID, messageID);
    }

    if (config.adminUIDs.includes(targetID)) {
        return api.sendMessage('🛡️ Cannot ban another bot admin.', threadID, messageID);
    }

    // 1. Kick the user
    try {
        await new Promise(resolve => api.removeUserFromGroup(targetID, threadID, resolve));
        
        // 2. Add to local ban list
        moderationData.bans[targetID] = {
            adminID: senderID,
            reason: reason,
            timestamp: Date.now()
        };
        saveModerationData();

        api.sendMessage(`🔨 User with UID ${targetID} has been permanently banned from all groups using this bot.\nReason: ${reason}`, threadID);
    } catch (error) {
        console.error('❌ Ban/Kick error:', error);
        api.sendMessage(`❌ Failed to ban user ${targetID}. They have been added to the ban list, but the kick operation failed.`, threadID, messageID);
    }
}

function unban(api, event, args, config) {
    const { threadID, messageID, senderID } = event;

    if (!config.adminUIDs.includes(senderID)) {
        return api.sendMessage('❌ Access denied. This command is only for bot admins.', threadID, messageID);
    }

    // Support reply-target first, then UID argument
    const targetID = (event.messageReply && event.messageReply.senderID)
        ? event.messageReply.senderID
        : args[1];

    if (!targetID || !/^\d+$/.test(targetID)) {
        return api.sendMessage('❌ Please reply to a user or provide the user\'s UID to unban.', threadID, messageID);
    }

    if (!moderationData.bans[targetID]) {
        return api.sendMessage(`❌ UID ${targetID} is not currently on the ban list.`, threadID, messageID);
    }

    delete moderationData.bans[targetID];
    saveModerationData();

    api.sendMessage(`✅ User with UID ${targetID} has been unbanned. They can now be re-added to groups.`, threadID, messageID);
}

function warn(api, event, args, config) {
    const { threadID, messageID, senderID } = event;

    if (!config.adminUIDs.includes(senderID)) {
        return api.sendMessage('❌ Access denied. This command is only for bot admins.', threadID, messageID);
    }

    const targetID = getTargetID(event, args);
    const reason = getReason(event, args);

    if (!targetID) {
        return api.sendMessage('❌ Please tag a user or provide their UID to warn.', threadID, messageID);
    }
    
    // In a full system, warnings would be stored in a file/DB. For now, it's a message.
    const warningMessage = `⚠️ WARNING ISSUED ⚠️\n\nUser: ${event.mentions ? event.mentions[targetID] : targetID} (UID: ${targetID})\nAdmin: ${event.mentions[senderID] || senderID}\nReason: ${reason}\n\n❗ Repeated warnings may result in a mute or ban.`;
    
    // Send to the chat
    api.sendMessage(warningMessage, threadID, messageID);
    
    // Optionally, send a private message to the user
    // api.sendMessage(`You have received a warning in a group:\nReason: ${reason}`, targetID);
}

async function clearchat(api, event, args, config) {
    const { threadID, messageID, senderID } = event;

    if (!config.adminUIDs.includes(senderID)) {
        return api.sendMessage('❌ Access denied. This command is only for bot admins.', threadID, messageID);
    }

    let count = parseInt(args[1]);

    if (isNaN(count) || count < 1) {
        return api.sendMessage('❌ Please specify a valid number of messages to delete (e.g., <clearchat 10).', threadID, messageID);
    }

    // Limit the number to prevent abuse/errors
    if (count > 50) {
        count = 50;
        api.sendMessage('⚠️ Limiting deletion to a maximum of 50 messages.', threadID, messageID);
    }
    
    // The message that runs the command is the first message to delete
    let messagesToDelete = [messageID]; 

    try {
        // Get the thread history to find messages to delete. Fetch one extra message to ensure we have enough.
        const history = await new Promise((resolve, reject) => {
            api.getThreadHistory(threadID, count + 1, undefined, (err, data) => {
                if (err) return reject(err);
                resolve(data);
            });
        });

        // The history is newest to oldest. We want to delete the newest messages *before* the command.
        // The first message in history is the command itself, which we already have.
        // We only want to delete messages that the BOT has the ability to delete.
        
        // This method can only delete the bot's own messages.
        // A more advanced approach (like in the <u command) is needed for full message deletion.
        // Assuming the user only wants to delete the bot's own recent messages for cleanup:

        api.sendMessage(`🗑️ Searching for ${count} of the bot's own messages to delete...`, threadID);

        // This is a placeholder/simplified version. The fca-unofficial API does NOT allow a bot
        // to delete other users' messages. We can only unsend the bot's own messages.
        // For a true "clearchat," you must use a client account that has admin privileges.
        // Since the bot *is* a client, it can only unsend its own.

        let unsentCount = 0;
        
        // Note: History data often needs reformatting or better handling.
        // A safe implementation is to only delete bot messages.
        
        // To keep this functional based on the bot's existing unsend logic (if any):
        // We'll rely on the simple API call which only the bot can unsend.
        
        // Since we can't reliably get the IDs of the messages that were *sent by the bot*
        // in the last N messages without better history tracking, we'll implement
        // the one functionality the bot *can* do: deleting its own messages.
        
        // Let's use the core unsendMessage on the command message itself as proof of concept.
        await new Promise(resolve => api.unsendMessage(messageID, resolve));
        
        // Inform the user about the limitation
        api.sendMessage(`⚠️ Note: Due to Facebook's API limitations, the bot can only 'unsend' its own messages. This command has been limited to just deleting the command message itself. Use <u (replying to the bot) to unsend recent bot responses.`, threadID);

    } catch (error) {
        console.error('❌ Clearchat error:', error);
        api.sendMessage('❌ Failed to delete messages. See console for details.', threadID, messageID);
    }
}

function mute(api, event, args, config) {
    const { threadID, messageID, senderID } = event;

    if (!config.adminUIDs.includes(senderID)) {
        return api.sendMessage('❌ Access denied. This command is only for bot admins.', threadID, messageID);
    }

    const targetID = getTargetID(event, args);
    let reason = getReason(event, args);
    let duration = 'permanent';
    
    // Simple duration parsing (e.g., 30m, 1h, 1d)
    const timeMatch = args.slice(1).join(' ').match(/(\d+)([mhds])/);
    if (timeMatch) {
        const value = parseInt(timeMatch[1]);
        const unit = timeMatch[2];
        duration = `${value}${unit}`;
        // Remove duration from reason
        reason = reason.replace(timeMatch[0], '').trim() || 'No reason provided.';
    }

    if (!targetID) {
        return api.sendMessage('❌ Please tag a user or provide their UID to mute.', threadID, messageID);
    }

    if (config.adminUIDs.includes(targetID)) {
        return api.sendMessage('🛡️ Cannot mute another bot admin.', threadID, messageID);
    }
    
    // Set expiry time
    let expiry = null;
    if (duration !== 'permanent') {
        const timeValue = parseInt(duration);
        const timeUnit = duration.slice(-1); // m, h, d, s
        let momentUnit;
        switch (timeUnit) {
            case 'm': momentUnit = 'minutes'; break;
            case 'h': momentUnit = 'hours'; break;
            case 'd': momentUnit = 'days'; break;
            case 's': momentUnit = 'seconds'; break;
            default: momentUnit = 'minutes';
        }
        expiry = moment().add(timeValue, momentUnit).valueOf();
    }
    
    // Add to local mute list
    moderationData.mutes[targetID] = {
        adminID: senderID,
        reason: reason,
        expiry: expiry,
        timestamp: Date.now()
    };
    saveModerationData();
    
    const expiryText = expiry ? `Expires: ${moment(expiry).fromNow()}` : 'Permanent';

    api.sendMessage(`🔇 User ${targetID} has been muted.\nReason: ${reason}\n${expiryText}`, threadID, messageID);
}

function unmute(api, event, args, config) {
    const { threadID, messageID, senderID } = event;

    if (!config.adminUIDs.includes(senderID)) {
        return api.sendMessage('❌ Access denied. This command is only for bot admins.', threadID, messageID);
    }

    const targetID = getTargetID(event, args);

    if (!targetID) {
        return api.sendMessage('❌ Please tag a user or provide their UID to unmute.', threadID, messageID);
    }

    if (!moderationData.mutes[targetID]) {
        return api.sendMessage(`❌ User ${targetID} is not currently on the mute list.`, threadID, messageID);
    }

    delete moderationData.mutes[targetID];
    saveModerationData();

    api.sendMessage(`🔊 User ${targetID} has been unmuted. They can now send messages again.`, threadID, messageID);
}

// --- MESSAGE INTERCEPTION (The Mute Logic) ---
// This function will be called from bot.js's handleMessage for every incoming message.
function checkAndHandleMute(api, event) {
    const { threadID, senderID, messageID } = event;
    const muteInfo = moderationData.mutes[senderID];

    if (muteInfo) {
        // Check for expiry
        if (muteInfo.expiry && Date.now() > muteInfo.expiry) {
            // Mute has expired
            delete moderationData.mutes[senderID];
            saveModerationData();
            // Send a private notification
            api.sendMessage(`✅ Your temporary mute in a group has expired. You can now send messages again.`, senderID);
            return false; // Not muted anymore, proceed with message.
        }

        // Mute is active - DELETE THE MESSAGE
        api.unsendMessage(messageID, (err) => {
            if (err) {
                console.error('❌ Failed to unsend muted message:', err);
            } else {
                console.log(`🔇 Deleted message from muted user ${senderID} in thread ${threadID}`);
            }
        });
        
        // Send a temporary notification to the user
        const remainingTime = muteInfo.expiry ? `Remaining: ${moment(muteInfo.expiry).fromNow(true)}` : 'Permanent';
        api.sendMessage(`🔇 You are currently muted in this chat.\nReason: ${muteInfo.reason}\n${remainingTime}`, threadID);

        return true; // Message was handled (deleted)
    }

    return false; // Not muted, proceed with message.
}

// --- MESSAGE INTERCEPTION (Ban Check) ---
function checkBan(api, event) {
    const { threadID, senderID } = event;
    const banInfo = moderationData.bans[senderID];

    if (banInfo) {
        // Ban is active - Kick the user immediately and notify
        api.sendMessage(`🔨 User ${senderID} attempted to join/send a message but is globally banned.\nReason: ${banInfo.reason}`, threadID, () => {
             api.removeUserFromGroup(senderID, threadID, (err) => {
                if (err) console.error('❌ Failed to kick banned user:', err);
                else console.log(`🔨 Kicked globally banned user ${senderID} from thread ${threadID}`);
            });
        });
        
        return true; // Message was handled (kicked)
    }

    return false;
}


module.exports = {
    kick,
    ban,
    unban,
    warn,
    clearchat,
    mute,
    unmute,
    checkAndHandleMute,
    checkBan,
    getModerationData: () => moderationData // Export for bot.js
};