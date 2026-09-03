const canvas = document.querySelector('#range');
const ctx = canvas.getContext('2d');
const $ = (selector) => document.querySelector(selector);
const GAME_TIME_LIMIT = 5 * 60;
const DUCKS_PER_SPAWN = 4;
// Send a four-bird flock every half second for a denser range.
const DUCK_SPAWN_INTERVAL = 0.5;
// Birds were already eased to 80% of the original prototype speed. Take a
// further 30% off that value so targets stay readable across large screens.
const DUCK_SPEED_MULTIPLIER = 0.56;
const DOVE_SPEED_MULTIPLIER = 0.8;
const SCORE_TIER_SIZE = 50;
const ui = { score: $('#score'), streak: $('#streak'), lives: $('#lives'), best: $('#best'), time: $('#time-remaining'), event: $('#event-label'), notice: $('#announcement'), overlay: $('#start-overlay'), instruction: $('#instruction'), crosshair: $('#crosshair') };
const GAME = { score: 0, lives: 3, streak: 0, elapsed: 0, running: false, doubleUntil: 0, scoreLockUntil: 0, nextDuck: .35, nextDouble: 0, nextDove: 0, nextBomb: null, entities: [], particles: [], lastFrame: 0, best: Number(localStorage.getItem('duck-cover-best') || 0), nextLifeAt: 150 };
const rand = (min, max) => min + Math.random() * (max - min);
const W = () => canvas.clientWidth;
const H = () => canvas.clientHeight;
const scoreTier = () => Math.floor(GAME.score / SCORE_TIER_SIZE);
// Spawn frequency, rather than a burst size, scales with score. This keeps the
// pressure continuous: at each 50-point tier doves occur 2× as often, bombs
// 1.5× as often, and gold targets 1.2× as often.
function occurrenceMultiplier(type) {
  const tier = scoreTier();
  if (type === 'dove') return 2 ** tier;
  if (type === 'bomb') return 1.5 ** tier;
  if (type === 'gold') return 1.2 ** tier;
  return 1;
}
function nextSpawnDelay(type, min, max) { return rand(min, max) / occurrenceMultiplier(type); }

