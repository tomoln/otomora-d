const audioEngine = require('../audio/AudioEngine');

// AudioWorklet プロセッサのコード（Blob URL 経由で登録）
const WORKLET_CODE = `
class PitchDropProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'speed',
      defaultValue: 1.0,
      minValue: 0.0,
      maxValue: 1.0,
      automationRate: 'a-rate',
    }];
  }

  constructor() {
    super();
    // 2^17 = 131072 samples ≈ 3秒 @ 44100Hz（ビット AND で高速な剰余計算）
    this._SIZE   = 131072;
    this._rings  = [new Float32Array(this._SIZE), new Float32Array(this._SIZE)];
    this._writeIdx = 0;
    this._readPos  = 0.0;

    // メインスレッドから 'reset' を受け取ったら readPos を writeIdx に合わせる
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'reset') {
        this._readPos = this._writeIdx;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input  = inputs[0];
    const output = outputs[0];
    const speeds = parameters.speed;
    const len    = 128; // 標準ブロックサイズ
    const mask   = this._SIZE - 1;

    const inCh  = input  ? input.length  : 0;
    const outCh = output ? output.length : 0;

    // ── 入力をリングバッファに書き込む ──────────────────────────
    for (let i = 0; i < len; i++) {
      const wIdx = (this._writeIdx + i) & mask;
      for (let c = 0; c < 2; c++) {
        this._rings[c][wIdx] = (c < inCh && input[c]) ? input[c][i] : 0;
      }
    }

    // ── 可変速で読み出す ─────────────────────────────────────────
    for (let i = 0; i < len; i++) {
      const speed = speeds.length > 1 ? speeds[i] : speeds[0];
      const rIdx  = Math.floor(this._readPos) & mask;

      for (let c = 0; c < outCh && c < 2; c++) {
        output[c][i] = this._rings[c][rIdx];
      }

      this._readPos += Math.max(0, speed);

      // readPos が writeIdx より大幅に遅れたらスキップ（バッファ溢れ防止）
      const currentWrite = this._writeIdx + i;
      if (currentWrite - this._readPos > this._SIZE - len * 2) {
        this._readPos = currentWrite - len;
      }
    }

    this._writeIdx += len;
    return true;
  }
}
registerProcessor('pitch-drop-processor', PitchDropProcessor);
`;

class PitchDrop {
  constructor() {
    this._node         = null;
    this._active       = false;
    this._dropDuration = 2.0; // デフォルト: 2秒でピッチ 0 へ
    this._initPromise  = null;
  }

  // ── 初期化 ────────────────────────────────────────────────────

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
        'pitch-drop-processor',
        { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }
      );
    })();
    return this._initPromise;
  }

  // ── AudioGraph 挿入用ノード ───────────────────────────────────

  /**
   * EffectChain が AudioGraph に挿入するノード。
   * init() 完了後に参照すること。
   * @returns {AudioWorkletNode}
   */
  get node() { return this._node; }

  // ── パラメータ ────────────────────────────────────────────────

  /**
   * ピッチが 1.0 → 0.0 に落ちるまでの秒数。
   * enable() を呼ぶ前に設定すること。
   * @param {number} sec
   */
  set dropDuration(sec) { this._dropDuration = sec; }
  get dropDuration()    { return this._dropDuration; }

  get active() { return this._active; }

  // ── 操作 ──────────────────────────────────────────────────────

  /**
   * ピッチドロップを開始する。
   * dropDuration 秒かけて speed が 1.0 → 0.0 にランプし、音が消える。
   */
  enable() {
    if (this._active || !this._node) return;
    this._active = true;

    const speed = this._node.parameters.get('speed');
    const now   = audioEngine.context.currentTime;
    speed.cancelScheduledValues(now);
    speed.setValueAtTime(1.0, now);
    speed.linearRampToValueAtTime(0.0, now + this._dropDuration);
  }

  /**
   * ピッチドロップを解除し、通常再生に戻す。
   * ワークレット内の readPos をリセットするため、
   * オフにした瞬間の「本来の再生位置」からシームレスに再開できる。
   */
  disable() {
    if (!this._active || !this._node) return;
    this._active = false;

    const speed = this._node.parameters.get('speed');
    const now   = audioEngine.context.currentTime;
    speed.cancelScheduledValues(now);
    speed.setValueAtTime(1.0, now);

    // ワークレットに readPos リセットを指示（オフ時の再生位置を現在に合わせる）
    this._node.port.postMessage({ type: 'reset' });
  }
}

module.exports = new PitchDrop();
