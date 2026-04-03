const fs   = require('fs');
const path = require('path');

// --- DOM ---
const btnPlay    = document.getElementById('btn-play');
const btnStop    = document.getElementById('btn-stop');
const bpmInput   = document.getElementById('bpm');
const moraLog    = document.getElementById('mora-log');
const statusDiv  = document.getElementById('status');
const canvas     = document.getElementById('waveform');
const canvasWrap = document.getElementById('canvas-wrap');
const zoomSlider        = document.getElementById('zoom');
const zoomLabel         = document.getElementById('zoom-value');
const offsetValueLabel  = document.getElementById('offset-value');
const ctx2d             = canvas.getContext('2d');

// --- ズームスライダー ---
let zoom = parseFloat(zoomSlider.value);
zoomSlider.addEventListener('input', () => {
  zoom = parseFloat(zoomSlider.value);
  zoomLabel.textContent = `x${zoom}`;
});

// --- オーディオオフセット（ms単位、クリック基準でオーディオをずらす）---
let audioOffsetMs = 0;
function updateOffsetLabel() {
  offsetValueLabel.textContent = `${audioOffsetMs > 0 ? '+' : ''}${audioOffsetMs} ms`;
}
document.getElementById('btn-offset-minus10').addEventListener('click', () => { audioOffsetMs -= 10; updateOffsetLabel(); });
document.getElementById('btn-offset-minus1' ).addEventListener('click', () => { audioOffsetMs -=  1; updateOffsetLabel(); });
document.getElementById('btn-offset-plus1'  ).addEventListener('click', () => { audioOffsetMs +=  1; updateOffsetLabel(); });
document.getElementById('btn-offset-plus10' ).addEventListener('click', () => { audioOffsetMs += 10; updateOffsetLabel(); });
document.getElementById('btn-offset-reset'  ).addEventListener('click', () => { audioOffsetMs =   0; updateOffsetLabel(); });

// --- 状態 ---
let audioCtx       = null;
let analyser       = null;
let scheduledNodes = [];
let rafId          = null;
let beatTimes      = [];   // [{time, text}]
let lastBeatIdx    = 0;
let flashUntil     = 0;    // AudioContext 時刻：この時刻まで枠を赤くする

// --- キャンバスサイズをコンテナに合わせる ---
function resizeCanvas() {
  canvas.width  = canvasWrap.clientWidth;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- クリック音バッファ生成（正弦波バースト 10ms）---
function createClickBuffer(ctx) {
  const frames = Math.round(ctx.sampleRate * 0.01);
  const buf    = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data   = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = Math.sin(2 * Math.PI * 1000 * i / ctx.sampleRate)
              * Math.exp(-i / (frames * 0.3));
  }
  return buf;
}

// --- AudioBuffer から秒範囲を切り出す ---
function sliceBuffer(ctx, fullBuf, startSec, endSec) {
  const sr    = fullBuf.sampleRate;
  const start = Math.round(startSec * sr);
  const end   = Math.min(Math.round(endSec * sr), fullBuf.length);
  const len   = Math.max(end - start, 1);
  const sliced = ctx.createBuffer(fullBuf.numberOfChannels, len, sr);
  for (let ch = 0; ch < fullBuf.numberOfChannels; ch++) {
    sliced.getChannelData(ch).set(fullBuf.getChannelData(ch).subarray(start, end));
  }
  return sliced;
}

// --- ソース作成してスケジュール ---
function scheduleSource(ctx, buffer, when, destination) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(destination);
  src.start(when);
  scheduledNodes.push(src);
}

