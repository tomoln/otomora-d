const midiController = require('./MidiController');
const appStore       = require('../store/AppStore');

// ────────────────────────────────────────────────────────────────────────────
// MidiMapping
//
// MIDI メッセージとアクションのマッピングを管理する。
//
// 用語:
//   controlId  … MIDIイベントを一意に表す文字列 "type:channel:number"
//                例: "note_on:0:36", "cc:0:74"
//   actionName … アプリ内のアクション名
//                例: "play", "stop", "pitchDrop", "stutter"
//
// AppStore.midiMappings の形式: { [controlId]: actionName }
//
// 使い方（index.js 側）:
//   midiMapping.register('play',      () => gridPlayer.play());
//   midiMapping.register('pitchDrop', () => effectChain.pitchDrop.enable());
//   midiMapping.learn('play');  // 次の MIDI 入力を 'play' にマッピング
// ────────────────────────────────────────────────────────────────────────────

class MidiMapping {
  constructor() {
    this._handlers      = {};  // actionName → Function
    this._learningAction = null;
    this._msgHandler    = null;
  }

  // ── ライフサイクル ────────────────────────────────────────────────────────

  /**
   * MidiController の購読を開始する。
   * MidiController.start() の後に呼ぶこと。
   */
  start() {
    this._msgHandler = (msg) => this._handleMessage(msg);
    midiController.onMessage(this._msgHandler);
  }

  /**
   * 購読を解除してリソースを解放する。
   */
  dispose() {
    if (this._msgHandler) {
      midiController.offMessage(this._msgHandler);
      this._msgHandler = null;
    }
    this._handlers      = {};
    this._learningAction = null;
  }

  // ── アクション登録 ────────────────────────────────────────────────────────

  /**
   * アクション名と実行関数を登録する。
   * 同名で再登録すると上書きされる。
   *
   * @param {string}   actionName  アクション識別名
   * @param {Function} handler     MIDI トリガー時に呼ばれる関数
   */
  register(actionName, handler) {
    this._handlers[actionName] = handler;
  }

  /**
   * アクション登録を解除する。
   * @param {string} actionName
   */
  unregister(actionName) {
    delete this._handlers[actionName];
  }

  // ── マッピング操作 ────────────────────────────────────────────────────────

  /**
   * 学習モードに入る。次に受け取った MIDI メッセージを
   * actionName にマッピングして AppStore に保存する。
   * 別のアクションが学習中だった場合は上書きされる。
   *
   * @param {string} actionName
   */
  learn(actionName) {
    this._learningAction = actionName;
  }

  /**
   * 学習モードをキャンセルする。
   */
  cancelLearn() {
    this._learningAction = null;
  }

  /**
   * 学習中のアクション名（null = 学習モード外）。
   * @returns {string|null}
   */
  get learningAction() { return this._learningAction; }

  /**
   * actionName に紐づく MIDI マッピングを削除する。
   * @param {string} actionName
   */
  unmap(actionName) {
    const mappings = appStore.midiMappings;
    for (const [controlId, name] of Object.entries(mappings)) {
      if (name === actionName) {
        appStore.removeMidiMapping(controlId);
        break;
      }
    }
  }

  /**
   * 全マッピングを削除する。
   */
  unmapAll() {
    for (const controlId of Object.keys(appStore.midiMappings)) {
      appStore.removeMidiMapping(controlId);
    }
  }

  /**
   * actionName に現在マッピングされている controlId を返す。
   * マッピングがない場合は null。
   *
   * @param {string} actionName
   * @returns {string|null}
   */
  getMappedControlId(actionName) {
    for (const [controlId, name] of Object.entries(appStore.midiMappings)) {
      if (name === actionName) return controlId;
    }
    return null;
  }

  // ── 内部 ─────────────────────────────────────────────────────────────────

  _handleMessage(msg) {
    // note_off / sysex / 未対応メッセージは無視
    if (msg.type === 'note_off' || msg.type === 'sysex') return;

    const controlId = `${msg.type}:${msg.channel}:${msg.number}`;

    if (this._learningAction !== null) {
      // 学習モード: このメッセージを learningAction にマッピング
      const actionName = this._learningAction;
      this._learningAction = null;

      // 既存の逆マッピングを削除してから登録（1対1を保証）
      this.unmap(actionName);
      appStore.setMidiMapping(controlId, actionName);
      return;
    }

    // 通常モード: マッピングを検索してハンドラを呼ぶ
    const actionName = appStore.midiMappings[controlId];
    if (actionName && this._handlers[actionName]) {
      this._handlers[actionName]();
    }
  }
}

module.exports = new MidiMapping();
