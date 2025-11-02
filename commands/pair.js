// commands/pair.js - INDIAN GENDER + RANDOM FIRST + ONLY 2 DOWNLOADS
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// === INDIAN GENDER DETECTION (BOY ↔ GIRL) ===
function detectGender(name) {
  const lower = name.toLowerCase().replace(/[^a-z]/g, ''); // Clean name

  const maleNames = [
    'Shaikat Bar', 'Tamim Hasan', 'Sourav Sahani', 'Tauhied Hasan', 'Radoan Ahmed Ritul',
    'অহংকারী তরুণ', 'Rk Rocky', 'Atanu Biswas', 'Im Good Boy', 'Sadmans Excellency',
    'Belhadj Eabd Alrazaaq', 'Mustafa Shafiuzzaman', 'No Yon', 'Mehedi Hasan Rakib',
    'Sadman Uchiha', 'প্রলয় হাসান', 'Suporno Dev', 'RI FA T', 'Matthew Martin','Avoid Akash',
    'Bongoboltu Morenai', 'Zaki N-i', 'Sadman Pie', 'Sadman Ackerman', 'Sadman Yagami',
    'rahul','rohit','arjun','vikram','raj','ravi','amit','ankit','Amirat Lishan',
    'abhishek','aditya','ajay','akshay','alok','anand','anil','arun','ashok','atul',
    'bharat','brijesh','chandan','deepak','dev','dinesh','gautam','gopal','hari',
    'himanshu','indra','jatin','jay','jeet','kapil','karan','kiran','krishna','kuldeep',
    'laxman','manish','mohit','mukesh','naveen','neeraj','nikhil','nitin','om','pankaj',
    'pradeep','prakash','pranav','rajat','rakesh','ram','ramesh','ravi','rohan','sachin',
    'sahil','sanjay','santosh','shubham','sid','siddharth','sumeet','sunil','suraj','surya',
    'tanmay','tarun','umesh','varun','vijay','vikas','vinay','vivek','yash','yogesh',
    'mr','bro','king','boss','bhai','ji','sir','dev','raj','kumar','singh','sharma'
  ];

  const femaleNames = [
    'Jennifer Sasha Insu', 'タヒヤ タバスム', 'Oi Shee', 'Plue Meria', 'Aliya Islam',
    'Nur A Tanjin Tanha', 'Elma Ibnat', 'Jennie Xey', 'Tabassum Sabiha', 'Jũlĩâ Änfel',
    'Anuproma Basak', 'Israt Jahan', 'Shi Zu Ka', 'Arshi Banarjee', 'Marjiya Islam', 
    'Саша Айея', 'Li Ä', 'Nōōr Jēhān', 'Aysha Siddika', 'Redhi Ishan Redhi', 'Ava Artillery', 
    'Nusrat Jahan','aarti','aisha','ananya','anika','anjali','ankita','archana','ashwini',
    'deepika','diksha','divya','ekta','garima','geeta','harshita','isha','jaya','jyoti',
    'kajal','kavya','khushi','kirti','komal','kritika','lata','madhu','mahi','manisha',
    'megha','mehak','mitali','monika','muskan','namrata','neha','nidhi','nisha','palak',
    'pallavi','pooja','prachi','preeti','priya','radha','rashmi','reema','richa','ritika',
    'roshni','sakshi','sangeeta','sanika','sanya','sarika','shreya','shruti','simran','sneha',
    'sonali','sonam','sudha','swati','tanvi','tanya','trisha','urvi','vaishnavi','vandana',
    'varsha','vidya','yogita','baby','jaan','miss','princess','queen','didi','behen'
  ];

  for (const m of maleNames) if (lower.includes(m)) return 'male';
  for (const f of femaleNames) if (lower.includes(f)) return 'female';
  return Math.random() > 0.5 ? 'male' : 'female'; // Final fallback
}

// === GET HD PFP URL ===
async function getHDPfpUrl(api, uid) {
  return new Promise((resolve) => {
    api.getUserInfo(uid, async (err, data) => {
      if (err || !data[uid]) return resolve(getFallbackHD(uid));
      const user = data[uid];
      const thumb = user.thumbSrc || user.profileUrl;
      if (!thumb) return resolve(getFallbackHD(uid));

      const hdUrls = [
        `https://graph.facebook.com/${uid}/picture?height=2048&width=2048&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`,
        `https://graph.facebook.com/${uid}/picture?type=large&width=1500&height=1500`,
        thumb
      ];

      for (const url of hdUrls) {
        try {
          const res = await axios.head(url, { timeout: 5000 });
          if (res.status === 200) resolve(url); return;
        } catch (e) {}
      }
      resolve(thumb);
    });
  });
}

function getFallbackHD(uid) {
  return `https://graph.facebook.com/${uid}/picture?type=large`;
}

// === DOWNLOAD HD PFP ===
async function downloadHDPfp(url) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    if (res.data.byteLength > 1000) return Buffer.from(res.data);
  } catch (e) {}
  const def = await axios.get('https://upload.wikimedia.org/wikipedia/commons/7/7c/Profile_avatar_placeholder_large.png', { responseType: 'arraybuffer' });
  return Buffer.from(def.data);
}

