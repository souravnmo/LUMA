// commands/reels.js - FIXED FACEBOOK SHARE & ADDED REACTIONS
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

/**
 * Enhanced Social Media Downloader with Reactions
 */

module.exports = async function handleReels(api, event, args, downloadQueue, sendAndStoreMessage, storeBotMessage) {
    const { threadID, messageID, body, senderID } = event;

    // Extract URL from message
    const urlMatch = body.match(/(https?:\/\/[^\s<]+)/);
    if (!urlMatch) {
        return await sendAndStoreMessage(api, 
            '❌ Please provide a Facebook or Instagram Reels URL', 
            threadID, messageID
        );
    }

    let videoUrl = urlMatch[0];
    videoUrl = videoUrl.replace(/[<>\]]+$/, '').trim();

    console.log('🔗 Detected URL:', videoUrl);

    // Validate URL
    if (!isValidReelsUrl(videoUrl)) {
        return await sendAndStoreMessage(api, 
            '❌ Invalid Reels URL\n\n' +
            '✅ Supported URLs:\n' +
            '• Facebook Reels: facebook.com/reel/123456789\n' +
            '• Facebook Share: facebook.com/share/r/ABC123\n' +
            '• Instagram Reels: instagram.com/reel/ABC123',
            threadID, messageID
        );
    }

    if (downloadQueue.has(threadID)) {
        return await sendAndStoreMessage(api, '⏳ Already processing a download, please wait...', threadID, messageID);
    }

    downloadQueue.set(threadID, true);

    try {
        // Add progress reaction
        await reactToMessage(api, messageID, '🔄');

        let success = false;

        // Route to appropriate downloader
        if (isFacebookUrl(videoUrl)) {
            console.log('📘 Facebook URL detected:', videoUrl);
            success = await handleFacebookDownload(api, event, videoUrl, downloadQueue, storeBotMessage);
        } else {
            console.log('📷 Instagram URL detected:', videoUrl);
            success = await handleInstagramDownload(api, event, videoUrl, downloadQueue, storeBotMessage);
        }

        if (!success) {
            throw new Error('All download methods failed');
        }

    } catch (error) {
        console.error('Reels download error:', error);
        downloadQueue.delete(threadID);
        
        // Add failure reaction
        await reactToMessage(api, messageID, '❌');
        
        const platform = isFacebookUrl(videoUrl) ? 'Facebook' : 'Instagram';
        let errorMessage = `❌ Failed to download ${platform} video.\n\n`;
        
        if (error.message.includes('private') || error.message.includes('restricted')) {
            errorMessage += '🔒 Video might be private or restricted';
        } else if (error.message.includes('unable to resolve')) {
            errorMessage += '🔗 Cannot resolve share link. Try direct reel URL.';
        } else {
            errorMessage += '💡 Ensure video is public and try again';
        }
        
        await sendAndStoreMessage(api, errorMessage, threadID, messageID);
    }
};

// ==================== REACTION FUNCTIONS ====================

/**
 * React to a message with emoji
 */
async function reactToMessage(api, messageID, emoji) {
    try {
        await api.setMessageReaction(emoji, messageID, (err) => {
            if (err) console.log('Reaction error:', err);
            else console.log(`Reacted with ${emoji}`);
        });
    } catch (error) {
        console.log('Could not react to message:', error.message);
    }
}

// ==================== FACEBOOK DOWNLOADER ====================

/**
 * Enhanced Facebook Reel Downloader with better share link handling
 */
