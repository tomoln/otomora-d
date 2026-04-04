const audioEngine  = require('./AudioEngine');
const sliceManager = require('./SliceManager');
const timeStretcher = require('./TimeStretcher');
const bpmSync      = require('./BpmSync');
const fadeManager  = require('./FadeManager');
const appStore     = require('../store/AppStore');

const GRID_SIZE = 96; // 6小節 × 16分割

class GridPlayer {
  constructor() {
    this._beatHandler  = null;
    this._currentGain  = null;  // 現在再生中スライスの GainNode
    this._isPlaying    = false;
    this._onSliceCb    = null;  // UI 通知コールバック
  }

  // ── ライフサイクル ────────────────────────────────────────────────────────

  /**
   * グリッド再生を開始する。
   * AudioEngine.init(), TimeStretcher.init(), BpmSync.start() の後に呼ぶこと。
   */
  play() {
    if (this._isPlaying) return;
    this._isPlaying = true;
    appStore.setIsPlaying(true);

    this._beatHandler = (sixteenth, when) => this._handleBeat(sixteenth, when);
    bpmSync.onBeat(this._beatHandler);
  }

  /**
   * グリッド再生を停止する。
   * 現在鳴っているスライスは短いフェードアウトで止める。
   */
  stop() {
    if (!this._isPlaying) return;
    this._isPlaying = false;
    appStore.setIsPlaying(false);

    if (this._beatHandler) {
      bpmSync.offBeat(this._beatHandler);
      this._beatHandler = null;
    }

    if (this._currentGain) {
      fadeManager.scheduleFadeOut(this._currentGain, audioEngine.context.currentTime, 0.05);
      this._currentGain = null;
    }
  }

  // ── UI コールバック ────────────────────────────────────────────────────────

  /**
   * スライスが再生されるたびに呼ばれるコールバックを登録する。
   * UI がモーラ・単語・エフェクト値を表示するために使う。
   *
   * @param {(slice: object, slot: number) => void} callback
   *   slice … SliceManager.slices の要素（word, mora, rms, f0, spectral_centroid, zcr を含む）
   *   slot  … グリッド内の位置（0〜95）
   */
  onSlice(callback) {
    this._onSliceCb = callback;
  }

  // ── 内部 ─────────────────────────────────────────────────────────────────

  _handleBeat(sixteenth, when) {
    const slices = sliceManager.slices;
    if (!slices.length) return;

    const slot     = sixteenth % GRID_SIZE;
    const slice    = slices[slot % slices.length];
    const bpm      = appStore.bpm;
    const x2       = appStore.x2;

    // 1 グリッドセルの長さ（秒）
    // 1 sixteenth = 240 / (bpm × 16) 秒
    const cellSec   = 240 / (bpm * 16);
    const targetSec = x2 ? cellSec / 2 : cellSec;

    // タイムストレッチ: スライスを targetSec に合わせる
    const buffer = this._getStretched(slice.buffer, targetSec);

    // 前のスライスが重なる場合はフェードアウトをスケジュール
    if (this._currentGain) {
      fadeManager.scheduleFadeOut(this._currentGain, when, 0.02);
    }

    // GainNode 経由で再生
    const gainNode = fadeManager.createFadeNode();
    this._currentGain = gainNode;

    const src = audioEngine.context.createBufferSource();
    src.buffer = buffer;
    src.connect(gainNode);
    src.start(when);

    // 音がセルより短い場合は終端前にフェードアウト（クリック防止）
    if (buffer.duration < targetSec - 0.02) {
      const fadeStart = when + buffer.duration - 0.02;
      if (fadeStart > when) {
        fadeManager.scheduleFadeOut(gainNode, fadeStart, 0.02);
      }
    }

    // UI へ通知（when のタイミングで発火）
    if (this._onSliceCb) {
      const delay = Math.max((when - audioEngine.context.currentTime) * 1000, 0);
      setTimeout(() => {
        if (this._onSliceCb) this._onSliceCb(slice, slot);
      }, delay);
    }
  }

  /**
   * スライスを targetSec に合わせてタイムストレッチした AudioBuffer を返す。
   * ほぼ同じ長さの場合はストレッチをスキップして元のバッファを返す。
   *
   * @param {AudioBuffer} buffer
   * @param {number} targetSec
   * @returns {AudioBuffer}
   */
  _getStretched(buffer, targetSec) {
    const sliceDur = buffer.duration;
    if (Math.abs(sliceDur - targetSec) < 0.005) {
      return buffer;
    }
    // tempo = 元の長さ / 目標の長さ
    // tempo > 1 → 速くして短くなる, tempo < 1 → 遅くして長くなる
    const tempo = sliceDur / targetSec;
    return timeStretcher.stretch(buffer, tempo);
  }
}

module.exports = new GridPlayer();
