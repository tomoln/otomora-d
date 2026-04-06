const path = require('path');
const { pathToFileURL } = require('url');
const audioEngine = require('./AudioEngine');

// soundtouchjs は ESM のため require() では読めない。init() で dynamic import する。
const SOUNDTOUCH_PATH = pathToFileURL(
  path.join(__dirname, '../../node_modules/soundtouchjs/dist/soundtouch.js')
).href;

class TimeStretcher {
  constructor() {
    this._SoundTouch   = null;
    this._SimpleFilter = null;
  }

  // ── 初期化 ────────────────────────────────────────────────

  /**
   * soundtouchjs モジュールをロードする。
   * AudioEngine.init() の後、最初の stretch() 呼び出し前に一度だけ呼ぶ。
   */
  async init() {
    if (this._SoundTouch) return;
    const mod = await import(SOUNDTOUCH_PATH);
    this._SoundTouch   = mod.SoundTouch;
    this._SimpleFilter = mod.SimpleFilter;
  }

  // ── メイン処理 ────────────────────────────────────────────

  /**
   * AudioBuffer をオフラインでタイムストレッチし、新しい AudioBuffer を返す。
   * ピッチは変えず速度だけを変える。
   * GridPlayer は返値を BufferSourceNode に渡し、src.start(when) で精密スケジュールする。
   *
   * @param {AudioBuffer} buffer  元のスライス
   * @param {number} tempo        速度倍率 (1.0 = 等速, 2.0 = 2倍速, 0.5 = 半速)
   * @returns {AudioBuffer}
   */
  stretch(buffer, tempo) {
    const st = new this._SoundTouch();
    st.tempo = tempo;

    const L           = buffer.getChannelData(0);
    const R           = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
    const totalFrames = buffer.length;

    // soundtouchjs のソースオブジェクト（インターリーブドステレオ）
    const source = {
      extract(target, numFrames, position) {
        const toRead = Math.min(numFrames, totalFrames - position);
        if (toRead <= 0) return 0;
        for (let i = 0; i < toRead; i++) {
          target[i * 2]     = L[position + i];
          target[i * 2 + 1] = R[position + i];
        }
        return toRead;
      },
    };

    const filter    = new this._SimpleFilter(source, st);
    const chunkSize = 512;
    const chunk     = new Float32Array(chunkSize * 2);
    const collected = [];
    let totalOutput = 0;

    // ソースが尽きるまでチャンク単位で抽出
    let extracted;
    do {
      extracted = filter.extract(chunk, chunkSize);
      if (extracted > 0) {
        collected.push(chunk.slice(0, extracted * 2));
        totalOutput += extracted;
      }
    } while (extracted > 0);

    // 出力 AudioBuffer に書き戻す
    const outBuf = audioEngine.context.createBuffer(2, totalOutput, buffer.sampleRate);
    const outL   = outBuf.getChannelData(0);
    const outR   = outBuf.getChannelData(1);
    let offset   = 0;
    for (const frames of collected) {
      const count = frames.length / 2;
      for (let i = 0; i < count; i++) {
        outL[offset + i] = frames[i * 2];
        outR[offset + i] = frames[i * 2 + 1];
      }
      offset += count;
    }

    return outBuf;
  }
}

module.exports = new TimeStretcher();