async function handleFacebookDownload(api, event, videoUrl, downloadQueue, storeBotMessage) {
    const { threadID, messageID } = event;
    
    console.log('🔄 Processing Facebook URL:', videoUrl);
    
    // Update reaction to downloading
    await reactToMessage(api, messageID, '📥');
    
    // Check if it's a share link and resolve it
    if (isFacebookShareUrl(videoUrl)) {
        console.log('🔗 Facebook share link detected, resolving...');
        const resolvedUrl = await resolveFacebookShareUrl(videoUrl);
        
        if (resolvedUrl) {
            console.log('✅ Resolved to:', resolvedUrl);
            videoUrl = resolvedUrl;
        } else {
            // Try alternative resolution method
            const altResolved = await resolveFacebookShareUrlAlternative(videoUrl);
            if (altResolved) {
                console.log('✅ Alt resolved to:', altResolved);
                videoUrl = altResolved;
            } else {
                throw new Error('Unable to resolve Facebook share link');
            }
        }
    }
    
    // Decide target URL: prefer canonical reel URL when present; otherwise use resolved URL (videos/watch/share/v)
    let targetUrl = videoUrl;
    const reelId = extractFacebookReelId(videoUrl);
    if (reelId) {
        console.log(`✅ Extracted Facebook Reel ID: ${reelId}`);
        targetUrl = `https://www.facebook.com/reel/${reelId}`;
    } else {
        console.log('ℹ️ Using resolved Facebook URL directly:', targetUrl);
    }

    // Try different quality formats
    const qualities = [
        'best[height<=720]',
        'best[height<=480]', 
        'best',
        'worst'
    ];

    for (const quality of qualities) {
        console.log(`🔄 Trying Facebook format: ${quality}`);
        const result = await downloadWithYtDlp(targetUrl, quality, 'facebook');
        
        if (result.success) {
            // Update reaction to uploading
            await reactToMessage(api, messageID, '⬆️');
            await sendVideo(api, event, result.filePath, `Facebook (${quality})`, downloadQueue, storeBotMessage);
            // Success reaction
            await reactToMessage(api, messageID, '✅');
            return true;
        }
        
        if (result.error && result.error.includes('Requested format is not available')) {
            console.log(`⚠️ Format ${quality} not available, trying next...`);
            continue;
        }
    }

    throw new Error('Facebook download failed');
}

/**
 * Resolve Facebook share URL - IMPROVED METHOD
 */
async function resolveFacebookShareUrl(shareUrl) {
    try {
        console.log('🔍 Resolving Facebook share URL:', shareUrl);
        
        const response = await axios.get(shareUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            },
            maxRedirects: 10,
            timeout: 15000,
            validateStatus: function (status) {
                return status < 400; // Follow redirects
            }
        });

        // Get final URL after all redirects
        let finalUrl = response.request?.res?.responseUrl || response.config.url;
        console.log('📡 Final URL after redirects:', finalUrl);

        // Try to extract reel ID from final URL
        const reelId = extractFacebookReelId(finalUrl);
        if (reelId) {
            return `https://www.facebook.com/reel/${reelId}`;
        }

        // Accept videos/watch/share/v endpoints directly
        if (/facebook\.com\/(watch\/?\?v=|.*\/videos\/|share\/v\/)/i.test(finalUrl)) {
            return finalUrl;
        }

        return null;

    } catch (error) {
        console.error('Error resolving Facebook share URL:', error.message);
        return null;
    }
}

/**
 * Alternative method to resolve Facebook share URLs
 */
async function resolveFacebookShareUrlAlternative(shareUrl) {
    try {
        console.log('🔍 Trying alternative resolution for:', shareUrl);
        
        // Use a different approach - follow redirects manually
        const response = await axios({
            method: 'HEAD',
            url: shareUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            maxRedirects: 10,
            timeout: 10000,
            validateStatus: null
        });

        const finalUrl = response.request?.res?.responseUrl || response.config.url;
        console.log('📡 Alternative final URL:', finalUrl);
        
        return finalUrl;

    } catch (error) {
        console.error('Alternative resolution failed:', error.message);
        return null;
    }
}

// ==================== INSTAGRAM DOWNLOADER ====================

/**
 * Instagram Downloader with reactions
 */
async function handleInstagramDownload(api, event, videoUrl, downloadQueue, storeBotMessage) {
    const { threadID, messageID } = event;

    console.log('🔄 Processing Instagram URL:', videoUrl);
    
    // Update reaction to downloading
    await reactToMessage(api, messageID, '📥');

    // Try different quality formats for Instagram
    const qualities = [
        'best',
        'best[height<=1080]',
        'best[height<=720]',
        'best[height<=480]'
    ];

    for (const quality of qualities) {
        console.log(`🔄 Trying Instagram format: ${quality}`);
        const result = await downloadWithYtDlp(videoUrl, quality, 'instagram');
        
        if (result.success) {
            // Update reaction to uploading
            await reactToMessage(api, messageID, '⬆️');
            await sendVideo(api, event, result.filePath, `Instagram (${quality})`, downloadQueue, storeBotMessage);
            // Success reaction
            await reactToMessage(api, messageID, '✅');
            return true;
        }
        
        if (result.error && result.error.includes('Requested format is not available')) {
            console.log(`⚠️ Format ${quality} not available, trying next...`);
            continue;
        }
    }

    throw new Error('Instagram download failed');
}

// ==================== DOWNLOAD ENGINE ====================

/**
 * Enhanced yt-dlp download function
 */
