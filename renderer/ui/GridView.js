const gridPlayer = require('../audio/GridPlayer');
const appStore   = require('../store/AppStore');

// ────────────────────────────────────────────────────────────────────────────
// GridView
//
// 96 スロット（6小節 × 16分割）のグリッドを描画し、
// 再生中のスロットをハイライトする。
// init(container) で DOM を生成し、gridPlayer.onSlice で位置を受け取る。
// ────────────────────────────────────────────────────────────────────────────

const BARS      = 6;
const DIVISIONS = 16;
const GRID_SIZE = BARS * DIVISIONS; // 96

class GridView {
  constructor() {
    this._cells       = [];   // HTMLElement[96]
    this._bpmEl       = null;
    this._statusEl    = null;
    this._currentSlot = -1;
  }

  // ── 初期化 ────────────────────────────────────────────────────────────────

  /**
   * グリッド UI を container 内に生成し、イベント購読を開始する。
   * @param {HTMLElement} container
   */
  init(container) {
    this._buildDOM(container);
    this._subscribe();
  }

  // ── 内部 ─────────────────────────────────────────────────────────────────

  _buildDOM(container) {
    // ── ヘッダー（BPM・再生状態） ─────────────────────────────────────────
    const header = document.createElement('div');
    header.style.display      = 'flex';
    header.style.alignItems   = 'center';
    header.style.gap          = '12px';
    header.style.marginBottom = '8px';

    this._bpmEl = document.createElement('span');
    this._bpmEl.textContent = `BPM: ${appStore.bpm}`;

    this._statusEl = document.createElement('span');
    this._statusEl.textContent = appStore.isPlaying ? '▶ 再生中' : '■ 停止';

    header.appendChild(this._bpmEl);
    header.appendChild(this._statusEl);
    container.appendChild(header);

    // ── グリッド ──────────────────────────────────────────────────────────
    const grid = document.createElement('div');
    grid.style.display             = 'grid';
    grid.style.gridTemplateColumns = `repeat(${DIVISIONS}, 1fr)`;
    grid.style.gap                 = '2px';

    for (let i = 0; i < GRID_SIZE; i++) {
      const cell = document.createElement('div');
      cell.style.height          = '24px';
      cell.style.borderRadius    = '2px';
      cell.style.backgroundColor = this._barColor(i);
      cell.style.transition      = 'background-color 0.05s';
      cell.title = `slot ${i}  bar ${Math.floor(i / DIVISIONS) + 1}  beat ${(i % DIVISIONS) + 1}`;
      this._cells.push(cell);
      grid.appendChild(cell);
    }

    container.appendChild(grid);
  }

  _subscribe() {
    gridPlayer.onSlice((_slice, slot) => this._highlight(slot));

    appStore.on('bpm', (bpm) => {
      if (this._bpmEl) this._bpmEl.textContent = `BPM: ${bpm}`;
    });

    appStore.on('isPlaying', (playing) => {
      if (this._statusEl) this._statusEl.textContent = playing ? '▶ 再生中' : '■ 停止';
      if (!playing) this._clearHighlight();
    });
  }

  _highlight(slot) {
    if (this._currentSlot >= 0 && this._currentSlot < GRID_SIZE) {
      this._cells[this._currentSlot].style.backgroundColor = this._barColor(this._currentSlot);
    }
    this._currentSlot = slot;
    if (slot >= 0 && slot < GRID_SIZE) {
      this._cells[slot].style.backgroundColor = '#ffffff';
    }
  }

  _clearHighlight() {
    if (this._currentSlot >= 0 && this._currentSlot < GRID_SIZE) {
      this._cells[this._currentSlot].style.backgroundColor = this._barColor(this._currentSlot);
    }
    this._currentSlot = -1;
  }

  /** 小節ごとに交互の濃さで背景色を返す */
  _barColor(slot) {
    const bar = Math.floor(slot / DIVISIONS);
    return bar % 2 === 0 ? '#2a2a2a' : '#1e1e1e';
  }
}

module.exports = new GridView();
