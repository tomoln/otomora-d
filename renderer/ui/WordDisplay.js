const gridPlayer  = require('../audio/GridPlayer');
const sliceManager = require('../audio/SliceManager');

// ────────────────────────────────────────────────────────────────────────────
// WordDisplay
//
// 再生中のモーラ・単語を大きく表示する。
// init(container) で DOM を生成し、gridPlayer.onSlice で更新を受け取る。
//
// ※ gridPlayer.onSlice はシングルコールバックのため、GridView と共存させる
//    場合は index.js でファンアウトし、wordDisplay.update(slice, slot) を
//    直接呼ぶこと。
// ────────────────────────────────────────────────────────────────────────────

class WordDisplay {
  constructor() {
    this._moraEl  = null;  // 大きなモーラ表示
    this._wordEl  = null;  // 単語表示
    this._countEl = null;  // スライス番号 / 総数
  }

  // ── 初期化 ────────────────────────────────────────────────────────────────

  /**
   * 表示 UI を container 内に生成し、gridPlayer.onSlice を購読する。
   * GridView と両立させる場合は init() を呼ばず、index.js から
   * update(slice, slot) を直接呼ぶこと。
   *
   * @param {HTMLElement} container
   */
  init(container) {
    this._buildDOM(container);
    gridPlayer.onSlice((slice, slot) => this.update(slice, slot));
  }

  /**
   * 表示 UI を container 内に生成するが gridPlayer.onSlice は購読しない。
   * index.js でファンアウトするときに使う。
   *
   * @param {HTMLElement} container
   */
  initDOM(container) {
    this._buildDOM(container);
  }

  // ── 公開 API ─────────────────────────────────────────────────────────────

  /**
   * 表示を更新する。index.js から直接呼んでもよい。
   *
   * @param {{ word: string, mora: string }} slice
   * @param {number} slot  0〜95
   */
  update(slice, slot) {
    if (this._moraEl)  this._moraEl.textContent  = slice.mora  ?? '';
    if (this._wordEl)  this._wordEl.textContent   = slice.word  ?? '';
    if (this._countEl) {
      const total = sliceManager.slices.length;
      this._countEl.textContent = total > 0 ? `${slot + 1} / ${total}` : '';
    }
  }

  // ── 内部 ─────────────────────────────────────────────────────────────────

  _buildDOM(container) {
    const wrapper = document.createElement('div');
    wrapper.style.textAlign  = 'center';
    wrapper.style.lineHeight = '1.2';

    // モーラ（大きく）
    this._moraEl = document.createElement('div');
    this._moraEl.style.fontSize   = '4em';
    this._moraEl.style.fontWeight = 'bold';
    this._moraEl.textContent      = '─';

    // 単語
    this._wordEl = document.createElement('div');
    this._wordEl.style.fontSize = '1.4em';
    this._wordEl.textContent    = '';

    // スライス番号
    this._countEl = document.createElement('div');
    this._countEl.style.fontSize = '0.8em';
    this._countEl.style.opacity  = '0.5';
    this._countEl.textContent    = '';

    wrapper.appendChild(this._moraEl);
    wrapper.appendChild(this._wordEl);
    wrapper.appendChild(this._countEl);
    container.appendChild(wrapper);
  }
}

module.exports = new WordDisplay();