// === MAIN COMMAND (OPTIMIZED) ===
module.exports = async function handlePair(api, event, args, state) {
  console.log('PAIR COMMAND STARTED');
  const { threadID, messageID, senderID } = event;

  // SAFE STATE
  if (!state) state = {};
  if (!state.pairHistory) state.pairHistory = new Map();
  if (!state.botMessages) state.botMessages = new Map();

  // SPAM PROTECTION
  const pairKey = `pair_${threadID}`;
  const history = state.pairHistory.get(pairKey) || [];
  const active = history.filter(p => Date.now() - p.time < 300000);
  if (active.length >= 4) return api.sendMessage('Max 4 pairs. Wait!', threadID, messageID);

  // GET THREAD INFO
  let info;
  try {
    info = await new Promise((r, rej) => api.getThreadInfo(threadID, (e, d) => e ? rej(e) : r(d)));
  } catch (e) {
    return api.sendMessage('Group info failed.', threadID, messageID);
  }

  const members = info.participantIDs.filter(id => id !== senderID);
  if (members.length === 0) return api.sendMessage('No one to pair!', threadID, messageID);

  // USER 1: NAME ONLY (NO DOWNLOAD YET)
  let user1Name, user1Gender;
  try {
    const data = await new Promise((r, rej) => api.getUserInfo(senderID, (e, d) => e ? rej(e) : r(d)));
    user1Name = data[senderID].name;
    user1Gender = detectGender(user1Name);
  } catch (e) {
    return api.sendMessage('Your info failed.', threadID, messageID);
  }

  const targetGender = user1Gender === 'male' ? 'female' : 'male';

  // RANDOMLY PICK OPPOSITE GENDER (NAME ONLY)
  const oppositeMembers = [];
  for (const mid of members) {
    try {
      const data = await new Promise((r, rej) => api.getUserInfo(mid, (e, d) => e ? rej(e) : r(d)));
      const name = data[mid].name;
      if (detectGender(name) === targetGender) {
        oppositeMembers.push({ id: mid, name });
      }
    } catch (e) {}
  }

  if (oppositeMembers.length === 0) {
    // FALLBACK: ANY MEMBER
    for (const mid of members) {
      try {
        const data = await new Promise((r, rej) => api.getUserInfo(mid, (e, d) => e ? rej(e) : r(d)));
        oppositeMembers.push({ id: mid, name: data[mid].name });
      } catch (e) {}
    }
  }

  if (oppositeMembers.length === 0) return api.sendMessage('No pair found!', threadID, messageID);

  const randomPartner = oppositeMembers[Math.floor(Math.random() * oppositeMembers.length)];
  const user2Name = randomPartner.name;
  const user2ID = randomPartner.id;

  // NOW DOWNLOAD ONLY 2 PFPs
  let user1Buffer, user2Buffer;
  try {
    const [url1, url2] = await Promise.all([
      getHDPfpUrl(api, senderID),
      getHDPfpUrl(api, user2ID)
    ]);
    [user1Buffer, user2Buffer] = await Promise.all([
      downloadHDPfp(url1),
      downloadHDPfp(url2)
    ]);
  } catch (e) {
    return api.sendMessage('PFP download failed.', threadID, messageID);
  }

  // CREATE IMAGE
  let finalPath;
  try {
    const templatePath = path.join(__dirname, '..', 'pair_template.png');
    if (!fs.existsSync(templatePath)) throw new Error('pair_template.png missing!');

    const canvas = createCanvas(1200, 600);
    const ctx = canvas.getContext('2d');
    const template = await loadImage(templatePath);
    ctx.drawImage(template, 0, 0, 1200, 600);

    const [img1, img2] = await Promise.all([
      loadImage(user1Buffer),
      loadImage(user2Buffer)
    ]);

    const pfpSize = 300;
    const offset = (pfpSize - 250) / 2;
    const leftX = 150 - offset;
    const rightX = 800 - offset;
    const y = 200 - offset;

    ctx.drawImage(img1, leftX, y, pfpSize, pfpSize);
    ctx.drawImage(img2, rightX, y, pfpSize, pfpSize);

    const buffer = canvas.toBuffer('image/png');
    finalPath = path.join(__dirname, '..', 'temp', `pair_${Date.now()}.png`);
    if (!fs.existsSync(path.dirname(finalPath))) fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    fs.writeFileSync(finalPath, buffer);
  } catch (e) {
    console.error('Image error:', e);
    return api.sendMessage('Image failed.', threadID, messageID);
  }

  // SEND
  try {
    const msg = {
      body: `Perfect Pair\n${user1Name} ❤️ ${user2Name}`,
      attachment: fs.createReadStream(finalPath)
    };
    api.sendMessage(msg, threadID, (err, info) => {
      if (info) {
        const list = state.botMessages.get(threadID) || [];
        list.push(info.messageID);
        state.botMessages.set(threadID, list);
      }
      if (finalPath && fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
    }, messageID);

    const newPair = { user1: senderID, user2: user2ID, time: Date.now() };
    state.pairHistory.set(pairKey, [...active, newPair]);
  } catch (e) {
    console.error('Send error:', e);
  }
};