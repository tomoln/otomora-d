const fs   = require('fs');
const path = require('path');

// --- DOM ---
const btnPlay     = document.getElementById('btn-play');
const btnStop     = document.getElementById('btn-stop');
const btnDrop     = document.getElementById('btn-drop');
const dropDurSlider = document.getElementById('drop-duration');
const dropDurLabel  = document.getElementById('drop-dur-value');
const statusDiv   = document.getElementById('status');

// --- ズームスライダー ---
dropDurSlider.addEventListener('input', () => {
  dropDurLabel.textContent = parseFloat(dropDurSlider.value).toFixed(1);
});

// --- 状態 ---
let audioCtx     = null;
let audioBuffer  = null;  // デコード済みフルバッファ
let source       = null;  // 現在の AudioBufferSourceNode
let isDropping   = false; // ピッチドロップ中か

// 再生位置の追跡に使う
// 通常速度での再生位置 = playbackStartPos + (audioCtx.currentTime - sourceStartTime)
let playbackStartPos = 0;   // source を start() したときのバッファ内オフセット（秒）
let sourceStartTime  = 0;   // source を start() した AudioContext 時刻

function normalPositionNow() {
  if (!audioCtx || !source) return playbackStartPos;
  return playbackStartPos + (audioCtx.currentTime - sourceStartTime);
}

// --- ピッチドロップ曲線を生成（1.0 → 0.001 の凸型カーブ）---
function makeDropCurve(steps = 256) {
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    // 凸型（レコードらしい急落ち → 尾引き）
    const t = i / (steps - 1);
    curve[i] = Math.pow(1 - t, 1.8) * 0.999 + 0.001;
  }
  return curve;
}

// --- ソース作成・接続・再生 ---
function createAndStartSource(offsetSec) {
  source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop   = true;
  source.connect(audioCtx.destination);

  playbackStartPos = offsetSec;
  sourceStartTime  = audioCtx.currentTime;
  source.start(0, offsetSec);
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

    isDropping = false;
    btnDrop.textContent = 'ピッチドロップ ON';
    btnDrop.classList.remove('active');
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
  if (source)   { try { source.stop(); } catch (_) {} source = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  audioBuffer  = null;
  isDropping   = false;
  btnDrop.textContent = 'ピッチドロップ ON';
  btnDrop.classList.remove('active');
  btnPlay.disabled = false;
  btnStop.disabled = true;
  statusDiv.textContent = '停止';
});

// --- ピッチドロップ トグル ---
btnDrop.addEventListener('click', () => {
  if (!source || !audioCtx) return;

  if (!isDropping) {
    // --- ON: ピッチを下げていく ---
    isDropping = true;
    btnDrop.textContent = 'ピッチドロップ OFF（解除）';
    btnDrop.classList.add('active');
    statusDiv.textContent = 'ピッチドロップ中...';

    const dur   = parseFloat(dropDurSlider.value);
    const curve = makeDropCurve();
    source.playbackRate.cancelScheduledValues(audioCtx.currentTime);
    source.playbackRate.setValueCurveAtTime(curve, audioCtx.currentTime, dur);

  } else {
    // --- OFF: 通常再生位置から再開 ---
    isDropping = false;
    btnDrop.textContent = 'ピッチドロップ ON';
    btnDrop.classList.remove('active');
    statusDiv.textContent = '再生中（位置復元）';

    // 通常速度で進んでいたはずの位置を計算
    const resumePos = normalPositionNow() % audioBuffer.duration;

    // 現在のソースを停止
    try { source.stop(); } catch (_) {}

    // 新しいソースを通常位置から再生
    createAndStartSource(resumePos);
  }
});