// --- 波形描画 ---
function drawWaveform() {
  if (!analyser) return;
  const W = canvas.width;
  const H = canvas.height;
  const bufLen = analyser.fftSize;
  const data   = new Float32Array(bufLen);
  analyser.getFloatTimeDomainData(data);

  ctx2d.clearRect(0, 0, W, H);
  ctx2d.fillStyle = '#111';
  ctx2d.fillRect(0, 0, W, H);

  // ゼロライン
  ctx2d.strokeStyle = '#333';
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();
  ctx2d.moveTo(0, H / 2);
  ctx2d.lineTo(W, H / 2);
  ctx2d.stroke();

  // ズーム：表示するサンプル数を減らして拡大表示
  const visibleSamples = Math.max(1, Math.floor(bufLen / zoom));
  const startSample    = Math.floor((bufLen - visibleSamples) / 2); // 中央寄せ

  const isFlash = audioCtx && audioCtx.currentTime < flashUntil;
  ctx2d.strokeStyle = isFlash ? '#ff6666' : '#00e5ff';
  ctx2d.lineWidth   = isFlash ? 2 : 1.5;
  ctx2d.beginPath();

  for (let i = 0; i < visibleSamples; i++) {
    const x = (i / (visibleSamples - 1)) * W;
    const y = (1 - (data[startSample + i] + 1) / 2) * H;
    if (i === 0) ctx2d.moveTo(x, y);
    else         ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();

  // ビートフラッシュ：キャンバス枠の CSS クラスで表現
  if (isFlash) {
    canvasWrap.classList.add('beat-flash');
  } else {
    canvasWrap.classList.remove('beat-flash');
  }
}

// --- 再生 ---
btnPlay.addEventListener('click', async () => {
  statusDiv.textContent = '読み込み中...';
  btnPlay.disabled = true;

  try {
    audioCtx = new AudioContext();

    // AnalyserNode を出力前に挟む
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.connect(audioCtx.destination);

    // 音声ファイル読み込み
    const wavPath  = path.join(__dirname, '../../assets/audio/001.wav');
    const wavBuf   = fs.readFileSync(wavPath);
    const arrayBuf = wavBuf.buffer.slice(wavBuf.byteOffset, wavBuf.byteOffset + wavBuf.byteLength);
    const fullBuf  = await audioCtx.decodeAudioData(arrayBuf);

    // JSON 読み込み → モーラをフラット配列に展開
    const jsonPath = path.join(__dirname, '../../assets/json/001.json');
    const jsonText = fs.readFileSync(jsonPath, 'utf-8');
    const words    = JSON.parse(jsonText);
    const moras    = words.flatMap(w => w.moras);

    // クリック音 / スライス準備
    const clickBuf   = createClickBuffer(audioCtx);
    const slicedBufs = moras.map(m => sliceBuffer(audioCtx, fullBuf, m.start, m.end));

    // スケジューリング
    const bpm     = Math.max(40, Math.min(300, parseInt(bpmInput.value) || 120));
    const beatSec = 60 / bpm;
    const t0      = audioCtx.currentTime + 0.1;

    beatTimes  = [];
    lastBeatIdx = 0;
    flashUntil  = 0;

    const audioOffsetSec = audioOffsetMs / 1000;
    moras.forEach((mora, n) => {
      const when      = t0 + n * beatSec;
      const audioWhen = Math.max(0, when + audioOffsetSec);
      scheduleSource(audioCtx, clickBuf,      when,      analyser);
      scheduleSource(audioCtx, slicedBufs[n], audioWhen, analyser);
      beatTimes.push({ time: when, text: mora.text });
    });

    // UI / 描画ループ
    function tick() {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;

      // ビート検出：時刻を超えたビートを処理
      while (lastBeatIdx < beatTimes.length && beatTimes[lastBeatIdx].time <= now) {
        moraLog.textContent = beatTimes[lastBeatIdx].text;
        flashUntil = beatTimes[lastBeatIdx].time + 0.08; // 80ms フラッシュ
        lastBeatIdx++;
      }

      drawWaveform();

      if (lastBeatIdx < beatTimes.length || now < beatTimes[beatTimes.length - 1].time + 1.0) {
        rafId = requestAnimationFrame(tick);
      } else {
        statusDiv.textContent = '再生完了';
        btnPlay.disabled = false;
        btnStop.disabled = true;
        canvasWrap.classList.remove('beat-flash');
      }
    }
    rafId = requestAnimationFrame(tick);

    btnStop.disabled = false;
    statusDiv.textContent = `再生中 (BPM ${bpm})`;

  } catch (err) {
    console.error(err);
    statusDiv.textContent = `エラー: ${err.message}`;
    btnPlay.disabled = false;
  }
});

// --- 停止 ---
btnStop.addEventListener('click', () => {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  scheduledNodes.forEach(n => { try { n.stop(); } catch (_) {} });
  scheduledNodes = [];
  beatTimes      = [];
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  analyser = null;
  canvasWrap.classList.remove('beat-flash');
  moraLog.textContent  = '—';
  btnPlay.disabled     = false;
  btnStop.disabled     = true;
  statusDiv.textContent = '停止';
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
});
