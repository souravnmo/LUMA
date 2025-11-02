const scdl = require('soundcloud-downloader').default;
const fs = require('fs');
const path = require('path');
const config = require('../config.json');

// Set SoundCloud client ID
scdl.setClientID(config.soundcloud.clientId);

module.exports = async function handlePlay(api, event, args, state) {
  const { threadID, messageID, senderID } = event;

  const query = args.slice(1).join(' ');
  if (!query) {
    return;
  }

  if (state.downloadQueue.has(threadID)) {
    return;
  }

  state.downloadQueue.set(threadID, true);

  try {
    // React with progress emoji
    api.setMessageReaction('⏳', messageID, (err) => {
      if (err) console.error('Reaction error:', err);
    }, true);

    // First try direct URL if provided
    const isUrl = query.startsWith('https://soundcloud.com/');
    let track;

    if (isUrl) {
      try {
        track = await scdl.getInfo(query);
      } catch (e) {
        console.error('URL lookup failed:', e);
      }
    }

    if (!track) {
      const searchResults = await scdl.search({
        query: query,
        limit: 1
      });

      if (!searchResults || !searchResults.collection || searchResults.collection.length === 0) {
        state.downloadQueue.delete(threadID);
        api.setMessageReaction('❌', messageID, (err) => {
          if (err) console.error('Reaction error:', err);
        }, true);
        return;
      }

      track = searchResults.collection[0];
    }

    if (!track || !track.permalink_url) {
      state.downloadQueue.delete(threadID);
      api.setMessageReaction('❌', messageID, (err) => {
        if (err) console.error('Reaction error:', err);
      }, true);
      return;
    }

    const tempPath = path.join(__dirname, `../temp_${Date.now()}.mp3`);
    const stream = await scdl.download(track.permalink_url);
    const fileStream = fs.createWriteStream(tempPath);

    stream.pipe(fileStream);

    fileStream.on('finish', () => {
      const message = {
        attachment: fs.createReadStream(tempPath)
      };

      api.sendMessage(message, threadID, (err, info) => {
        state.downloadQueue.delete(threadID);
        
        // Clean up temp file
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (error) {
          console.error('Error cleaning up file:', error);
        }
        
        if (!err) {
          api.setMessageReaction('✅', messageID, (err) => {
            if (err) console.error('Reaction error:', err);
          }, true);
        } else {
          console.error('Send error:', err);
          api.setMessageReaction('❌', messageID, (err) => {
            if (err) console.error('Reaction error:', err);
          }, true);
        }
      });
    });

    fileStream.on('error', (error) => {
      console.error('File write error:', error);
      state.downloadQueue.delete(threadID);
      
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
      
      api.setMessageReaction('❌', messageID, (err) => {
        if (err) console.error('Reaction error:', err);
      }, true);
    });

  } catch (error) {
    console.error('SoundCloud error:', error);
    state.downloadQueue.delete(threadID);
    api.setMessageReaction('❌', messageID, (err) => {
      if (err) console.error('Reaction error:', err);
    }, true);
  }
};