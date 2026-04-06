// ── スピーカーモニタリング ─────────────────────────────────────────────────────
// true:  システムデフォルト出力（スピーカーにも音が出る）
// false: BlackHole のみに出力（スピーカーから音が出ない）
// アプリを再起動すると反映される。
const MONITOR_SPEAKERS = false;

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
  async init() {
    if (this._context) return;

    this._context = new AudioContext();

    if (!MONITOR_SPEAKERS) {
      try {
        await this._selectBlackHole();
      } catch (e) {
        console.error('⚠️ BlackHole への切り替えに失敗しました。デフォルトデバイスを使用します。', e);
      }
    }

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

  // ── 内部 ─────────────────────────────────────────────────

  /**
   * 出力デバイスを BlackHole に切り替える。
   * MONITOR_SPEAKERS = false のときのみ呼ばれる。
   */
  async _selectBlackHole() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      console.warn('⚠️ enumerateDevices が利用できません。');
      return;
    }
    if (typeof this._context.setSinkId !== 'function') {
      console.warn('⚠️ setSinkId が利用できません（Electron のバージョンが古い可能性があります）。');
      return;
    }

    // デバイスラベルを取得するためにマイク権限を一時取得してすぐ解放
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (_) {}

    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter(d => d.kind === 'audiooutput');
    console.log('🔍 検出された出力デバイス:', outputs.map(d => `${d.label} [${d.deviceId}]`));

    // "BlackHole 2ch" を優先。Aggregate デバイスより実デバイスを狙う。
    const bh = outputs.find(d => /blackhole\s*2ch/i.test(d.label))
            ?? outputs.find(d => d.label.toLowerCase().includes('blackhole') && d.deviceId !== 'default');
    console.log('🎯 選択デバイス:', bh ? `${bh.label} [${bh.deviceId}]` : 'なし');

    if (bh && bh.deviceId && bh.deviceId !== 'default') {
      await this._context.setSinkId(bh.deviceId);
      console.log('🎛️ 出力先を BlackHole に設定しました:', bh.label);
    } else {
      console.warn('⚠️ 有効な BlackHole デバイス ID が取得できませんでした。デフォルトデバイスを使用します。');
    }
  }
}

module.exports = new AudioEngine();
