const audioEngine = require('../audio/AudioEngine');

// ────────────────────────────────────────────────────────────────────────────
// AudioWorklet プロセッサ
// ────────────────────────────────────────────────────────────────────────────
const WORKLET_CODE = `
class StutterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // 入力をバッファリングするリングバッファ（2^17 ≈ 3s @ 44100Hz）
    this._SIZE  = 131072;
    this._mask  = this._SIZE - 1;
    this._rings = [new Float32Array(this._SIZE), new Float32Array(this._SIZE)];
    this._writeIdx = 0;

    // スタッターバッファ（最大 500ms = ~22050 samples @ 44100Hz）
    this._maxPeriod  = Math.floor(sampleRate * 0.5);
    this._stutter    = [new Float32Array(this._maxPeriod), new Float32Array(this._maxPeriod)];
    this._stutterLen = 0;
    this._readPos    = 0;
    this._active     = false;

    this.port.onmessage = (e) => {
      if (!e.data) return;
      if (e.data.type === 'enable') {
        this._snapshot(e.data.periodSamples);
        this._active = true;
      } else if (e.data.type === 'disable') {
        this._active  = false;
        this._readPos = 0;
      } else if (e.data.type === 'setPeriod') {
        // アクティブ中に division/BPM が変わった場合、新しいチャンクを取り直す
        this._snapshot(e.data.periodSamples);
      }
    };
  }

  // ── 直近 periodSamples をスタッターバッファにコピー ─────────────────────
  _snapshot(periodSamples) {
    this._stutterLen = Math.min(Math.max(1, periodSamples), this._maxPeriod);
    const base = this._writeIdx - this._stutterLen;
    const mask = this._mask;
    for (let i = 0; i < this._stutterLen; i++) {
      const rIdx = (base + i) & mask;
      this._stutter[0][i] = this._rings[0][rIdx];
      this._stutter[1][i] = this._rings[1][rIdx];
    }
    this._readPos = 0;
  }

  process(inputs, outputs) {
    const input  = inputs[0];
    const output = outputs[0];
    const len    = 128;
    const mask   = this._mask;
    const inCh   = input  ? input.length  : 0;
    const outCh  = output ? output.length : 0;

    // ── 常に入力をリングバッファへ書き込む ──────────────────────────────
    for (let i = 0; i < len; i++) {
      const wIdx = (this._writeIdx + i) & mask;
      for (let c = 0; c < 2; c++) {
        this._rings[c][wIdx] = (c < inCh && input[c]) ? input[c][i] : 0;
      }
    }

    if (this._active && this._stutterLen > 0) {
      // ── スタッターチャンクをループ再生 ──────────────────────────────
      for (let i = 0; i < len; i++) {
        for (let c = 0; c < outCh && c < 2; c++) {
          output[c][i] = this._stutter[c][this._readPos];
        }
        this._readPos = (this._readPos + 1) % this._stutterLen;
      }
    } else {
      // ── パススルー ───────────────────────────────────────────────────
      for (let c = 0; c < outCh && c < 2; c++) {
        if (c < inCh && input[c]) {
          output[c].set(input[c]);
        } else {
          output[c].fill(0);
        }
      }
    }

    this._writeIdx += len;
    return true;
  }
}
registerProcessor('stutter-processor', StutterProcessor);
`;

// ────────────────────────────────────────────────────────────────────────────
// Stutter（メインスレッド側）
// ────────────────────────────────────────────────────────────────────────────

/** 有効な分割値 */
const VALID_DIVISIONS = [16, 32, 64, 128];

class Stutter {
  constructor() {
    this._node        = null;
    this._active      = false;
    this._division    = 16;  // 1/16 note
    this._bpm         = 120;
    this._initPromise = null;
  }

  // ── 初期化 ──────────────────────────────────────────────────────────────

  /**
   * AudioWorklet を登録してノードを生成する。
   * EffectChain.init() から呼ぶこと（await 必須）。
   */
  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
      const url  = URL.createObjectURL(blob);
      try {
        await audioEngine.context.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      this._node = new AudioWorkletNode(
        audioEngine.context,
        'stutter-processor',
        { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }
      );
    })();
    return this._initPromise;
  }

  // ── AudioGraph 挿入用ノード ─────────────────────────────────────────────

  /**
   * EffectChain が AudioGraph に挿入するノード。
   * init() 完了後に参照すること。
   * @returns {AudioWorkletNode}
   */
  get node() { return this._node; }

  // ── パラメータ ────────────────────────────────────────────────────────────

  /**
   * 分割数（16 / 32 / 64 / 128）。
   * アクティブ中に変更すると即座に新しいチャンクで更新される。
   * @param {16|32|64|128} div
   */
  set division(div) {
    if (!VALID_DIVISIONS.includes(div)) return;
    this._division = div;
    if (this._active && this._node) {
      this._node.port.postMessage({ type: 'setPeriod', periodSamples: this._periodSamples() });
    }
  }
  get division() { return this._division; }

  /**
   * 現在の BPM。EffectChain / UI から BpmSync の値を渡すこと。
   * アクティブ中に変更すると即座に周期が更新される。
   * @param {number} bpm
   */
  set bpm(bpm) {
    this._bpm = bpm;
    if (this._active && this._node) {
      this._node.port.postMessage({ type: 'setPeriod', periodSamples: this._periodSamples() });
    }
  }
  get bpm() { return this._bpm; }

  get active() { return this._active; }

  // ── 操作 ────────────────────────────────────────────────────────────────

  /**
   * スタッター開始。その瞬間の音を 1 周期分キャプチャし、ループ再生する。
   */
  enable() {
    if (this._active || !this._node) return;
    this._active = true;
    this._node.port.postMessage({ type: 'enable', periodSamples: this._periodSamples() });
  }

  /**
   * スタッター解除。パススルーに戻す。
   * リングバッファが常に入力を書き続けているため、本来の再生位置へ戻る。
   */
  disable() {
    if (!this._active || !this._node) return;
    this._active = false;
    this._node.port.postMessage({ type: 'disable' });
  }

  // ── 内部ヘルパー ────────────────────────────────────────────────────────

  /**
   * division と BPM から 1 周期のサンプル数を計算する。
   *
   *   1 小節 = 4拍 = 4 × (60/BPM) 秒
   *   division=16  → 1/16 音符 = 1小節/16
   *   period = (4 × 60 / BPM) / division = 240 / (BPM × division)
   */
  _periodSamples() {
    const periodSec = 240 / (this._bpm * this._division);
    return Math.max(1, Math.floor(periodSec * audioEngine.context.sampleRate));
  }
}

module.exports = new Stutter();
