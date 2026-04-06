const { ipcRenderer } = require('electron');
const sliceManager    = require('../audio/SliceManager');
const appStore        = require('../store/AppStore');

// ────────────────────────────────────────────────────────────────────────────
// FileSelector
//
// assets/audio・json の一覧を取得してファイル選択 UI を提供する。
// init(container) で DOM を生成し、選択変更時に SliceManager でロードする。
// ────────────────────────────────────────────────────────────────────────────

class FileSelector {
  constructor() {
    this._select    = null;
    this._status    = null;
    this._loading   = false;
  }

  // ── 初期化 ────────────────────────────────────────────────────────────────

  /**
   * ファイル選択 UI を container 内に生成し、アセット一覧を取得して表示する。
   * @param {HTMLElement} container
   */
  async init(container) {
    this._buildDOM(container);
    await this._loadList();
  }

  // ── 内部 ─────────────────────────────────────────────────────────────────

  _buildDOM(container) {
    const label = document.createElement('label');
    label.textContent = 'ファイル: ';

    this._select = document.createElement('select');
    this._select.disabled = true;

    const placeholder = document.createElement('option');
    placeholder.value       = '';
    placeholder.textContent = '読み込み中...';
    this._select.appendChild(placeholder);

    this._status = document.createElement('span');
    this._status.style.marginLeft = '8px';
    this._status.style.fontSize   = '0.85em';

    this._select.addEventListener('change', () => this._onSelect());

    label.appendChild(this._select);
    container.appendChild(label);
    container.appendChild(this._status);
  }

  async _loadList() {
    try {
      // main.js の ipcMain.handle('get-asset-list') が返す string[] を受け取る
      // 例: ["001", "002", "003"]
      const names = await ipcRenderer.invoke('get-asset-list');

      this._select.innerHTML = '';

      if (!names || names.length === 0) {
        const opt = document.createElement('option');
        opt.value       = '';
        opt.textContent = 'アセットなし';
        this._select.appendChild(opt);
        this._select.disabled = true;
        return;
      }

      for (const name of names) {
        const opt = document.createElement('option');
        opt.value       = name;
        opt.textContent = name;
        this._select.appendChild(opt);
      }

      this._select.disabled = false;

      // 現在 AppStore に選択済みのファイルがあれば復元
      const current = appStore.selectedFile;
      if (current && names.includes(current)) {
        this._select.value = current;
      } else {
        // デフォルトで先頭をロード
        await this._loadFile(names[0]);
      }
    } catch (err) {
      this._setStatus(`一覧取得エラー: ${err.message}`);
    }
  }

  async _onSelect() {
    const name = this._select.value;
    if (!name) return;
    await this._loadFile(name);
  }

  async _loadFile(name) {
    if (this._loading) return;
    this._loading = true;
    this._select.disabled = true;
    this._setStatus('読み込み中...');

    try {
      await sliceManager.load(name);
      appStore.setSelectedFile(name);
      this._select.value = name;
      this._setStatus(`${name} (${sliceManager.slices.length} スライス)`);
    } catch (err) {
      this._setStatus(`読み込みエラー: ${err.message}`);
    } finally {
      this._loading = false;
      this._select.disabled = false;
    }
  }

  _setStatus(text) {
    if (this._status) this._status.textContent = text;
  }
}

module.exports = new FileSelector();
