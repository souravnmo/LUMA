// commands/xp.js
// ---------------------------------------------------------------
//  NEON XP CARD + GLOBAL RANK (FIXED & WORKING)
// ---------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// ADD roundRect AFTER canvas is loaded
const ctxProto = require('canvas').CanvasRenderingContext2D.prototype;
ctxProto.roundRect = function (x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  this.beginPath();
  this.moveTo(x + r, y);
  this.arcTo(x + w, y, x + w, y + h, r);
  this.arcTo(x + w, y + h, x, y + h, r);
  this.arcTo(x, y + h, x, y, r);
  this.arcTo(x, y, x + w, y, r);
  this.closePath();
  return this;
};

const fontsDir = path.join(__dirname, '..', 'fonts');

function safeRegisterFont(file, family) {
  const p = path.join(fontsDir, file);
  if (fs.existsSync(p)) {
    try { require('canvas').registerFont(p, { family }); console.log(`Font: ${family}`); }
    catch (e) { console.warn(`Font ${file} load error:`, e.message); }
  }
}
safeRegisterFont('orbitron-bold.ttf', 'Orbitron');
safeRegisterFont('rajdhani-bold.ttf', 'Rajdhani');
safeRegisterFont('bebas-neue.ttf', 'Bebas Neue');

async function getName(api, uid) {
  try { const i = await api.getUserInfo(uid); return i[uid]?.name || 'User'; }
  catch { return 'User'; }
}

// ---------------------------------------------------------------
// <xp – card + rank
module.exports = async function handleXP(api, event, state) {
  const { threadID, messageID, senderID, mentions } = event;
  const targetID = mentions && Object.keys(mentions)[0] ? Object.keys(mentions)[0] : senderID;

  const totalXP = state.xpGains.get(targetID) || 0;
  const userName = await getName(api, targetID);

  // GLOBAL RANK
  const sorted = [...state.xpGains.entries()]
    .map(([uid, xp]) => ({ uid, xp }))
    .sort((a, b) => b.xp - a.xp);

  const rank = sorted.findIndex(e => e.uid === targetID) + 1;
  const totalUsers = sorted.length;

  await drawNeonCard(api, event, state, targetID, totalXP, userName, rank, totalUsers);
};

