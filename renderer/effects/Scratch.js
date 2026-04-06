const audioEngine = require('../audio/AudioEngine');

// ────────────────────────────────────────────────────────────────────────────
// AudioWorklet プロセッサ
// ────────────────────────────────────────────────────────────────────────────
const WORKLET_CODE = `
class ScratchProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};

    // 入力をバッファリングするリングバッファ（2^17 ≈ 3s @ 44100Hz）
    this._SIZE  = 131072;
    this._mask  = this._SIZE - 1;
    this._rings = [new Float32Array(this._SIZE), new Float32Array(this._SIZE)];
    this._writeIdx = 0;

    // スクラッチウィンドウ（enable 時にスナップショットするバッファ）
    this._maxWin = Math.floor(sampleRate * 1.0); // 最大 1 秒
    this._win    = [new Float32Array(this._maxWin), new Float32Array(this._maxWin)];
    this._winLen = 0;

    // LFO 状態
    this._lfoPhase = 0.0;
    this._lfoRate  = opts.lfoRate  || 4.0;  // Hz（スクラッチの往復速度）
    this._lfoDepth = opts.lfoDepth || 1.2;  // speed 振れ幅 (>1.0 で逆再生が発生)

    // readPos は浮動小数点でウィンドウ内を移動
    this._readPos = 0.0;
    this._active  = false;

    this.port.onmessage = (e) => {
      if (!e.data) return;
      if (e.data.type === 'enable') {
        this._snapshot(e.data.windowSamples);
        this._active = true;
      } else if (e.data.type === 'disable') {
        this._active   = false;
        this._readPos  = 0.0;
        this._lfoPhase = 0.0;
      } else if (e.data.type === 'setParams') {
        if (e.data.lfoRate  != null) this._lfoRate  = e.data.lfoRate;
        if (e.data.lfoDepth != null) this._lfoDepth = e.data.lfoDepth;
      }
    };
  }

  // ── 直近 windowSamples をスクラッチウィンドウにコピー ────────────────────
  _snapshot(windowSamples) {
    this._winLen   = Math.min(Math.max(1, windowSamples), this._maxWin);
    this._readPos  = 0.0;
    this._lfoPhase = 0.0;
    const base = this._writeIdx - this._winLen;
    const mask = this._mask;
    for (let i = 0; i < this._winLen; i++) {
      const rIdx = (base + i) & mask;
      this._win[0][i] = this._rings[0][rIdx];
      this._win[1][i] = this._rings[1][rIdx];
    }
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

    if (this._active && this._winLen > 0) {
      // ── スクラッチ出力 ───────────────────────────────────────────────
      //  speed = 1.0 + depth × sin(lfoPhase)
      //  depth > 1.0 のとき speed が負になり逆再生が発生 → スクラッチ感
      //  readPos が 0 より前になったら winLen（終点）へラップ
      //  readPos が winLen 以上になったら 0（始点）へラップ
      const lfoInc = (this._lfoRate / sampleRate) * (2 * Math.PI);
      const depth  = this._lfoDepth;
      const winLen = this._winLen;

      for (let i = 0; i < len; i++) {
        const speed = 1.0 + depth * Math.sin(this._lfoPhase);
        this._lfoPhase += lfoInc;
        if (this._lfoPhase >= 2 * Math.PI) this._lfoPhase -= 2 * Math.PI;

        this._readPos += speed;

        // ラップ処理（仕様: 始点より前 → 終点へ、終点より後 → 始点へ）
        if (this._readPos < 0)       this._readPos += winLen;
        if (this._readPos >= winLen) this._readPos -= winLen;

        const rIdx = Math.floor(this._readPos);
        for (let c = 0; c < outCh && c < 2; c++) {
          output[c][i] = this._win[c][rIdx];
        }
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
registerProcessor('scratch-processor', ScratchProcessor);
`;

// ────────────────────────────────────────────────────────────────────────────
// Scratch（メインスレッド側）
// ────────────────────────────────────────────────────────────────────────────
class Scratch {
  constructor() {
    this._node        = null;
    this._active      = false;
    this._lfoRate     = 4.0;   // Hz: スクラッチの往復速度（デフォルト 4Hz）
    this._lfoDepth    = 1.2;   // speed 振れ幅（>1 で逆再生が混じりスクラッチ感が出る）
    this._windowMs    = 250;   // スクラッチウィンドウ長 ms
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
        'scratch-processor',
        {
          numberOfInputs:    1,
          numberOfOutputs:   1,
          outputChannelCount: [2],
          processorOptions: {
            lfoRate:  this._lfoRate,
            lfoDepth: this._lfoDepth,
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
   * LFO レート Hz（スクラッチの往復速度）。
   * アクティブ中に変更すると即座に反映される。
   * @param {number} hz  推奨範囲: 1〜12
   */
  set lfoRate(hz) {
    this._lfoRate = hz;
    this._sendParams();
  }
  get lfoRate() { return this._lfoRate; }

  /**
   * LFO depth（speed の振れ幅）。
   * 1.0 以上でスピードが負になる瞬間が生まれ、逆再生が混じったスクラッチ感になる。
   * @param {number} d  推奨範囲: 0.5〜1.8
   */
  set lfoDepth(d) {
    this._lfoDepth = d;
    this._sendParams();
  }
  get lfoDepth() { return this._lfoDepth; }

  /**
   * スクラッチウィンドウ長 ms（enable 時にキャプチャする範囲）。
   * BPM に合わせて 1 拍分などを渡すと自然に聴こえる。
   * @param {number} ms  デフォルト: 250ms
   */
  set windowMs(ms) { this._windowMs = ms; }
  get windowMs()   { return this._windowMs; }

  get active() { return this._active; }

  // ── 操作 ────────────────────────────────────────────────────────────────

  /**
   * スクラッチ開始。その瞬間の windowMs 分の音をキャプチャし、
   * LFO で readPos を前後させてスクラッチ感を出す。
   */
  enable() {
    if (this._active || !this._node) return;
    this._active = true;
    const windowSamples = Math.floor(this._windowMs / 1000 * audioEngine.context.sampleRate);
    this._node.port.postMessage({ type: 'enable', windowSamples });
  }

  /**
   * スクラッチ解除。パススルーに戻す。
   */
  disable() {
    if (!this._active || !this._node) return;
    this._active = false;
    this._node.port.postMessage({ type: 'disable' });
  }

  // ── 内部ヘルパー ────────────────────────────────────────────────────────

  _sendParams() {
    if (!this._node) return;
    this._node.port.postMessage({
      type:     'setParams',
      lfoRate:  this._lfoRate,
      lfoDepth: this._lfoDepth,
    });
  }
}

module.exports = new Scratch();
