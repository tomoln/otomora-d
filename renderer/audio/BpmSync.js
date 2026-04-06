const { ipcRenderer } = require('electron');
const audioEngine = require('./AudioEngine');
const appStore = require('../store/AppStore');

const LOOK_AHEAD_SEC = 0.15; // 何秒先までスケジュールするか（BPM変化への耐性と遅延のバランス）

class BpmSync {
  constructor() {
    this._callbacks    = [];       // GridPlayer が登録するコールバック
    this._scheduled    = new Set(); // スケジュール済みのグローバル 16 分音符インデックス
    this._active       = false;
    this._ipcListener  = null;
  }

  // ── ライフサイクル ────────────────────────────────────────

  /**
   * IPC リスナーを登録してビート受信を開始する。
   * AudioEngine.init() の後に呼ぶこと。
   */
  start() {
    this._active = true;
    this._ipcListener = (_, { beat, bpm }) => {
      appStore.setBpm(Math.round(bpm));
      this._schedule(beat, bpm);
    };
    ipcRenderer.on('link-beat', this._ipcListener);
  }

  /**
   * IPC リスナーを解除してスケジューラを停止する。
   */
  dispose() {
    this._active = false;
    if (this._ipcListener) {
      ipcRenderer.removeListener('link-beat', this._ipcListener);
      this._ipcListener = null;
    }
    this._scheduled.clear();
    this._callbacks = [];
  }

  // ── コールバック登録 ──────────────────────────────────────

  /**
   * 16 分音符ごとに呼ばれるコールバックを登録する。
   *
   * @param {(sixteenth: number, when: number) => void} callback
   *   sixteenth … Link 基準のグローバル 16 分音符インデックス（整数、単調増加）
   *   when      … AudioContext.currentTime でのスケジュール時刻
   */
  onBeat(callback) {
    this._callbacks.push(callback);
  }

  /**
   * @param {Function} callback
   */
  offBeat(callback) {
    this._callbacks = this._callbacks.filter(cb => cb !== callback);
  }

  // ── 内部スケジューラ ──────────────────────────────────────

  _schedule(beat, bpm) {
    const audioNow         = audioEngine.context.currentTime;
    const sixteenthSec     = (60 / bpm) / 4;
    const currentSixteenth = beat * 4; // floating-point 16 分音符位置

    // LOOK_AHEAD_SEC 先までの 16 分音符インデックスをスケジュール
    const end = currentSixteenth + LOOK_AHEAD_SEC / sixteenthSec;

    for (let n = Math.ceil(currentSixteenth); n <= end; n++) {
      if (this._scheduled.has(n)) continue;
      this._scheduled.add(n);

      const when  = audioNow + (n - currentSixteenth) * sixteenthSec;
      const delay = (n - currentSixteenth) * sixteenthSec * 1000;

      setTimeout(() => {
        this._scheduled.delete(n);
        if (!this._active) return;
        this._callbacks.forEach(cb => cb(n, when));
      }, delay);
    }
  }
}

module.exports = new BpmSync();
