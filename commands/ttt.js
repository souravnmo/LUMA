// commands/qar.js
const fs = require('fs');
const path = require('path');
const bank = require('./bank');               // <-- 1. Import bank

const QUESTIONS_FILE = path.join(__dirname, '..', 'questions.json');

/*  threadID → { messageID, answer, rewarded:Set, unsendTimer }  */
const activeQuizzes = new Map();

function loadQuestions() {
  try {
    if (fs.existsSync(QUESTIONS_FILE)) {
      return JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
    }
  } catch (e) { console.error('loadQuestions error:', e); }
  return [
    { question: 'The Earth is round.', answer: true },
    { question: 'The sun rises in the west.', answer: false },
    { question: 'Water freezes at 0°C.', answer: true },
    { question: 'Humans have 206 bones.', answer: true },
    { question: 'Mount Everest is the tallest mountain.', answer: true }
  ];
}

function saveQuestions(q) {
  try { fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(q, null, 2)); }
  catch (e) { console.error('saveQuestions error:', e); }
}

/* --------------------------------------------------------------
   COMMAND HANDLER
   -------------------------------------------------------------- */
async function handleCommand(api, event, args, state) {
  const { threadID, messageID } = event;
  const sub = args[1] ? args[1].toLowerCase() : '';

  /* ---------- <qar basic ---------- */
  if (sub === 'basic') {
    const questions = loadQuestions();
    if (!questions.length) {
      return api.sendMessage('No questions! Add with `<qar add "Q?" true/false`', threadID, messageID);
    }

    const { question, answer } = questions[Math.floor(Math.random() * questions.length)];

    const quizMsg = `Quiz Time!\n\n${question}\n\n😆 TRUE 😮 FALSE\n\n*20 seconds only!*`;

    let info;
    try {
      info = await new Promise((r, rej) => api.sendMessage(quizMsg, threadID, (e, i) => e ? rej(e) : r(i)));
    } catch (e) {
      console.error(e);
      return api.sendMessage('Failed to start quiz.', threadID, messageID);
    }

    if (!info?.messageID) return api.sendMessage('Failed to send quiz.', threadID, messageID);

    // 20-second auto-unsend
    const unsendTimer = setTimeout(() => {
      api.unsendMessage(info.messageID, () => {});
      activeQuizzes.delete(threadID);
    }, 20_000);

    activeQuizzes.set(threadID, {
      messageID: info.messageID,
      answer,
      rewarded: new Set(),
      unsendTimer
    });

    return;
  }

  /* ---------- <qar add "Q?" true/false ---------- */
  if (sub === 'add') {
    if (args.length < 4) return api.sendMessage('`<qar add "Q?" true`', threadID, messageID);
    const qText = args.slice(2, -1).join(' ');
    const ans   = args[args.length - 1].toLowerCase() === 'true';
    if (!['true', 'false'].includes(args[args.length - 1].toLowerCase())) {
      return api.sendMessage('Answer must be **true** or **false**', threadID, messageID);
    }
    const list = loadQuestions();
    list.push({ question: qText, answer: ans });
    saveQuestions(list);
    return api.sendMessage(`Added: "${qText}" → ${ans ? 'TRUE' : 'FALSE'}`, threadID, messageID);
  }

  /* ---------- Help ---------- */
  api.sendMessage(
    '`<qar basic` – start a 20-second true/false quiz\n' +
    '`<qar add "Q?" true/false` – add a question',
    threadID, messageID
  );
}

/* --------------------------------------------------------------
   REACTION HANDLER
   -------------------------------------------------------------- */
async function handleReaction(api, event, state) {
  const { threadID, messageID, reaction, userID } = event;
  const quiz = activeQuizzes.get(threadID);
  if (!quiz || quiz.messageID !== messageID) return;

  // map reaction → bool
  const choice = reaction === '😆' ? true : reaction === '😮' ? false : null;
  if (choice === null) return;               // ignore other emojis

  // already rewarded?
  if (quiz.rewarded.has(userID)) return;

  const userInfo = await new Promise(r => api.getUserInfo(userID, (_, d) => r(d[userID] || {})));
  const name = userInfo.name || 'User';

  if (choice === quiz.answer) {
    // ----- GIVE $100 TO THE WINNER -----
    await bank.addMoney(userID, 100, 'usd', state);   // <-- 2. exact call you use elsewhere
    quiz.rewarded.add(userID);

    api.sendMessage(`Congratulations, ${name}! You earned **$100**!`, threadID);
  } else {
    api.sendMessage(`Wrong, ${name}. It was **${quiz.answer ? 'TRUE' : 'FALSE'}**.`, threadID);
  }

  // stop the auto-unsend (someone already answered)
  clearTimeout(quiz.unsendTimer);
  setTimeout(() => api.unsendMessage(quiz.messageID, () => {}), 3_000); // unsend after 3 s
  activeQuizzes.delete(threadID);
}

module.exports = { handleCommand, handleReaction };