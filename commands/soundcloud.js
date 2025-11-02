const axios = require('axios');
const config = require('../config.json');

// Search SoundCloud tracks directly
async function searchSoundCloud(query, limit = 5) {
  try {
    const url = "https://api-v2.soundcloud.com/search/tracks";
    const params = {
      'q': query,
      'client_id': config.soundcloud.clientId,
      'limit': limit,
      'offset': 0
    };
    
    const response = await axios.get(url, { params, timeout: 10000 });
    
    if (response.status === 200) {
      const tracks = response.data.collection || [];
      return tracks.map(track => ({
        title: track.title || 'Unknown',
        artist: track.user?.username || 'Unknown',
        duration: track.duration || 0,
        playback_count: track.playback_count || 0,
        likes_count: track.likes_count || 0,
        permalink_url: track.permalink_url || '',
        artwork_url: track.artwork_url || '',
        stream_url: track.stream_url || ''
      }));
    }
    return [];
  } catch (error) {
    console.error('SoundCloud API error:', error.response?.status, error.message);
    return [];
  }
}

// Format SoundCloud results
function formatSoundCloudResults(tracks, maxResults = 5) {
  if (!tracks || tracks.length === 0) {
    return "❌ No tracks found!";
  }
  
  let result = "🎵 **SoundCloud Search Results** 🎵\n\n";
  
  tracks.slice(0, maxResults).forEach((track, i) => {
    const duration = formatDuration(track.duration);
    result += `**${i + 1}.** ${track.title}\n`;
    result += `👤 Artist: ${track.artist}\n`;
    result += `⏱️ Duration: ${duration}\n`;
    result += `👀 Plays: ${track.playback_count.toLocaleString()}\n`;
    result += `❤️ Likes: ${track.likes_count.toLocaleString()}\n`;
    result += `🔗 Link: ${track.permalink_url}\n\n`;
  });
  
  return result;
}

// Format duration from milliseconds to MM:SS
function formatDuration(milliseconds) {
  if (!milliseconds) return "Unknown";
  
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

module.exports = async function handleSoundCloud(api, event, args, state) {
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
      const lastUsed = state.soundcloudCooldown?.get(senderID) || 0;
      if (now - lastUsed < 3000) {
        return Math.ceil((3000 - (now - lastUsed)) / 1000);
      }
      if (!state.soundcloudCooldown) state.soundcloudCooldown = new Map();
      state.soundcloudCooldown.set(senderID, now);
      return 0;
    }
  };

  // Cooldown check
  const cooldown = utils.checkCooldown();
  if (cooldown > 0) {
    return await utils.sendMessage(`⏳ Please wait ${cooldown} seconds between SoundCloud requests.`);
  }

  const query = args.slice(1).join(' ');
  if (!query) {
    return await utils.sendMessage('❌ Please provide a search query: <soundcloud your search here');
  }

  try {
    await utils.sendMessage('🔍 Searching SoundCloud...');

    const tracks = await searchSoundCloud(query, 5);
    
    if (tracks && tracks.length > 0) {
      const formattedResults = formatSoundCloudResults(tracks, 5);
      await utils.sendMessage(formattedResults);
    } else {
      await utils.sendMessage('❌ No tracks found. Please try a different search query.');
    }
    
  } catch (error) {
    console.error('SoundCloud error:', error);
    await utils.sendMessage('❌ SoundCloud search failed. Please try again.');
  }
};
