const fs   = require('fs');
const path = require('path');

// --- DOM ---
const canvas    = document.getElementById('canvas');
const ctx       = canvas.getContext('2d');
const btnPlay   = document.getElementById('btn-play');
const btnStop   = document.getElementById('btn-stop');
const statusDiv = document.getElementById('status');

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// --- Data ---
const jsonPath = path.join(__dirname, '../../assets/json/001.json');
const words    = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
const allMoras = words.flatMap(w => w.moras);

// --- State ---
let audioCtx = null, audioBuffer = null, source = null;
let playing  = false;
let timers   = [];
let animId   = null;

const particles = [];
const rings     = [];
const textPops  = [];

// --- Color mapping ---
// f0 → hue: 80Hz=0(red), 180Hz=200(cyan/blue), 0=voiceless(white-silver)
function moraColor(mora) {
  if (mora.f0 <= 0) {
    // Voiceless: bright blue-white, higher spectral_centroid = cooler
    const h = 190 + (mora.spectral_centroid / 16000) * 70;
    return { h, s: 25, l: 82 };
  }
  const h = Math.max(0, Math.min(260, ((mora.f0 - 80) / 150) * 220));
  const l = Math.min(75, 42 + mora.rms * 130);
  return { h, s: 92, l };
}

// --- Spawn visual elements for one mora ---
function spawnMora(mora) {
  const W = canvas.width;
  const H = canvas.height;
  const { h, s, l } = moraColor(mora);

  // Position: f0 → X, spectral_centroid → Y
  const f0n = mora.f0 > 0 ? Math.max(0, Math.min(1, (mora.f0 - 80) / 160)) : 0.5;
  const cn  = Math.max(0, Math.min(1, mora.spectral_centroid / 14000));
  const cx  = W * 0.12 + f0n * W * 0.76 + (Math.random() - 0.5) * 70;
  const cy  = H * 0.88 - cn * H * 0.76  + (Math.random() - 0.5) * 45;

  // Particles
  const n = Math.round(5 + mora.rms * 90 + mora.zcr * 60);
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = (0.3 + mora.rms * 3.5 + mora.zcr * 5) * (0.4 + Math.random() * 0.9);
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - (mora.f0 > 0 ? mora.f0 / 500 : 0.1),
      life: 1.0,
      decay: 0.003 + Math.random() * 0.007,
      size: 1.2 + mora.rms * 7 * Math.random(),
      h, s, l
    });
  }

  // Expanding ring
  rings.push({
    x: cx, y: cy,
    r: 3,
    targetR: 18 + mora.rms * 160 + mora.duration * 80,
    life: 1.0,
    decay: 0.008 + (1 / Math.max(0.05, mora.duration)) * 0.003,
    lw: 0.4 + mora.rms * 2.2,
    h, s, l
  });

  // Floating text
  textPops.push({
    x: cx, y: cy - 8,
    text: mora.text,
    life: 1.0,
    decay: 0.016,
    h, s, l
  });
}

// --- Draw frame ---
function draw() {
  const W = canvas.width;
  const H = canvas.height;

  // Fade background — slow trail
  ctx.fillStyle = 'rgba(3, 4, 16, 0.13)';
  ctx.fillRect(0, 0, W, H);

  // Rings
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.r    += (r.targetR - r.r) * 0.055;
    r.life -= r.decay;
    if (r.life <= 0) { rings.splice(i, 1); continue; }
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${r.h}, ${r.s}%, ${r.l}%, ${r.life * 0.75})`;
    ctx.lineWidth   = r.lw * r.life;
    ctx.stroke();
  }

  // Constellation lines between nearby particles
  if (particles.length < 160) {
    ctx.lineWidth = 0.25;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const pa = particles[i], pb = particles[j];
        const dx = pa.x - pb.x, dy = pa.y - pb.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 6400) { // 80px
          const alpha = (1 - d2 / 6400) * Math.min(pa.life, pb.life) * 0.35;
          ctx.strokeStyle = `hsla(${(pa.h + pb.h) / 2}, 65%, 70%, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }
      }
    }
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x   += p.vx;
    p.y   += p.vy;
    p.vx  *= 0.972;
    p.vy  *= 0.972;
    p.vy  -= 0.012; // gentle float up
    p.life -= p.decay;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const r = Math.max(0.4, p.size * p.life);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.h}, ${p.s}%, ${p.l}%, ${p.life})`;
    ctx.fill();
  }

  // Floating mora text
  for (let i = textPops.length - 1; i >= 0; i--) {
    const t = textPops[i];
    t.y   -= 0.45;
    t.life -= t.decay;
    if (t.life <= 0) { textPops.splice(i, 1); continue; }
    const sz = 11 + (1 - t.life) * 8;
    ctx.font      = `bold ${sz}px sans-serif`;
    ctx.fillStyle = `hsla(${t.h}, ${t.s}%, ${t.l + 15}%, ${Math.min(1, t.life * 1.3)})`;
    ctx.textAlign = 'center';
    ctx.fillText(t.text, t.x, t.y);
  }
}

// --- Animation loop ---
function loop() {
  if (!playing) return;
  draw();
  animId = requestAnimationFrame(loop);
}

// --- Play ---
btnPlay.addEventListener('click', async () => {
  if (playing) return;
  statusDiv.textContent = '読み込み中...';
  btnPlay.disabled = true;

  try {
    audioCtx = new AudioContext();

    const wavPath  = path.join(__dirname, '../../assets/audio/001.wav');
    const wavBuf   = fs.readFileSync(wavPath);
    const arrayBuf = wavBuf.buffer.slice(wavBuf.byteOffset, wavBuf.byteOffset + wavBuf.byteLength);
    audioBuffer    = await audioCtx.decodeAudioData(arrayBuf);

    source        = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop   = true;
    source.connect(audioCtx.destination);

    const t0 = audioCtx.currentTime + 0.1;
    source.start(t0);

    // Schedule mora visual events
    const audioDur = audioBuffer.duration;
    allMoras.forEach(mora => {
      const delay = (0.1 + mora.start) * 1000;
      const tid = setTimeout(() => { if (playing) spawnMora(mora); }, delay);
      timers.push(tid);
    });

    // Re-schedule on each loop
    if (source.loop) {
      const loopInterval = audioDur * 1000;
      for (let rep = 1; rep <= 8; rep++) {
        allMoras.forEach(mora => {
          const delay = (0.1 + mora.start + audioDur * rep) * 1000;
          const tid = setTimeout(() => { if (playing) spawnMora(mora); }, delay);
          timers.push(tid);
        });
      }
    }

    playing = true;
    btnStop.disabled = false;
    statusDiv.textContent = '再生中';
    loop();

  } catch (err) {
    console.error(err);
    statusDiv.textContent = `エラー: ${err.message}`;
    btnPlay.disabled = false;
  }
});

// --- Stop ---
btnStop.addEventListener('click', () => {
  timers.forEach(t => clearTimeout(t));
  timers = [];
  if (source)   { try { source.stop(); } catch (_) {} source = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  playing = false;
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  particles.length = 0;
  rings.length     = 0;
  textPops.length  = 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  btnPlay.disabled = false;
  btnStop.disabled = true;
  statusDiv.textContent = '停止';
});
