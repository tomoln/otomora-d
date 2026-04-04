const audioEngine = require('../audio/AudioEngine');

// ────────────────────────────────────────────────────────────────────────────
// AudioWorklet プロセッサ
// ────────────────────────────────────────────────────────────────────────────
const WORKLET_CODE = `
class GranularFreezeProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};
    this._grainMs   = opts.grainMs   || 80;   // グレイン長 (ms)
    this._numGrains = opts.numGrains || 6;    // 同時グレイン数

    // グレインのサンプル数と、スナップショットサイズ（グレイン長 × 4）
    this._grainSamples = Math.floor(sampleRate * this._grainMs / 1000);
    this._snapSize     = this._grainSamples * 4;

    // 入力をバッファリングするリングバッファ（2^17 = 131072 ≈ 3s @ 44100Hz）
    this._SIZE  = 131072;
    this._mask  = this._SIZE - 1;
    this._rings = [new Float32Array(this._SIZE), new Float32Array(this._SIZE)];
    this._writeIdx = 0;

    // スナップショットバッファ（freeze 時に書き込む）
    this._snap   = [new Float32Array(this._snapSize), new Float32Array(this._snapSize)];
    this._active = false;

    // グレインの状態（各グレインは位置とスナップ内オフセットを持つ）
    const maxStart = Math.max(1, this._snapSize - this._grainSamples);
    this._grains = Array.from({ length: this._numGrains }, (_, i) => ({
      pos:      Math.floor((i / this._numGrains) * this._grainSamples), // 等間隔スタート
      bufStart: Math.floor(Math.random() * maxStart),
    }));

    this.port.onmessage = (e) => {
      if (!e.data) return;
      if (e.data.type === 'freeze') {
        this._snapshot();
        this._active = true;
      } else if (e.data.type === 'thaw') {
        this._active = false;
      }
    };
  }

  // ── スナップショット取得（直近 snapSize サンプルをコピー）────────────────
  _snapshot() {
    const mask     = this._mask;
    const base     = this._writeIdx - this._snapSize;
    const maxStart = Math.max(1, this._snapSize - this._grainSamples);

    for (let i = 0; i < this._snapSize; i++) {
      const rIdx = (base + i) & mask;
      this._snap[0][i] = this._rings[0][rIdx];
      this._snap[1][i] = this._rings[1][rIdx];
    }

    // グレインをリセット（等間隔スタートで途切れなく重なる）
    for (let g = 0; g < this._numGrains; g++) {
      this._grains[g].pos      = Math.floor((g / this._numGrains) * this._grainSamples);
      this._grains[g].bufStart = Math.floor(Math.random() * maxStart);
    }
  }

  // ── Hann 窓（グレイン前後をクロスフェードし "途切れ" をなくす）────────
  _hann(pos, size) {
    return 0.5 * (1 - Math.cos(2 * Math.PI * pos / size));
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

    if (this._active) {
      // ── グラニュラー出力 ─────────────────────────────────────────────
      const grainSz  = this._grainSamples;
      const maxStart = Math.max(1, this._snapSize - grainSz);
      // Hann 窓の平均は 0.5 → N グレインの合算ゲイン ≈ numGrains × 0.5
      const norm = this._numGrains * 0.5;

      for (let i = 0; i < len; i++) {
        let sumL = 0, sumR = 0;

        for (const g of this._grains) {
          const env = this._hann(g.pos, grainSz);
          const idx = g.bufStart + g.pos;
          sumL += this._snap[0][idx] * env;
          sumR += this._snap[1][idx] * env;

          g.pos++;
          if (g.pos >= grainSz) {
            // グレイン終端 → スナップ内のランダム位置から再スタート
            g.pos      = 0;
            g.bufStart = Math.floor(Math.random() * maxStart);
          }
        }

        if (outCh > 0) output[0][i] = sumL / norm;
        if (outCh > 1) output[1][i] = sumR / norm;
      }
    } else {
      // ── パススルー（入力をそのまま出力）────────────────────────────
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
registerProcessor('granular-freeze-processor', GranularFreezeProcessor);
`;

// ────────────────────────────────────────────────────────────────────────────
// GranularFreeze（メインスレッド側）
// ────────────────────────────────────────────────────────────────────────────
class GranularFreeze {
  constructor() {
    this._node        = null;
    this._active      = false;
    this._grainMs     = 80;  // グレイン長 ms（デフォルト）
    this._numGrains   = 6;   // 同時グレイン数（多いほど密に重なる）
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
        'granular-freeze-processor',
        {
          numberOfInputs:    1,
          numberOfOutputs:   1,
          outputChannelCount: [2],
          processorOptions: {
            grainMs:   this._grainMs,
            numGrains: this._numGrains,
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

  // ── パラメータ（init() 前に設定しておくこと）────────────────────────────

  /** グレイン長 ms（デフォルト 80ms）。長いほどピッチ感が安定する */
  set grainMs(ms)  { this._grainMs = ms; }
  get grainMs()    { return this._grainMs; }

  /** 同時再生グレイン数（デフォルト 6）。多いほど密に重なる */
  set numGrains(n) { this._numGrains = n; }
  get numGrains()  { return this._numGrains; }

  get active() { return this._active; }

  // ── 操作 ────────────────────────────────────────────────────────────────

  /**
   * その瞬間の音をスナップショットしてグラニュラーフリーズを開始する。
   * 以降はグレインがループし続け、フリーズ音が鳴り続ける。
   */
  enable() {
    if (this._active || !this._node) return;
    this._active = true;
    this._node.port.postMessage({ type: 'freeze' });
  }

  /**
   * グラニュラーフリーズを解除し、通常再生（パススルー）に戻す。
   * ワークレット内のリングバッファは常に入力を書き続けているため、
   * オフにした瞬間から「本来の再生位置」の音がシームレスに出力される。
   */
  disable() {
    if (!this._active || !this._node) return;
    this._active = false;
    this._node.port.postMessage({ type: 'thaw' });
  }
}

module.exports = new GranularFreeze();
