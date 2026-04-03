const fs   = require('fs');
const path = require('path');

// --- DOM ---
const btnPlay         = document.getElementById('btn-play');
const btnStop         = document.getElementById('btn-stop');
const btnFreeze       = document.getElementById('btn-freeze');
const grainSizeSlider = document.getElementById('grain-size');
const grainSizeLabel  = document.getElementById('grain-size-value');
const posRandSlider   = document.getElementById('pos-rand');
const posRandLabel    = document.getElementById('pos-rand-value');
const pitchRandSlider = document.getElementById('pitch-rand');
const pitchRandLabel  = document.getElementById('pitch-rand-value');
const statusDiv       = document.getElementById('status');

grainSizeSlider.addEventListener('input', () => { grainSizeLabel.textContent  = grainSizeSlider.value; });
posRandSlider  .addEventListener('input', () => { posRandLabel.textContent    = posRandSlider.value; });
pitchRandSlider.addEventListener('input', () => { pitchRandLabel.textContent  = parseFloat(pitchRandSlider.value).toFixed(1); });

// --- 定数 ---
const OVERLAP            = 0.25;  // グレイン重なり割合（0.25 = 常に4枚重なる）
const SCHEDULE_AHEAD     = 0.3;   // 先読み秒数
const SCHEDULE_INTERVAL_MS = 60;  // スケジューラ呼び出し間隔

// --- 状態 ---
let audioCtx         = null;
let audioBuffer      = null;
let source           = null;
let isFreezing       = false;
let playbackStartPos = 0;
let sourceStartTime  = 0;
let grainSchedulerId = null;
let nextGrainTime    = 0;
let freezePos        = 0;

function normalPositionNow() {
  if (!audioCtx) return 0;
  return playbackStartPos + (audioCtx.currentTime - sourceStartTime);
}

// --- 窓関数：フェード部分を 80% に広げた Hann 窓 ---
function makeWideHannCurve(steps = 512) {
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    // 通常の Hann より中央フラット部分を削り、なめらかさを優先
    const t = i / (steps - 1);
    curve[i] = Math.pow(Math.sin(Math.PI * t), 0.7);
  }
  return curve;
}

// --- グレイン1つをスケジュール ---
function scheduleGrain(when, grainSizeSec) {
  const bufDur = audioBuffer.duration;
  const sr     = audioBuffer.sampleRate;

  // 位置ランダム
  const posRandSec = (parseInt(posRandSlider.value) / 1000) * (Math.random() * 2 - 1);
  const center     = Math.max(grainSizeSec / 2,
                     Math.min(bufDur - grainSizeSec / 2, freezePos + posRandSec));

  const startSec   = Math.max(0, center - grainSizeSec / 2);
  const endSec     = Math.min(bufDur, center + grainSizeSec / 2);
  const startFrame = Math.round(startSec * sr);
  const endFrame   = Math.round(endSec   * sr);
  const len        = Math.max(endFrame - startFrame, 1);

  // グレインバッファ切り出し
  const grainBuf = audioCtx.createBuffer(audioBuffer.numberOfChannels, len, sr);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    grainBuf.getChannelData(ch).set(
      audioBuffer.getChannelData(ch).subarray(startFrame, endFrame)
    );
  }

  // Hann 窓
  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueCurveAtTime(makeWideHannCurve(), when, grainSizeSec);
  gainNode.connect(audioCtx.destination);

  // ピッチランダム
  const pitchRange = parseFloat(pitchRandSlider.value) / 100;
  const playbackRate = 1.0 + (Math.random() * 2 - 1) * pitchRange;

  const src = audioCtx.createBufferSource();
  src.buffer = grainBuf;
  src.playbackRate.value = playbackRate;
  src.connect(gainNode);
  src.start(when);
  src.stop(when + grainSizeSec);
}

// --- グレインスケジューラ ---
function runGrainScheduler() {
  if (!isFreezing || !audioCtx) return;

  const grainSizeSec = parseInt(grainSizeSlider.value) / 1000;
  const interval     = grainSizeSec * OVERLAP;
  const until        = audioCtx.currentTime + SCHEDULE_AHEAD;

  while (nextGrainTime < until) {
    scheduleGrain(nextGrainTime, grainSizeSec);
    nextGrainTime += interval;
  }

  grainSchedulerId = setTimeout(runGrainScheduler, SCHEDULE_INTERVAL_MS);
}

// --- 通常ソース作成・再生 ---
function createAndStartSource(offsetSec) {
  source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop   = true;
  source.connect(audioCtx.destination);
  playbackStartPos = offsetSec % audioBuffer.duration;
  sourceStartTime  = audioCtx.currentTime;
  source.start(0, playbackStartPos);
}

// --- 再生 ---
btnPlay.addEventListener('click', async () => {
  if (audioCtx) return;
  statusDiv.textContent = '読み込み中...';
  btnPlay.disabled = true;

  try {
    audioCtx = new AudioContext();

    const wavPath  = path.join(__dirname, '../../assets/audio/001.wav');
    const wavBuf   = fs.readFileSync(wavPath);
    const arrayBuf = wavBuf.buffer.slice(wavBuf.byteOffset, wavBuf.byteOffset + wavBuf.byteLength);
    audioBuffer    = await audioCtx.decodeAudioData(arrayBuf);

    createAndStartSource(0);
    btnStop.disabled = false;
    statusDiv.textContent = '再生中';

  } catch (err) {
    console.error(err);
    statusDiv.textContent = `エラー: ${err.message}`;
    btnPlay.disabled = false;
  }
});

// --- 停止 ---
btnStop.addEventListener('click', () => {
  if (isFreezing) stopFreeze(false);
  if (source)   { try { source.stop(); } catch (_) {} source = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  audioBuffer = null;
  isFreezing  = false;
  btnFreeze.textContent = 'フリーズ ON';
  btnFreeze.classList.remove('active');
  btnPlay.disabled = false;
  btnStop.disabled = true;
  statusDiv.textContent = '停止';
});

// --- フリーズ停止 ---
function stopFreeze(resumeNormal = true) {
  clearTimeout(grainSchedulerId);
  grainSchedulerId = null;
  isFreezing = false;
  btnFreeze.textContent = 'フリーズ ON';
  btnFreeze.classList.remove('active');

  if (resumeNormal && audioCtx && audioBuffer) {
    const resumePos = normalPositionNow() % audioBuffer.duration;
    createAndStartSource(resumePos);
    statusDiv.textContent = '再生中（位置復元）';
  }
}

// --- フリーズ トグル ---
btnFreeze.addEventListener('click', () => {
  if (!audioCtx || !audioBuffer) return;

  if (!isFreezing) {
    isFreezing = true;
    freezePos  = normalPositionNow() % audioBuffer.duration;

    if (source) { try { source.stop(); } catch (_) {} source = null; }

    btnFreeze.textContent = 'フリーズ OFF（解除）';
    btnFreeze.classList.add('active');
    statusDiv.textContent = `フリーズ中（位置: ${freezePos.toFixed(3)}s）`;

    nextGrainTime = audioCtx.currentTime + 0.05;
    runGrainScheduler();
  } else {
    stopFreeze(true);
  }
});