async function downloadWithYtDlp(url, quality, platform) {
    const timestamp = Date.now();
    const tempPath = path.join(__dirname, `../temp_${platform}_${timestamp}.mp4`);
    
    try {
        console.log(`📥 Downloading [${platform}] with quality: ${quality}`);
        
        const command = `yt-dlp -f "${quality}" --no-warnings -o "${tempPath}" "${url}"`;
        
        const { stdout, stderr } = await execAsync(command, { 
            timeout: 60000,
            maxBuffer: 10 * 1024 * 1024
        });
        
        // Check if file was created and has content
        if (fs.existsSync(tempPath)) {
            const stats = fs.statSync(tempPath);
            console.log(`📊 File stats: ${stats.size} bytes`);
            
            if (stats.size > 1000) {
                console.log(`✅ Download successful: ${stats.size} bytes`);
                return { success: true, filePath: tempPath };
            } else {
                throw new Error('Downloaded file is empty or too small');
            }
        } else {
            throw new Error('No file was downloaded');
        }
        
    } catch (error) {
        console.error(`❌ yt-dlp failed [${platform}]:`, error.message);
        
        // Cleanup failed download file
        if (fs.existsSync(tempPath)) {
            try {
                fs.unlinkSync(tempPath);
            } catch (cleanupError) {
                console.log('Cleanup error:', cleanupError.message);
            }
        }
        
        return { 
            success: false, 
            error: error.message
        };
    }
}

// ==================== HELPER FUNCTIONS ====================

function isFacebookShareUrl(url) {
    return /facebook\.com\/share\/(r|v)\//i.test(url);
}

function extractFacebookReelId(url) {
    try {
        // Handle direct reel URLs
        const reelMatch = url.match(/(?:facebook\.com|fb\.com)\/reel\/([0-9]+)/i);
        if (reelMatch && reelMatch[1]) {
            return reelMatch[1];
        }
        
        // Handle URLs with parameters
        const paramMatch = url.match(/reel\/([0-9]+)/i);
        if (paramMatch && paramMatch[1]) {
            return paramMatch[1];
        }
        
        return null;
        
    } catch (error) {
        console.error('Error extracting reel ID:', error);
        return null;
    }
}

function isValidReelsUrl(url) {
    try {
        if (!url || typeof url !== 'string') return false;
        if (!url.includes('http')) return false;
        
        const validPatterns = [
            /facebook\.com\/reel\/[0-9]+/i,
            /m\.facebook\.com\/reel\/[0-9]+/i,
            /fb\.com\/reel\/[0-9]+/i,
            /facebook\.com\/share\/(r|v)\/[a-zA-Z0-9_-]+/i,
            /facebook\.com\/watch\/?\?v=[0-9]+/i,
            /facebook\.com\/.+\/videos\/[0-9]+/i,
            /instagram\.com\/reel\/[a-zA-Z0-9_-]+/i,
            /instagram\.com\/p\/[a-zA-Z0-9_-]+/i,
            /instagr\.am\/reel\/[a-zA-Z0-9_-]+/i
        ];
        
        return validPatterns.some(pattern => pattern.test(url));
        
    } catch (error) {
        return false;
    }
}

function isFacebookUrl(url) {
    const fbPatterns = [
        /facebook\.com\/reel\//i,
        /m\.facebook\.com\/reel\//i,
        /fb\.com\/reel\//i,
        /facebook\.com\/share\//i
    ];
    
    return fbPatterns.some(pattern => pattern.test(url));
}

async function sendVideo(api, event, tempPath, method, downloadQueue, storeBotMessage) {
    const { threadID, messageID } = event;
    
    try {
        if (!fs.existsSync(tempPath)) {
            throw new Error('Downloaded file not found');
        }
        
        const stats = fs.statSync(tempPath);
        const fileSizeMB = stats.size / (1024 * 1024);
        
        console.log(`📁 File size: ${fileSizeMB.toFixed(1)}MB`);
        
        if (fileSizeMB > 100) {
            throw new Error(`File too large (${fileSizeMB.toFixed(1)}MB). Max 100MB.`);
        }

        // Send video without additional text
        await new Promise((resolve, reject) => {
            api.sendMessage({
                attachment: fs.createReadStream(tempPath)
            }, threadID, (err, info) => {
                if (err) {
                    reject(err);
                } else {
                    if (info && info.messageID) {
                        storeBotMessage(threadID, info.messageID);
                    }
                    resolve();
                }
            });
        });

    } catch (error) {
        throw error;
    } finally {
        downloadQueue.delete(threadID);
        if (fs.existsSync(tempPath)) {
            try {
                fs.unlinkSync(tempPath);
            } catch (cleanupError) {
                console.log('Cleanup warning:', cleanupError.message);
            }
        }
    }
}

// Export functions
module.exports.isValidReelsUrl = isValidReelsUrl;
module.exports.isFacebookUrl = isFacebookUrl;