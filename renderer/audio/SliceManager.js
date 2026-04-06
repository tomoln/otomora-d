const { ipcRenderer } = require('electron');
const fs = require('fs');
const audioEngine = require('./AudioEngine');

class SliceManager {
  constructor() {
    /** @type {Array<{buffer: AudioBuffer, word: string, mora: string, startTime: number, rms: number, f0: number, spectral_centroid: number, zcr: number}>} */
    this.slices = [];
  }

  // ── 読み込み ──────────────────────────────────────────────

  /**
   * アセット名（例: "001"）を受け取り、WAV と JSON を読み込んで
   * slices[] を構築する。AudioEngine.init() の後に呼ぶこと。
   * @param {string} name  例: "001"
   */
  async load(name) {
    const { audioPath, jsonPath } = await ipcRenderer.invoke('get-asset-paths', name);

    // WAV → AudioBuffer
    const wavBuf   = fs.readFileSync(audioPath);
    const arrayBuf = wavBuf.buffer.slice(wavBuf.byteOffset, wavBuf.byteOffset + wavBuf.byteLength);
    const fullBuf  = await audioEngine.context.decodeAudioData(arrayBuf);

    // JSON パース
    const words = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    // モーラ単位で切り出し
    this.slices = [];
    for (const word of words) {
      for (const mora of word.moras) {
        this.slices.push({
          buffer:            this._sliceBuffer(fullBuf, mora.start, mora.end),
          word:              word.word,
          mora:              mora.text,
          startTime:         mora.start,
          rms:               mora.rms,
          f0:                mora.f0,
          spectral_centroid: mora.spectral_centroid,
          zcr:               mora.zcr,
        });
      }
    }
  }

  /**
   * slices[] を空にする。
   */
  clear() {
    this.slices = [];
  }

  // ── 内部ユーティリティ ────────────────────────────────────

  /**
   * fullBuf から [startSec, endSec) を切り出して新しい AudioBuffer を返す。
   * @param {AudioBuffer} fullBuf
   * @param {number} startSec
   * @param {number} endSec
   * @returns {AudioBuffer}
   */
  _sliceBuffer(fullBuf, startSec, endSec) {
    const sr     = fullBuf.sampleRate;
    const start  = Math.round(startSec * sr);
    const end    = Math.min(Math.round(endSec * sr), fullBuf.length);
    const len    = Math.max(end - start, 1);
    const sliced = audioEngine.context.createBuffer(fullBuf.numberOfChannels, len, sr);

    for (let ch = 0; ch < fullBuf.numberOfChannels; ch++) {
      sliced.getChannelData(ch).set(fullBuf.getChannelData(ch).subarray(start, end));
    }
    return sliced;
  }
}

module.exports = new SliceManager();