function resize() { const ratio = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(W() * ratio); canvas.height = Math.round(H() * ratio); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); }
function reset() { Object.assign(GAME, { score: 0, lives: 3, streak: 0, elapsed: 0, running: false, doubleUntil: 0, scoreLockUntil: 0, nextDuck: DUCK_SPAWN_INTERVAL, nextDouble: nextSpawnDelay('gold', 4, 10), nextDove: nextSpawnDelay('dove', 7, 16), nextBomb: null, entities: [], particles: [], lastFrame: 0, nextLifeAt: 150 }); updateHUD(); }
function updateHUD() { ui.score.textContent = String(GAME.score).padStart(4, '0'); ui.streak.textContent = GAME.streak; ui.lives.textContent = Array.from({ length: 3 }, (_, i) => i < GAME.lives ? '♥' : '♡').join(' '); ui.lives.setAttribute('aria-label', `${GAME.lives} lives`); ui.best.textContent = String(GAME.best).padStart(4, '0'); ui.time.textContent = formatTime(Math.max(0, GAME_TIME_LIMIT - GAME.elapsed)); }
function formatTime(seconds) { const wholeSeconds = Math.ceil(seconds); return `${String(Math.floor(wholeSeconds / 60)).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`; }
function announce(text, tone = '') { ui.notice.textContent = text; ui.notice.className = `announcement show ${tone}`; clearTimeout(announce.timer); announce.timer = setTimeout(() => ui.notice.className = 'announcement', 1800); }
function addEntity(type) {
  const size = type === 'bomb' ? rand(28, 35) : type === 'dove' ? rand(27, 34) : type === 'gold' ? rand(30, 37) : rand(27, 35);
  const lower = type === 'bomb' ? .27 : .14;
  const upper = type === 'bomb' ? .65 : .76;
  const fastTarget = type === 'duck' || type === 'gold' || type === 'dove';
  const side = Math.floor(rand(0, 4));
  const pad = size * 2;
  const start = side === 0 ? [-pad, rand(H() * lower, H() * upper)] : side === 1 ? [W() + pad, rand(H() * lower, H() * upper)] : side === 2 ? [rand(W() * .08, W() * .92), -pad] : [rand(W() * .08, W() * .92), H() + pad];
  // Every flight now has a real, off-screen exit point. The old flight path
  // aimed at the middle of the range and then expired on a short timer, which
  // made birds vanish in open air on larger screens.
  const destination = side === 0 ? [W() + pad, rand(H() * lower, H() * upper)] : side === 1 ? [-pad, rand(H() * lower, H() * upper)] : side === 2 ? [rand(W() * .04, W() * .96), H() + pad] : [rand(W() * .04, W() * .96), -pad];
  const distance = Math.hypot(destination[0] - start[0], destination[1] - start[1]) || 1;
  const motionScale = type === 'bomb' ? 1 : type === 'dove' ? DOVE_SPEED_MULTIPLIER : DUCK_SPEED_MULTIPLIER;
  const speed = (type === 'bomb' ? rand(150, 230) : fastTarget ? rand(390, 650) : rand(300, 480)) * motionScale;
  const vx = (destination[0] - start[0]) / distance * speed;
  const vy = (destination[1] - start[1]) / distance * speed;
  GAME.entities.push({
    type, x: start[0], y: start[1], size, direction: vx >= 0 ? 1 : -1, vx, vy,
    wobble: rand(0, Math.PI * 2), sway: rand(28, 88) * motionScale, drift: rand(-90, 90) * motionScale,
    born: GAME.elapsed, featherTone: rand(-.08, .08), wingPhase: rand(0, Math.PI * 2)
  });
}
function burst(x, y, color, amount = 10) { for (let i = 0; i < amount; i++) GAME.particles.push({ x, y, dx: rand(-72, 72), dy: rand(-88, 22), life: rand(.35, .7), size: rand(2, 5), color }); }
function scoreFloat(x, y, text, color) { GAME.particles.push({ x, y, text, life: .9, size: 14, color, float: true }); }
function grantPoints(amount, x, y) {
  if (GAME.elapsed < GAME.scoreLockUntil) { scoreFloat(x, y, 'NO SCORE', '#e04c47'); announce(`DOVE PENALTY — ${Math.ceil(GAME.scoreLockUntil - GAME.elapsed)} SEC LEFT`); return; }
  const multiplier = GAME.elapsed < GAME.doubleUntil ? 2 : 1;
  const awarded = amount * multiplier;
  GAME.score += awarded; GAME.streak += 1; scoreFloat(x, y, `+${awarded}`, multiplier === 2 ? '#ffdf6b' : '#fff7e9'); burst(x, y, multiplier === 2 ? '#ffbf3f' : '#f15d3b');
  while (GAME.score >= GAME.nextLifeAt) { if (GAME.lives < 3) { GAME.lives += 1; announce('150 POINTS — LIFE RESTORED'); } else announce('150 POINTS — MAX LIVES'); GAME.nextLifeAt += 150; }
  if (GAME.score > GAME.best) { GAME.best = GAME.score; localStorage.setItem('duck-cover-best', GAME.best); }
  updateHUD();
}
function loseLife(reason) {
  GAME.lives = Math.max(0, GAME.lives - 1); updateHUD(); burst(W() / 2, H() / 2, '#e04c47', 28); announce(reason);
  if (GAME.lives === 0) endGame();
}
function hit(entity) {
  const { x, y, type } = entity;
  GAME.entities.splice(GAME.entities.indexOf(entity), 1);
  if (type === 'duck') { grantPoints(2, x, y); return; }
  if (type === 'gold') { GAME.doubleUntil = Math.max(GAME.doubleUntil, GAME.elapsed) + rand(7, 15); GAME.nextBomb = GAME.elapsed + nextSpawnDelay('bomb', 2, 7); burst(x, y, '#ffbf3f', 18); scoreFloat(x, y, '2× ACTIVE', '#ffdf6b'); ui.instruction.innerHTML = '<b>DOUBLE RUN ACTIVE.</b> Every duck is worth 2×. Another gold duck extends the run; it never stacks to 4×.'; announce('GOLD DUCK HIT — 2× ACTIVE'); return; }
  if (type === 'bomb') { GAME.doubleUntil = 0; GAME.nextBomb = null; GAME.streak = 0; ui.instruction.innerHTML = '<b>BOMB HIT.</b> Your streak and double run are gone. Keep hunting — white doves are still off limits.'; loseLife('BOMB HIT — STREAK LOST, LIFE LOST'); return; }
  if (type === 'dove') { GAME.scoreLockUntil = GAME.elapsed + 20; ui.instruction.innerHTML = '<b>DOVE HIT.</b> No points can be earned for 20 seconds. Your double timer, if active, keeps counting down.'; loseLife('DOVE HIT — NO SCORE FOR 20 SEC'); }
}
function drawSky() {
  const horizon = H() * .54;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#17658a'); sky.addColorStop(.46, '#4ab1d1'); sky.addColorStop(1, '#c9e7d8');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W(), horizon);
  const meadow = ctx.createLinearGradient(0, horizon, 0, H());
  meadow.addColorStop(0, '#9ecb80'); meadow.addColorStop(.42, '#628f56'); meadow.addColorStop(1, '#284f3e');
  ctx.fillStyle = meadow; ctx.fillRect(0, horizon, W(), H() - horizon);

  // Warm backlight and blue haze create the extra separation between distance
  // layers, making the shooting range feel more like a small 3D landscape.
  const sun = ctx.createRadialGradient(W() * .78, H() * .16, 2, W() * .78, H() * .16, H() * .24);
  sun.addColorStop(0, '#fff9c7cc'); sun.addColorStop(.22, '#fff2ac73'); sun.addColorStop(1, '#fff2ac00');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W(), horizon);
  const cloudOffset = (GAME.elapsed * 9) % (W() + 260);
  [[.12,.18,118],[.43,.27,154],[.78,.12,125]].forEach(([x, y, s], index) => {
    const px = (W() * x + cloudOffset * (index % 2 ? -.22 : .16) + W() + 180) % (W() + 360) - 180;
    const py = H() * y;
    const cloud = ctx.createLinearGradient(0, py - s * .2, 0, py + s * .25);
    cloud.addColorStop(0, '#fffef3cf'); cloud.addColorStop(1, '#b6dbe5a3'); ctx.fillStyle = cloud;
    ctx.beginPath(); ctx.ellipse(px, py, s * .58, s * .15, 0, 0, Math.PI * 2); ctx.ellipse(px + s * .38, py - s * .05, s * .38, s * .17, 0, 0, Math.PI * 2); ctx.ellipse(px - s * .35, py + s * .01, s * .34, s * .12, 0, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = '#5d8f7a99'; ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(W()*.16, H()*.37); ctx.lineTo(W()*.3, horizon); ctx.lineTo(W()*.49, H()*.4); ctx.lineTo(W()*.68, horizon); ctx.lineTo(W()*.84, H()*.34); ctx.lineTo(W(), horizon); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#386a51b8'; ctx.beginPath(); ctx.moveTo(0, horizon + 18); ctx.quadraticCurveTo(W()*.14, horizon - 12, W()*.29, horizon + 17); ctx.quadraticCurveTo(W()*.48, horizon - 17, W()*.66, horizon + 14); ctx.quadraticCurveTo(W()*.84, horizon - 8, W(), horizon + 15); ctx.lineTo(W(), horizon + 38); ctx.lineTo(0, horizon + 38); ctx.closePath(); ctx.fill();
  // A soft, irregular treeline and a weathered fence make the range read as
  // an actual place rather than a flat colour field.
  ctx.save(); ctx.globalAlpha = .72;
  for (let i = 0; i < 38; i++) { const x = (i / 37) * W(); const treeH = H() * (.025 + ((i * 17) % 7) * .006); const treeW = treeH * (1.2 + (i % 3) * .23); ctx.fillStyle = i % 3 ? '#285e48' : '#1c503e'; ctx.beginPath(); ctx.ellipse(x, horizon + 10 - treeH, treeW, treeH * 1.28, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  const fieldGlow = ctx.createLinearGradient(0, horizon, 0, H()); fieldGlow.addColorStop(0, '#f7e6a033'); fieldGlow.addColorStop(1, '#102f2b00'); ctx.fillStyle = fieldGlow; ctx.fillRect(0, horizon, W(), H() - horizon);
  ctx.strokeStyle = '#d8be7280'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, horizon + 6); ctx.lineTo(W(), horizon + 6); ctx.stroke();
  ctx.save(); ctx.globalAlpha = .58; ctx.strokeStyle = '#b9904f'; ctx.lineWidth = 2; [H()*.69, H()*.76].forEach(y => { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W(), y + H()*.04); ctx.stroke(); }); for(let i=0;i<12;i++){ const x=i*W()/11; const y=H()*.66 + (i%2)*5; ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,H()*.82);ctx.stroke(); } ctx.restore();
  for (let i = 0; i < 18; i++) { const x = (i / 17) * W(); const top = H() * (.73 + (i % 4) * .028); ctx.strokeStyle = '#1c4a3cb5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, H()); ctx.quadraticCurveTo(x + (x - W()/2)*.11, H()*.86, x + (x - W()/2)*.14, top); ctx.stroke(); }
}
function drawGroundShadow(x, y, s) { const horizon = H() * .54; const groundY = Math.max(horizon + 12, y + (H() - y) * .28); ctx.save(); ctx.globalAlpha = .18; ctx.fillStyle = '#102f30'; ctx.beginPath(); ctx.ellipse(x, groundY, s * 1.18, Math.max(3, s * .16), 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
function drawDuck(e) {
  const { x, y, size: s, direction: d, type } = e; const isGold = type === 'gold', isDove = type === 'dove'; const flap = Math.sin(e.wingPhase + GAME.elapsed * 13);
  drawGroundShadow(x, y, s); ctx.save(); ctx.translate(x, y); ctx.scale(d, 1); ctx.rotate(flap * .045);
  const palette = isGold ? ['#fff2a2','#e9a518','#8c4c0a'] : isDove ? ['#fffef5','#dbe9e7','#9abfc1'] : ['#ffc17c','#ca643d','#713033'];
  const body = ctx.createLinearGradient(-s, -s*.55, s, s*.7); body.addColorStop(0, palette[0]); body.addColorStop(.45, palette[1]); body.addColorStop(1, palette[2]);
  ctx.shadowColor = '#173a42a6'; ctx.shadowBlur = Math.max(5, s*.22); ctx.shadowOffsetY = Math.max(2, s*.1); ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(-s*.04, 0, s*1.02, s*.52, -.03, 0, Math.PI*2); ctx.fill(); ctx.shadowColor = 'transparent';
  // Near wing: a tapered flight shape, separate primaries, and a small row of
  // coverts give the targets a more believable silhouette in motion.
  const wing = ctx.createLinearGradient(-s*1.25,-s*.9,s*.45,s*.45); wing.addColorStop(0,palette[0]);wing.addColorStop(.5,palette[1]);wing.addColorStop(1,palette[2]);ctx.fillStyle=wing;ctx.beginPath();ctx.moveTo(-s*.25,-s*.06);ctx.quadraticCurveTo(-s*(1.04+flap*.16),-s*(.9+flap*.23),-s*1.43,-s*.48);ctx.quadraticCurveTo(-s*1.1,s*.15,-s*.21,s*.3);ctx.quadraticCurveTo(s*.28,s*.2,-s*.25,-s*.06);ctx.fill();
  ctx.save();ctx.globalAlpha=.5;ctx.strokeStyle=isDove?'#a7c4c7':'#7e3430';ctx.lineWidth=Math.max(1,s*.038);for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-s*(.45+i*.15),-s*.18);ctx.lineTo(-s*(1.02+i*.11),-s*(.46-i*.03));ctx.stroke();}ctx.restore();
  ctx.fillStyle='#fff7df56';ctx.beginPath();ctx.ellipse(s*.02,-s*.22,s*.55,s*.14,-.2,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=body;ctx.beginPath();ctx.arc(s*.7,-s*.32,s*.34,0,Math.PI*2);ctx.fill();
  if (!isDove && !isGold) { ctx.fillStyle='#e7e8d0';ctx.beginPath();ctx.ellipse(s*.56,-s*.41,s*.2,s*.14,-.4,0,Math.PI*2);ctx.fill(); }
  ctx.fillStyle=isDove?'#7e9190':'#e4a13c';ctx.beginPath();ctx.moveTo(s*.98,-s*.3);ctx.lineTo(s*1.4,-s*.18);ctx.lineTo(s*.98,-s*.05);ctx.fill();
  ctx.fillStyle='#172a34';ctx.beginPath();ctx.arc(s*.79,-s*.42,Math.max(1.8,s*.065),0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(s*.81,-s*.44,Math.max(.7,s*.022),0,Math.PI*2);ctx.fill();
  ctx.fillStyle=palette[2];ctx.beginPath();ctx.moveTo(-s*.9,s*.04);ctx.lineTo(-s*1.35,s*.32);ctx.lineTo(-s*.9,s*.28);ctx.fill();
  if (isGold) { ctx.fillStyle='#fff8b4';ctx.shadowColor='#8d4a00';ctx.shadowBlur=5;ctx.font=`bold ${s*.76}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('★',-s*.05,1);ctx.shadowColor='transparent'; }
  ctx.restore();
}
function drawBomb(e) { const {x,y,size:s}=e; drawGroundShadow(x,y,s);ctx.save();ctx.translate(x,y);const metal=ctx.createRadialGradient(-s*.25,-s*.3,2,0,0,s*.86);metal.addColorStop(0,'#5a7180');metal.addColorStop(.45,'#273849');metal.addColorStop(1,'#101d2e');ctx.fillStyle=metal;ctx.shadowColor='#102b32a8';ctx.shadowBlur=7;ctx.shadowOffsetY=3;ctx.beginPath();ctx.arc(0,0,s*.77,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';ctx.strokeStyle='#d9e1dc';ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle='#263241';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(s*.2,-s*.65);ctx.quadraticCurveTo(s*.48,-s*1.2,s*.8,-s*.94);ctx.stroke();ctx.fillStyle='#ffbf3f';ctx.shadowColor='#ffbf3f';ctx.shadowBlur=8;ctx.beginPath();ctx.arc(s*.84,-s*.98,4,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';ctx.fillStyle='#f4f0db';ctx.font=`bold ${s*.75}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',0,2);ctx.restore(); }
function drawEntity(e) { if (e.type === 'bomb') drawBomb(e); else drawDuck(e); }
function drawParticles(dt) { GAME.particles = GAME.particles.filter(p => { p.life -= dt; if (p.life <= 0) return false; ctx.save();ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.color;if(p.float){ctx.font=`800 ${p.size}px "DM Mono",monospace`;ctx.textAlign='center';ctx.fillText(p.text,p.x,p.y+(1-p.life)*-38);}else{p.x+=p.dx*dt;p.y+=p.dy*dt;p.dy+=120*dt;ctx.fillRect(p.x,p.y,p.size,p.size);}ctx.restore();return true; }); }
function update(dt) {
  GAME.elapsed = Math.min(GAME.elapsed + dt, GAME_TIME_LIMIT);
  updateHUD();
  if (GAME.elapsed >= GAME_TIME_LIMIT) { endGame('TIME UP'); return; }
  if (GAME.elapsed >= GAME.nextDuck) {
    for (let i = 0; i < DUCKS_PER_SPAWN; i++) addEntity('duck');
    GAME.nextDuck += DUCK_SPAWN_INTERVAL;
  }
  if (GAME.elapsed >= GAME.nextDouble) { addEntity('gold'); GAME.nextDouble = GAME.elapsed + nextSpawnDelay('gold', 5, 15); }
  if (GAME.elapsed >= GAME.nextDove) { addEntity('dove'); GAME.nextDove = GAME.elapsed + nextSpawnDelay('dove', 8, 20); }
  if (GAME.nextBomb && GAME.elapsed >= GAME.nextBomb && GAME.elapsed < GAME.doubleUntil) { addEntity('bomb'); GAME.nextBomb = GAME.elapsed + nextSpawnDelay('bomb', 2, 7); }
  if (GAME.doubleUntil && GAME.elapsed >= GAME.doubleUntil) { GAME.doubleUntil = 0; GAME.nextBomb = null; ui.instruction.innerHTML = '<b>DOUBLE RUN OVER.</b> Keep taking ducks — special targets appear without warning.'; announce('2× RUN COMPLETE'); }
  GAME.entities = GAME.entities.filter(e => {
    e.x += (e.vx + Math.sin(GAME.elapsed * 9 + e.wobble) * e.sway) * dt;
    e.y += (e.vy + Math.cos(GAME.elapsed * 7 + e.wobble) * e.sway + e.drift) * dt;
    e.direction = e.vx >= 0 ? 1 : -1;
    // Do not time out targets. A bird is removed only once its full silhouette
    // has travelled past one of the range edges.
    const margin = e.size * 1.65;
    return e.x > -margin && e.x < W() + margin && e.y > -margin && e.y < H() + margin;
  });
}
function draw(dt = 0) { drawSky(); GAME.entities.forEach(drawEntity); drawParticles(dt); }
function refreshStatus() { const doubleActive = GAME.elapsed < GAME.doubleUntil; const lockActive = GAME.elapsed < GAME.scoreLockUntil; if (lockActive) ui.event.textContent = 'SCORE LOCKED'; else if (doubleActive) ui.event.textContent = 'DOUBLE POINT RUN'; else ui.event.textContent = 'RANGE LIVE'; }
function frame(timestamp) { if (!GAME.running) return; const dt = Math.min(.05, (timestamp - GAME.lastFrame) / 1000 || 0); GAME.lastFrame = timestamp; update(dt); draw(dt); refreshStatus(); if (GAME.running) requestAnimationFrame(frame); }
function startGame() { reset(); for (let i = 0; i < DUCKS_PER_SPAWN; i++) addEntity('duck'); ui.overlay.classList.add('hidden'); GAME.running = true; GAME.lastFrame = performance.now(); ui.instruction.innerHTML = '<b>GOOD HUNTING.</b> Targets appear without warning and move fast. Orange ducks are worth 2 points; gold ducks activate 2×.'; announce('RANGE LIVE — HIT THE ORANGE DUCKS'); requestAnimationFrame(frame); }
function endGame(reason = 'GAME OVER') { GAME.running = false; document.querySelector('.range-wrap').classList.add('game-over'); ui.overlay.classList.remove('hidden'); const timeExpired = reason === 'TIME UP'; const defeatGif = timeExpired ? '' : '<img class="game-over-gif" src="/assets/giphy.gif" alt="Animated surprised cat">'; ui.overlay.innerHTML = `<div class="overlay-card"><p class="kicker">${timeExpired ? '5 MINUTES COMPLETE' : 'RANGE CLOSED'}</p><h1>${timeExpired ? 'Time<br><i>up.</i>' : 'Game<br><i>over.</i>'}</h1>${defeatGif}<p>Final score: <b>${GAME.score}</b> &nbsp;•&nbsp; Best score: <b>${GAME.best}</b></p><button id="restart-button" class="primary-button" type="button">HUNT AGAIN <span>→</span></button><div class="rules"><div><b class="orange">●</b><span>FINAL SCORE</span><small>${GAME.score} POINTS</small></div><div><b class="danger">♥</b><span>LIVES LOST</span><small>3 OF 3</small></div><div><b class="gold">★</b><span>BEST SCORE</span><small>${GAME.best} POINTS</small></div><div><b class="dove-dot">●</b><span>TIP</span><small>DON'T HIT DOVES</small></div></div></div>`; $('#restart-button').addEventListener('click', () => { document.querySelector('.range-wrap').classList.remove('game-over'); startGame(); }); }
canvas.addEventListener('pointermove', (event) => { const rect = canvas.getBoundingClientRect(); ui.crosshair.style.display='block';ui.crosshair.style.left=`${event.clientX-rect.left}px`;ui.crosshair.style.top=`${event.clientY-rect.top}px`; });
canvas.addEventListener('pointerleave', () => ui.crosshair.style.display='none');
canvas.addEventListener('pointerdown', (event) => { if (!GAME.running) return; const rect = canvas.getBoundingClientRect();const x=event.clientX-rect.left,y=event.clientY-rect.top; const target=[...GAME.entities].reverse().find(e => Math.hypot(x-e.x,y-e.y)<e.size*1.15); if (target) hit(target); else burst(x,y,'#eef8f4',3); });
$('#start-button').addEventListener('click', startGame); window.addEventListener('resize', () => { resize(); draw(); }); resize(); draw(); updateHUD();