// ---------------------------------------------------------------
// <xp list – top 10
module.exports.showTop = async function (api, event, state) {
  const { threadID, messageID } = event;

  const top = [...state.xpGains.entries()]
    .map(([uid, xp]) => ({ uid, xp }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10);

  if (!top.length) return api.sendMessage('No XP data yet.', threadID, messageID);

  const lines = await Promise.all(
    top.map(async (e, i) => `${i + 1}. ${await getName(api, e.uid)} – ${e.xp} XP`)
  );

  api.sendMessage(`💠Top 10 XP Holders🌐\n\n${lines.join('\n')}`, threadID, messageID);
};

// ---------------------------------------------------------------
// DRAW NEON CARD (STYLE #2 + RANK)
async function drawNeonCard(api, event, state, uid, totalXP, userName, rank, totalUsers) {
  const { threadID, messageID } = event;

  const xpForLevel = l => l * (l + 1) * 50;
  let lvl = 0; while (totalXP >= xpForLevel(lvl + 1)) lvl++;
  const cur = xpForLevel(lvl);
  const nxt = xpForLevel(lvl + 1);
  const prog = (totalXP - cur) / (nxt - cur);
  const pct = Math.floor(prog * 100);

  const w = 800, h = 400;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  // 1. BACKGROUND
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#1a0033'); bg.addColorStop(1, '#0a001a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

  // 2. NEON LINES
  const neon = (x1, y1, x2, y2, c, blur = 30) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineWidth = 4; ctx.strokeStyle = c; ctx.shadowColor = c; ctx.shadowBlur = blur; ctx.stroke();
    ctx.shadowBlur = 0;
  };
  neon(100, 350, 400, 50, '#ff0066');
  neon(300, 380, 700, 20, '#00ffff');
  neon(0, 300, 500, 100, '#ff66cc');

  // 3. GLOW DOTS
  const dot = (x, y, r, c) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  dot(150, 200, 30, '#ff66cc');
  dot(650, 300, 25, '#00ffff');
  dot(400, 100, 20, '#ffcc00');
  dot(720, 150, 35, '#cc00ff');

  // 4. CARD
  const cx = 50, cy = 50, cw = 700, ch = 300;
  ctx.save();
  ctx.roundRect(cx, cy, cw, ch, 40);
  ctx.fillStyle = 'rgba(10,0,30,0.7)';
  ctx.shadowColor = '#cc00ff';
  ctx.shadowBlur = 40;
  ctx.fill();
  ctx.restore();

  // 5. USERNAME
  ctx.font = 'bold 48px "Bebas Neue",sans-serif';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#cc00ff';
  ctx.shadowBlur = 15;
  ctx.fillText(userName, cx + 40, cy + 80);

  // 6. LEVEL BADGE
  const bx = cx + cw - 120, by = cy + 60, br = 50;
  const ring = ctx.createRadialGradient(bx, by, br - 20, bx, by, br + 10);
  ring.addColorStop(0, '#ffcc00'); ring.addColorStop(1, 'transparent');
  ctx.fillStyle = ring;
  ctx.fillRect(bx - br - 10, by - br - 10, (br + 10) * 2, (br + 10) * 2);

  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
  const badgeFill = ctx.createLinearGradient(bx - br, by - br, bx + br, by + br);
  badgeFill.addColorStop(0, '#4d2600'); badgeFill.addColorStop(1, '#1a0d00');
  ctx.fillStyle = badgeFill; ctx.fill();

  ctx.font = 'bold 36px "Orbitron",sans-serif';
  ctx.fillStyle = '#ffcc00';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff9900';
  ctx.shadowBlur = 10;
  ctx.fillText(lvl + '', bx, by - 5);

  ctx.font = 'bold 18px "Orbitron",sans-serif';
  ctx.fillStyle = '#ff9900';
  ctx.fillText('LEVEL', bx, by + 25);

  // 7. PROGRESS BAR
  const barX = cx + 40, barY = cy + 160, barW = cw - 160, barH = 40;
  ctx.roundRect(barX, barY, barW, barH, 20);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 20;
  ctx.fill(); ctx.shadowBlur = 0;

  ctx.roundRect(barX, barY, barW * prog, barH, 20);
  const fillGrad = ctx.createLinearGradient(barX, barY, barX + barW * prog, barY + barH);
  fillGrad.addColorStop(0, '#ff6600');
  fillGrad.addColorStop(0.5, '#ff00cc');
  fillGrad.addColorStop(1, '#00ffff');
  ctx.fillStyle = fillGrad;
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 25;
  ctx.fill(); ctx.shadowBlur = 0;

  // 8. PERCENT
  ctx.font = 'bold 36px "Rajdhani",sans-serif';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 15;
  ctx.textAlign = 'left';
  ctx.fillText(`${pct}%`, barX + barW + 20, barY + barH / 2 + 5);

  // 9. RANK
  ctx.font = 'bold 32px "Rajdhani",sans-serif';
  ctx.fillStyle = '#ffcc00';
  ctx.shadowColor = '#ff9900';
  ctx.shadowBlur = 10;
  ctx.textAlign = 'center';
  ctx.fillText(`#${rank} / #${totalUsers}`, w / 2, cy + ch - 40);

  // 10. SEND
  const tmp = path.join(__dirname, '..', 'temp_xp.png');
  fs.writeFileSync(tmp, canvas.toBuffer('image/png'));

  const msg = { body: `XP Stats`, attachment: fs.createReadStream(tmp) };
  await new Promise((res, rej) => {
  api.sendMessage(msg, threadID, (err, info) => {
    fs.unlink(tmp, () => {});
    if (err) return rej(err);
    res(info);
  }, messageID); // ← reply to original message
});
}