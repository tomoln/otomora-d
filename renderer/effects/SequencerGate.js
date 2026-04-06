const audioEngine = require('../audio/AudioEngine');

// ────────────────────────────────────────────────────────────────────────────
// AudioWorklet プロセッサ
// ────────────────────────────────────────────────────────────────────────────
const WORKLET_CODE = `
class SequencerGateProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};

    // スラーレート: 2ms でゲート ON/OFF 遷移（クリック防止）
    this._fadeLen    = Math.max(1, Math.floor(sampleRate * 0.002));
    this._slew       = 1.0 / this._fadeLen;
    this._gateSmooth = 0.0; // 現在の平滑化ゲイン値

    // ステップカウンター
    this._sampleCount = 0;
    this._stepSamples = opts.stepSamples || Math.floor(sampleRate * 0.125);
    this._pattern     = opts.pattern     || [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0];
    this._patternLen  = this._pattern.length;
    this._active      = false;

    this.port.onmessage = (e) => {
      if (!e.data) return;
      if (e.data.type === 'enable') {
        this._stepSamples = e.data.stepSamples;
        this._pattern     = e.data.pattern;
        this._patternLen  = e.data.pattern.length;
        this._sampleCount = 0;
        this._gateSmooth  = 0.0;
        this._active      = true;
      } else if (e.data.type === 'disable') {
        this._active      = false;
        this._sampleCount = 0;
        this._gateSmooth  = 1.0; // パススルー時はゲイン 1
      } else if (e.data.type === 'setParams') {
        if (e.data.stepSamples != null) this._stepSamples = e.data.stepSamples;
        if (e.data.pattern     != null) {
          this._pattern    = e.data.pattern;
          this._patternLen = e.data.pattern.length;
          // ステップカウンターはリセットしない（位相を保持）
        }
      }
    };
  }

  process(inputs, outputs) {
    const input  = inputs[0];
    const output = outputs[0];
    const len    = 128;
    const inCh   = input  ? input.length  : 0;
    const outCh  = output ? output.length : 0;

    if (this._active) {
      // ── ゲート処理 ──────────────────────────────────────────────────
      for (let i = 0; i < len; i++) {
        // 現在のステップのゲートターゲット（0 or 1）
        const stepIdx = Math.floor(this._sampleCount / this._stepSamples) % this._patternLen;
        const target  = this._pattern[stepIdx] > 0 ? 1.0 : 0.0;

        // スラー（線形スムージング）でクリックを防止
        if (this._gateSmooth < target) {
          this._gateSmooth = Math.min(target, this._gateSmooth + this._slew);
        } else if (this._gateSmooth > target) {
          this._gateSmooth = Math.max(target, this._gateSmooth - this._slew);
        }

        for (let c = 0; c < outCh && c < 2; c++) {
          output[c][i] = (c < inCh && input[c]) ? input[c][i] * this._gateSmooth : 0;
        }
        this._sampleCount++;
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

    return true;
  }
}
registerProcessor('sequencer-gate-processor', SequencerGateProcessor);
`;

// ────────────────────────────────────────────────────────────────────────────
// SequencerGate（メインスレッド側）
// ────────────────────────────────────────────────────────────────────────────

const VALID_DIVISIONS = [16, 32, 64, 128];

/** デフォルトパターン（ON/OFF 交互） */
function defaultPattern(division) {
  return Array.from({ length: division }, (_, i) => i % 2 === 0 ? 1 : 0);
}

class SequencerGate {
  constructor() {
    this._node        = null;
    this._active      = false;
    this._division    = 16;
    this._bpm         = 120;
    this._pattern     = defaultPattern(16); // [1,0,1,0,...] × 8
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
        'sequencer-gate-processor',
        {
          numberOfInputs:    1,
          numberOfOutputs:   1,
          outputChannelCount: [2],
          processorOptions: {
            stepSamples: this._stepSamples(),
            pattern:     this._pattern,
          },
        }
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
   * アクティブ中に変更すると即座に stepSamples が更新される。
   * pattern はデフォルト交互パターンにリセットされる。
   * @param {16|32|64|128} div
   */
  set division(div) {
    if (!VALID_DIVISIONS.includes(div)) return;
    this._division = div;
    this._pattern  = defaultPattern(div);
    this._sendParams();
  }
  get division() { return this._division; }

  /**
   * 現在の BPM。EffectChain / UI から BpmSync の値を渡すこと。
   * @param {number} bpm
   */
  set bpm(bpm) {
    this._bpm = bpm;
    this._sendParams();
  }
  get bpm() { return this._bpm; }

  /**
   * ゲートパターン（0=OFF, 1=ON の配列）。長さは division と一致させること。
   * アクティブ中に変更すると即座に反映される（ステップ位相は保持）。
   * @param {number[]} pat
   */
  set pattern(pat) {
    this._pattern = pat;
    this._sendParams();
  }
  get pattern() { return this._pattern; }

  get active() { return this._active; }

  // ── 操作 ────────────────────────────────────────────────────────────────

  /**
   * ゲート開始。音はそのまま再生され、パターンに従ってリズム的に音量が消える。
   */
  enable() {
    if (this._active || !this._node) return;
    this._active = true;
    this._node.port.postMessage({
      type:        'enable',
      stepSamples: this._stepSamples(),
      pattern:     this._pattern,
    });
  }

  /**
   * ゲート解除。パススルーに戻す。
   */
  disable() {
    if (!this._active || !this._node) return;
    this._active = false;
    this._node.port.postMessage({ type: 'disable' });
  }

  // ── 内部ヘルパー ────────────────────────────────────────────────────────

  /**
   * 1 ステップのサンプル数を計算する。
   *   period = 240 / (BPM × division) 秒（Stutter と同じ式）
   */
  _stepSamples() {
    const periodSec = 240 / (this._bpm * this._division);
    return Math.max(1, Math.floor(periodSec * audioEngine.context.sampleRate));
  }

  _sendParams() {
    if (!this._node) return;
    this._node.port.postMessage({
      type:        'setParams',
      stepSamples: this._stepSamples(),
      pattern:     this._pattern,
    });
  }
}

module.exports = new SequencerGate();
