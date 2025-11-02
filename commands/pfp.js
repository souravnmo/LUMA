// commands/pfp.js - HD Profile Picture (No Reactions Version)
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { DownloaderHelper } = require('node-downloader-helper');

// --- HELPER FUNCTIONS ---

// Function to extract UID from a mention, argument, or reply
function getTargetID(event, args) {
    if (event.messageReply && event.messageReply.senderID) {
        return event.messageReply.senderID;
    }
    if (event.mentions && Object.keys(event.mentions).length > 0) {
        return Object.keys(event.mentions)[0];
    }
    const targetID = args[1];
    if (targetID && /^\d+$/.test(targetID)) {
        return targetID;
    }
    return null;
}

// Enhanced HD profile picture fetching with better sources
async function getHDProfilePicture(targetID) {
    const methods = [
        // Method 1: Highest quality Graph API
        async () => {
            try {
                const url = `https://graph.facebook.com/${targetID}/picture?height=4096&width=4096&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
                const response = await axios.head(url, {
                    timeout: 8000,
                    maxRedirects: 5,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });
                if (response.status === 200 && response.headers['content-type']?.includes('image')) {
                    console.log('✅ Using Ultra HD (4096x4096)');
                    return url;
                }
            } catch (e) {
                console.log('Ultra HD method failed:', e.message);
            }
            return null;
        },

        // Method 2: High quality with different endpoint
        async () => {
            try {
                const url = `https://graph.facebook.com/${targetID}/picture?height=2048&width=2048&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
                const response = await axios.head(url, {
                    timeout: 8000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                if (response.status === 200) {
                    console.log('✅ Using HD (2048x2048)');
                    return url;
                }
            } catch (e) {
                console.log('HD 2048 method failed:', e.message);
            }
            return null;
        },

        // Method 3: Try to get original upload resolution
        async () => {
            try {
                // This endpoint sometimes returns the original uploaded photo
                const apiUrl = `https://graph.facebook.com/v19.0/${targetID}/picture?type=large&redirect=false&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
                const response = await axios.get(apiUrl, {
                    timeout: 8000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                
                if (response.data && response.data.data && response.data.data.url) {
                    // Extract and modify URL to get higher resolution
                    let imgUrl = response.data.data.url;
                    // Try to increase size parameters in the URL
                    imgUrl = imgUrl.replace(/\/s\d+x\d+\//g, '/s2048x2048/');
                    imgUrl = imgUrl.replace(/_s\d+x\d+_/g, '_s2048x2048_');
                    console.log('✅ Using CDN HD endpoint');
                    return imgUrl;
                }
            } catch (e) {
                console.log('CDN HD method failed:', e.message);
            }
            return null;
        },

        // Method 4: Standard large with manual size boost
        async () => {
            try {
                const url = `https://graph.facebook.com/${targetID}/picture?type=large&width=1500&height=1500`;
                console.log('✅ Using Standard HD (1500x1500)');
                return url;
            } catch (e) {
                console.log('Standard HD failed:', e.message);
            }
            return null;
        },

        // Method 5: Fallback
        async () => {
            console.log('⚠️ Using fallback quality');
            return `https://graph.facebook.com/${targetID}/picture?type=large`;
        }
    ];

    for (let i = 0; i < methods.length; i++) {
        try {
            const url = await methods[i]();
            if (url) return url;
        } catch (error) {
            console.log(`Method ${i + 1} exception:`, error.message);
        }
    }
    
    throw new Error('All HD methods failed');
}

// Function to get user name
async function getUserName(api, targetID, event) {
    if (event.mentions && event.mentions[targetID]) {
        return event.mentions[targetID];
    }
    
    try {
        const userInfo = await new Promise((resolve, reject) => {
            api.getUserInfo(targetID, (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });
        
        if (userInfo && userInfo[targetID] && userInfo[targetID].name) {
            return userInfo[targetID].name;
        }
    } catch (e) {
        console.log('Failed to get user name:', e.message);
    }
    
    return `User ${targetID}`;
}

// --- MAIN COMMAND LOGIC ---
module.exports = async function (api, event, args, state) {
    const { threadID, messageID, senderID } = event;

    const targetID = getTargetID(event, args) || senderID;

    if (!targetID) {
        return api.sendMessage(
            '❌ Usage:\n• <pfp - Your picture\n• <pfp @user - Tagged user\n• <pfp UID - Specific user\n• Reply + <pfp - Replied user',
            threadID,
            messageID
        );
    }

    let targetName = 'User';

    try {
        // Get user name
        targetName = await getUserName(api, targetID, event);

        // Send processing message
        const processingMsg = await new Promise((resolve) => {
            api.sendMessage(`⏳ Fetching HD profile picture for ${targetName}...`, threadID, (err, info) => {
                resolve(info);
            }, messageID);
        });

        // Get HD profile picture URL
        let imageUrl;
        try {
            imageUrl = await getHDProfilePicture(targetID);
            
            if (!imageUrl) {
                throw new Error('No valid HD image URL found');
            }
            
            console.log(`✅ Found HD picture URL for ${targetName} (${targetID})`);
            
        } catch (error) {
            console.error(`❌ Failed to get HD picture:`, error.message);
            
            // Unsend processing message
            if (processingMsg && processingMsg.messageID) {
                api.unsendMessage(processingMsg.messageID);
            }
            
            return api.sendMessage(
                `❌ Couldn't retrieve HD profile picture for ${targetName}.\nThis may be due to privacy settings or service issues.`,
                threadID,
                messageID
            );
        }

        // Prepare download
        const tempDir = path.join(__dirname, '..', 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const downloadPath = path.join(tempDir, `pfp_hd_${targetID}_${Date.now()}.jpg`);

        return new Promise((resolve) => {
            const dl = new DownloaderHelper(imageUrl, tempDir, {
            fileName: path.basename(downloadPath),
            timeout: 25000,
            retry: { maxRetries: 3, delay: 1000 },
            headers: {
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
         'Referer': 'https://www.facebook.com/',
         'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
         'Accept-Language': 'en-US,en;q=0.9',
         'Connection': 'keep-alive',
         'Sec-Fetch-Dest': 'image',
         'Sec-Fetch-Mode': 'no-cors',
         'Sec-Fetch-Site': 'same-origin'
        }
    });

            dl.on('error', (error) => {
                console.error('❌ Download failed:', error.message);
                
                // Unsend processing message
                if (processingMsg && processingMsg.messageID) {
                    api.unsendMessage(processingMsg.messageID);
                }
                
                if (fs.existsSync(downloadPath)) {
                    try { fs.unlinkSync(downloadPath); } catch (e) {}
                }
                
                api.sendMessage(
                    `❌ Failed to download HD picture for ${targetName}.\nPlease try again later.`,
                    threadID,
                    messageID
                );
                resolve();
            });

            dl.on('end', async () => {
                try {
                    // Validate file
                    if (!fs.existsSync(downloadPath)) {
                        throw new Error('Downloaded file not found');
                    }

                    const stats = fs.statSync(downloadPath);
                    
                    if (stats.size < 1000) {
                        throw new Error('File too small (likely default/error image)');
                    }

                    console.log(`✅ Downloaded HD picture: ${(stats.size / 1024).toFixed(2)} KB`);

                    // Unsend processing message
                    if (processingMsg && processingMsg.messageID) {
                        api.unsendMessage(processingMsg.messageID);
                    }

                    // Send the HD picture
                    const message = {
                        body: `🖼️ HD Profile Picture\n👤 ${targetName}\n🆔 ${targetID}\n📏 ${(stats.size / 1024).toFixed(2)} KB`,
                        attachment: fs.createReadStream(downloadPath)
                    };
                    
                    api.sendMessage(message, threadID, (err) => {
                        // Cleanup
                        if (fs.existsSync(downloadPath)) {
                            try {
                                fs.unlinkSync(downloadPath);
                                console.log('✅ Temp file cleaned up');
                            } catch (cleanupErr) {
                                console.error('⚠️ Cleanup failed:', cleanupErr.message);
                            }
                        }
                        
                        if (err) {
                            console.error('❌ Failed to send picture:', err);
                            api.sendMessage(
                                `❌ Upload failed for ${targetName}'s HD picture.`,
                                threadID
                            );
                        } else {
                            console.log(`✅ Successfully sent HD picture for ${targetName}`);
                        }
                        resolve();
                    }, messageID);

                } catch (error) {
                    console.error('❌ File processing failed:', error.message);
                    
                    // Unsend processing message
                    if (processingMsg && processingMsg.messageID) {
                        api.unsendMessage(processingMsg.messageID);
                    }
                    
                    if (fs.existsSync(downloadPath)) {
                        try { fs.unlinkSync(downloadPath); } catch (e) {}
                    }
                    
                    api.sendMessage(
                        `❌ Failed to process HD picture for ${targetName}.`,
                        threadID,
                        messageID
                    );
                    resolve();
                }
            });

            dl.start().catch((error) => {
                console.error('❌ Download start failed:', error.message);
                
                // Unsend processing message
                if (processingMsg && processingMsg.messageID) {
                    api.unsendMessage(processingMsg.messageID);
                }
                
                api.sendMessage(
                    `❌ Failed to start download for ${targetName}'s picture.`,
                    threadID,
                    messageID
                );
                resolve();
            });
        });

    } catch (error) {
        console.error('❌ Unexpected error:', error);
        api.sendMessage(
            '❌ An unexpected error occurred while fetching the profile picture.',
            threadID,
            messageID
        );
    }
};