const audioEngine  = require('./AudioEngine');
const sliceManager = require('./SliceManager');
const timeStretcher = require('./TimeStretcher');
const bpmSync      = require('./BpmSync');
const fadeManager  = require('./FadeManager');
const appStore     = require('../store/AppStore');

const GRID_SIZE = 96; // 6小節 × 16分割

// ── タイムストレッチ ON/OFF ────────────────────────────────────────────────────
// false にするとストレッチをスキップし、スライスをそのままの長さで再生する。
// アプリを再起動すると反映される。true/false を切り替えて試してみてください。
const ENABLE_TIME_STRETCH = false;

// ── スライス先頭フェードイン（秒）─────────────────────────────────────────────
// 全スライスの冒頭にかけるフェードインの長さ。再生開始時のクリックノイズ防止用。
// 大きくするほど滑らかに始まるが、アタックが遅れる。推奨: 0.003〜0.01
const SLICE_FADE_IN_SEC = 0.01;

// ── スライス末尾フェードアウト（秒）────────────────────────────────────────────
// 全スライスの終端にかけるフェードアウトの長さ。クリックノイズ防止用。
// 大きくするほど滑らかに消えるが、スライスの末尾が早く消える。推奨: 0.01〜0.05
const SLICE_FADE_OUT_SEC = 0.02;

class GridPlayer {
  constructor() {
    this._beatHandler  = null;
    this._currentGain  = null;  // 現在再生中スライスの GainNode
    this._isPlaying    = false;
    this._onSliceCb    = null;  // UI 通知コールバック
    this._stretchCache = new Map();

    // x2 トグルやファイル変更で targetSec が変わるためキャッシュをクリア
    const clearCache = () => this._stretchCache.clear();
    appStore.on('x2', clearCache);
    appStore.on('selectedFile', clearCache);
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
    // DEBUG: ビートハンドラーが呼ばれたことを確認
    console.log('🔥 _handleBeat called', { sixteenth, when, slicesLength: sliceManager.slices.length });

    const slices = sliceManager.slices;
    if (!slices.length) {
      console.log('❌ No slices, returning');
      return;
    }

    const bpm     = appStore.bpm;
    const x2      = appStore.x2;
    const cellSec = 240 / (bpm * 16); // Link 1 sixteenth の長さ（秒）

    if (x2) {
      // x2 ON: 1 sixteenth ごとに 2 スライスを再生（実効 BPM が 2 倍）
      const targetSec = cellSec / 2;
      this._scheduleSlice(slices, (sixteenth * 2)     % GRID_SIZE, when,               targetSec);
      this._scheduleSlice(slices, (sixteenth * 2 + 1) % GRID_SIZE, when + cellSec / 2, targetSec);
    } else {
      this._scheduleSlice(slices, sixteenth % GRID_SIZE, when, cellSec);
    }
  }

  /**
   * 指定スロットのスライスを指定時刻にスケジュールする。
   *
   * @param {Array}  slices     SliceManager.slices
   * @param {number} slot       グリッド位置 (0〜GRID_SIZE-1)
   * @param {number} when       AudioContext 時刻（スケジュール基準）
   * @param {number} targetSec  タイムストレッチの目標長さ（秒）
   */
  _scheduleSlice(slices, slot, when, targetSec) {
    const sliceIndex = slot % slices.length;
    const slice      = slices[sliceIndex];
    console.log('📦 Selected slice', { slot, mora: slice.mora, bufferDuration: slice.buffer.duration });

    // タイムストレッチ: スライスを targetSec に合わせる（結果はキャッシュ）
    const buffer = this._getStretched(slice.buffer, targetSec, sliceIndex);

    // stretch 処理に時間がかかって when が過去になった場合を補正
    const safeWhen = Math.max(when, audioEngine.context.currentTime + 0.005);

    // 前のスライスが重なる場合はフェードアウトをスケジュール
    if (this._currentGain) {
      fadeManager.scheduleFadeOut(this._currentGain, safeWhen, 0.02);
    }

    console.log('🎛️ Creating GainNode');
    const gainNode = fadeManager.createFadeNode();
    this._currentGain = gainNode;

    // 先頭フェードイン（クリックノイズ防止）
    gainNode.gain.setValueAtTime(0, safeWhen);
    gainNode.gain.linearRampToValueAtTime(1.0, safeWhen + SLICE_FADE_IN_SEC);

    const src = audioEngine.context.createBufferSource();
    src.buffer = buffer;
    src.connect(gainNode);
    console.log('▶️ Starting audio', { bufferDuration: buffer.duration, safeWhen, audioContextTime: audioEngine.context.currentTime });
    src.start(safeWhen);

    // 全スライスの終端にフェードアウト（クリックノイズ防止）
    const fadeStart = safeWhen + buffer.duration - SLICE_FADE_OUT_SEC;
    if (fadeStart > safeWhen) {
      fadeManager.scheduleFadeOut(gainNode, fadeStart, SLICE_FADE_OUT_SEC);
    }

    // UI へ通知（safeWhen のタイミングで発火）
    if (this._onSliceCb) {
      const delay = Math.max((safeWhen - audioEngine.context.currentTime) * 1000, 0);
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
  _getStretched(buffer, targetSec, cacheKey) {
    const sliceDur = buffer.duration;
    if (!ENABLE_TIME_STRETCH || Math.abs(sliceDur - targetSec) < 0.005) {
      return buffer;
    }

    const key = `${cacheKey}_${targetSec.toFixed(4)}`;
    if (this._stretchCache.has(key)) return this._stretchCache.get(key);

    // キャッシュが大きくなりすぎたらクリア（BPM が大きく変動した場合など）
    if (this._stretchCache.size >= 300) this._stretchCache.clear();

    // tempo = 元の長さ / 目標の長さ
    // tempo > 1 → 速くして短くなる, tempo < 1 → 遅くして長くなる
    const tempo = sliceDur / targetSec;
    const stretched = timeStretcher.stretch(buffer, tempo);
    this._stretchCache.set(key, stretched);
    return stretched;
  }
}

module.exports = new GridPlayer();
