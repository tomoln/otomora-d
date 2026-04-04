const { ipcRenderer } = require('electron');

// ────────────────────────────────────────────────────────────────────────────
// MidiController
//
// main/midi/midiMain.js から IPC で転送された MIDI メッセージを受け取り、
// コールバックへ配信する。
//
// 受信するイベント:
//   'midi-message'  { type, channel, number, value, raw }
//   'midi-devices'  string[]  接続デバイス名の配列
// ────────────────────────────────────────────────────────────────────────────

class MidiController {
  constructor() {
    this._messageCallbacks = [];
    this._devicesCallbacks = [];
    this._msgListener      = null;
    this._devListener      = null;
    this._devices          = [];
  }

  // ── ライフサイクル ────────────────────────────────────────────────────────

  /**
   * IPC リスナーを登録して MIDI 受信を開始する。
   * midiMain.start(win) が先に呼ばれていること。
   */
  start() {
    this._msgListener = (_, msg) => {
      for (const cb of this._messageCallbacks) cb(msg);
    };
    this._devListener = (_, names) => {
      this._devices = names;
      for (const cb of this._devicesCallbacks) cb(names);
    };

    ipcRenderer.on('midi-message', this._msgListener);
    ipcRenderer.on('midi-devices', this._devListener);
  }

  /**
   * IPC リスナーを解除してリソースを解放する。
   */
  dispose() {
    if (this._msgListener) {
      ipcRenderer.removeListener('midi-message', this._msgListener);
      this._msgListener = null;
    }
    if (this._devListener) {
      ipcRenderer.removeListener('midi-devices', this._devListener);
      this._devListener = null;
    }
    this._messageCallbacks = [];
    this._devicesCallbacks = [];
  }

  // ── コールバック登録 ─────────────────────────────────────────────────────

  /**
   * MIDI メッセージを受け取るコールバックを登録する。
   *
   * @param {(msg: { type: string, channel: number, number: number, value: number, raw: number[] }) => void} callback
   */
  onMessage(callback) {
    this._messageCallbacks.push(callback);
  }

  /** @param {Function} callback */
  offMessage(callback) {
    this._messageCallbacks = this._messageCallbacks.filter(cb => cb !== callback);
  }

  /**
   * 接続デバイス一覧が更新されたときに呼ばれるコールバックを登録する。
   * @param {(names: string[]) => void} callback
   */
  onDevices(callback) {
    this._devicesCallbacks.push(callback);
  }

  /** @param {Function} callback */
  offDevices(callback) {
    this._devicesCallbacks = this._devicesCallbacks.filter(cb => cb !== callback);
  }

  // ── 状態参照 ─────────────────────────────────────────────────────────────

  /** 現在接続中のデバイス名一覧 */
  get devices() { return this._devices; }
}

module.exports = new MidiController();
