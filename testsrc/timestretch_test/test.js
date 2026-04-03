// soundtouchjs は ESM のため、Chromium の dynamic import() で読み込む
// require() は fs/path など Node.js 組み込みモジュールのみに使用
const fs   = require('fs');
const path = require('path');

// --- DOM ---
const btnPlay        = document.getElementById('btn-play');
const btnStop        = document.getElementById('btn-stop');
const tempoSlider    = document.getElementById('tempo');
const tempoLabel     = document.getElementById('tempo-value');
const origBpmInput   = document.getElementById('original-bpm');
const targetBpmInput = document.getElementById('target-bpm');
const btnApplyBpm    = document.getElementById('btn-apply-bpm');
const statusDiv      = document.getElementById('status');

// --- 状態 ---
let audioCtx   = null;
let stNode     = null;
let soundTouch = null;

// --- テンポスライダー操作 ---
tempoSlider.addEventListener('input', () => {
  const ratio = parseFloat(tempoSlider.value);
  tempoLabel.textContent = ratio.toFixed(2);
  if (soundTouch) soundTouch.tempo = ratio;
  const orig = parseFloat(origBpmInput.value) || 120;
  targetBpmInput.value = Math.round(orig * ratio);
});

// --- BPM入力から倍率を計算 ---
btnApplyBpm.addEventListener('click', () => {
  const orig   = parseFloat(origBpmInput.value) || 120;
  const target = parseFloat(targetBpmInput.value) || 120;
  const ratio  = Math.max(0.5, Math.min(3.0, target / orig));
  tempoSlider.value = ratio;
  tempoLabel.textContent = ratio.toFixed(2);
  if (soundTouch) soundTouch.tempo = ratio;
});

// --- 再生 ---
btnPlay.addEventListener('click', async () => {
  statusDiv.textContent = '読み込み中...';
  btnPlay.disabled = true;

  try {
    // soundtouchjs を dynamic import で読み込む（ESM 対応）
    // パスは index.html の位置を基準に解決される
    const soundtouchModule = await import('../../node_modules/soundtouchjs/dist/soundtouch.js');
    const { SoundTouch, SimpleFilter, getWebAudioNode } = soundtouchModule;

    // 音声ファイルを Node.js fs で読み込む（Windows パス対応）
    const audioPath = path.join(__dirname, '../../assets/audio/001.wav');
    const nodeBuf   = fs.readFileSync(audioPath);
    const arrayBuf  = nodeBuf.buffer.slice(
      nodeBuf.byteOffset,
      nodeBuf.byteOffset + nodeBuf.byteLength
    );

    audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuf);

    // SoundTouch セットアップ
    soundTouch = new SoundTouch();
    soundTouch.tempo = parseFloat(tempoSlider.value);

    // ソース（ループ再生）
    // SimpleFilter は extract(target, numFrames, position) の3引数で呼ぶ
    // position は SimpleFilter が管理する累積フレーム数。modulo でループ
    const L = audioBuffer.getChannelData(0);
    const R = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : L;
    const totalFrames = audioBuffer.length;

    const source = {
      extract(target, numFrames, position) {
        let readPos = position % totalFrames;
        let done = 0;
        while (done < numFrames) {
          const avail  = totalFrames - readPos;
          const toRead = Math.min(numFrames - done, avail);
          for (let i = 0; i < toRead; i++) {
            target[(done + i) * 2]     = L[readPos + i];
            target[(done + i) * 2 + 1] = R[readPos + i];
          }
          readPos = (readPos + toRead) % totalFrames;
          done += toRead;
        }
        return done;
      }
    };

    const filter = new SimpleFilter(source, soundTouch);
    stNode = getWebAudioNode(audioCtx, filter);
    stNode.connect(audioCtx.destination);

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
  if (stNode)   { stNode.disconnect(); stNode = null; }
  if (audioCtx) { audioCtx.close();   audioCtx = null; }
  soundTouch = null;
  btnPlay.disabled = false;
  btnStop.disabled = true;
  statusDiv.textContent = '停止';
});
