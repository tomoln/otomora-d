class AudioEngine {
  constructor() {
    this._context = null;
    this._masterGain = null;
  }

  // ── ライフサイクル ────────────────────────────────────────

  /**
   * AudioContext を初期化する。
   * ユーザー操作（クリック等）を起点に呼ぶこと（ブラウザ制約）。
   */
  init() {
    if (this._context) return;

    this._context = new AudioContext();

    this._masterGain = this._context.createGain();
    this._masterGain.gain.value = 1.0;
    this._masterGain.connect(this._context.destination);
  }

  /**
   * AudioContext を閉じてリソースを解放する。
   */
  async dispose() {
    if (!this._context) return;
    await this._context.close();
    this._context = null;
    this._masterGain = null;
  }

  // ── getter ───────────────────────────────────────────────

  /** @returns {AudioContext} */
  get context() {
    return this._context;
  }

  /** @returns {GainNode} */
  get masterGain() {
    return this._masterGain;
  }

  // ── マスターボリューム ────────────────────────────────────

  /**
   * @param {number} value  0.0 〜 1.0
   */
  setMasterVolume(value) {
    if (!this._masterGain) return;
    this._masterGain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this._context.currentTime,
      0.01
    );
  }

  getMasterVolume() {
    return this._masterGain ? this._masterGain.gain.value : 1.0;
  }
}

module.exports = new AudioEngine();
