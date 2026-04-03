const fs   = require('fs');
const path = require('path');

// --- DOM ---
const btnPlay        = document.getElementById('btn-play');
const btnStop        = document.getElementById('btn-stop');
const btnFreeze      = document.getElementById('btn-freeze');
const grainSizeSlider = document.getElementById('grain-size');
const grainSizeLabel  = document.getElementById('grain-size-value');
const statusDiv      = document.getElementById('status');

grainSizeSlider.addEventListener('input', () => {
  grainSizeLabel.textContent = grainSizeSlider.value;
});

// --- 定数 ---
const OVERLAP       = 0.5;   // グレイン同士の重なり割合
const SCHEDULE_AHEAD = 0.3;  // 何秒先までスケジュールするか
const SCHEDULE_INTERVAL_MS = 80; // スケジューラの呼び出し間隔

// --- 状態 ---
let audioCtx        = null;
let audioBuffer     = null;
let source          = null;   // 通常再生用ノード
let isFreezing      = false;

// 通常再生位置の追跡
let playbackStartPos = 0;
let sourceStartTime  = 0;

// グラニュラー用
let grainSchedulerId = null;  // setTimeout ID
let nextGrainTime    = 0;     // 次グレインの AudioContext 予定時刻
let freezePos        = 0;     // フリーズした位置（秒）

// --- 通常速度での現在位置 ---
function normalPositionNow() {
  if (!audioCtx) return 0;
  return playbackStartPos + (audioCtx.currentTime - sourceStartTime);
}

// --- Hann 窓カーブ生成 ---
function makeHannCurve(steps = 512) {
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    curve[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (steps - 1)));
  }
  return curve;
}

// --- グレイン1つを指定時刻にスケジュール ---
function scheduleGrain(when, grainSizeSec) {
  const bufDur    = audioBuffer.duration;
  const sr        = audioBuffer.sampleRate;

  // フリーズ位置を中心に前後 grainSize/2 の範囲を切り出す
  const halfGrain = grainSizeSec / 2;
  const startSec  = Math.max(0, freezePos - halfGrain);
  const endSec    = Math.min(bufDur, freezePos + halfGrain);
  const startFrame = Math.round(startSec * sr);
  const endFrame   = Math.round(endSec   * sr);
  const len        = Math.max(endFrame - startFrame, 1);

  // グレインバッファを切り出す
  const grainBuf = audioCtx.createBuffer(audioBuffer.numberOfChannels, len, sr);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    grainBuf.getChannelData(ch).set(
      audioBuffer.getChannelData(ch).subarray(startFrame, endFrame)
    );
  }

  // Hann 窓を GainNode で適用
  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueCurveAtTime(makeHannCurve(), when, grainSizeSec);
  gainNode.connect(audioCtx.destination);

  const src = audioCtx.createBufferSource();
  src.buffer = grainBuf;
  src.connect(gainNode);
  src.start(when);
  src.stop(when + grainSizeSec);
}

// --- グレインスケジューラ（フリーズ中に繰り返し呼ばれる）---
function runGrainScheduler() {
  if (!isFreezing || !audioCtx) return;

  const grainSizeSec = parseInt(grainSizeSlider.value) / 1000;
  const interval     = grainSizeSec * (1 - OVERLAP); // 重なりを考慮した間隔

  // 先読み時間内のグレインをすべてスケジュール
  const until = audioCtx.currentTime + SCHEDULE_AHEAD;
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
  // フリーズ中なら解除
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

// --- フリーズ停止（resumeNormal=true なら通常再生位置から再開）---
function stopFreeze(resumeNormal = true) {
  clearTimeout(grainSchedulerId);
  grainSchedulerId = null;
  isFreezing = false;

  btnFreeze.textContent = 'フリーズ ON';
  btnFreeze.classList.remove('active');

  if (resumeNormal && audioCtx && audioBuffer) {
    // 通常再生していた場合の位置から再開
    const resumePos = normalPositionNow() % audioBuffer.duration;
    createAndStartSource(resumePos);
    statusDiv.textContent = '再生中（位置復元）';
  }
}

// --- フリーズ トグル ---
btnFreeze.addEventListener('click', () => {
  if (!audioCtx || !audioBuffer) return;

  if (!isFreezing) {
    // --- フリーズ ON ---
    isFreezing  = true;
    freezePos   = normalPositionNow() % audioBuffer.duration;

    // 通常再生ソースを停止（グレインに切り替えるため）
    if (source) { try { source.stop(); } catch (_) {} source = null; }

    btnFreeze.textContent = 'フリーズ OFF（解除）';
    btnFreeze.classList.add('active');
    statusDiv.textContent = `フリーズ中（位置: ${freezePos.toFixed(3)}s）`;

    // グレインスケジューラ開始
    nextGrainTime = audioCtx.currentTime + 0.05;
    runGrainScheduler();

  } else {
    // --- フリーズ OFF ---
    stopFreeze(true);
  }
});
