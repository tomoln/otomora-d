const gridPlayer = require('../audio/GridPlayer');

// ────────────────────────────────────────────────────────────────────────────
// EffectVisualizer
//
// 再生中スライスの音響特徴量（RMS / f0 / spectral_centroid / zcr）を
// バーグラフで可視化する。
//
// ※ gridPlayer.onSlice はシングルコールバックのため、GridView・WordDisplay
//    と共存させる場合は index.js でファンアウトし update(slice, slot) を直接
//    呼ぶこと。
// ────────────────────────────────────────────────────────────────────────────

// 各メトリクスの表示設定（label, max, unit, color）
const METRICS = [
  { key: 'rms',               label: 'RMS',      max: 1.0,   unit: '',   color: '#4caf50' },
  { key: 'f0',                label: 'F0',        max: 500,   unit: 'Hz', color: '#2196f3' },
  { key: 'spectral_centroid', label: 'Centroid',  max: 8000,  unit: 'Hz', color: '#ff9800' },
  { key: 'zcr',               label: 'ZCR',       max: 0.5,   unit: '',   color: '#e91e63' },
];

class EffectVisualizer {
  constructor() {
    this._bars = {};  // { [key]: HTMLElement (fill div) }
    this._vals = {};  // { [key]: HTMLElement (value label) }
  }

  // ── 初期化 ────────────────────────────────────────────────────────────────

  /**
   * 可視化 UI を container 内に生成し、gridPlayer.onSlice を購読する。
   * GridView・WordDisplay と共存させる場合は initDOM() + index.js ファンアウトを使う。
   * @param {HTMLElement} container
   */
  init(container) {
    this._buildDOM(container);
    gridPlayer.onSlice((slice, slot) => this.update(slice, slot));
  }

  /**
   * DOM 生成のみ。gridPlayer.onSlice は購読しない（index.js ファンアウト用）。
   * @param {HTMLElement} container
   */
  initDOM(container) {
    this._buildDOM(container);
  }

  // ── 公開 API ─────────────────────────────────────────────────────────────

  /**
   * 表示を更新する。index.js から直接呼んでもよい。
   * @param {{ rms: number, f0: number, spectral_centroid: number, zcr: number }} slice
   * @param {number} slot  0〜95（未使用だが GridPlayer コールバックと揃える）
   */
  update(slice, _slot) {
    for (const { key, max } of METRICS) {
      const raw   = slice[key] ?? 0;
      const ratio = Math.min(raw / max, 1);

      const fill = this._bars[key];
      const val  = this._vals[key];
      if (fill) fill.style.width = `${(ratio * 100).toFixed(1)}%`;
      if (val)  val.textContent  = this._fmt(key, raw);
    }
  }

  // ── 内部 ─────────────────────────────────────────────────────────────────

  _buildDOM(container) {
    const wrapper = document.createElement('div');
    wrapper.style.display       = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap           = '6px';

    for (const { key, label, color } of METRICS) {
      const row = document.createElement('div');
      row.style.display    = 'flex';
      row.style.alignItems = 'center';
      row.style.gap        = '8px';

      // ラベル
      const lbl = document.createElement('span');
      lbl.textContent      = label;
      lbl.style.width      = '64px';
      lbl.style.fontSize   = '0.78em';
      lbl.style.flexShrink = '0';

      // バー背景
      const track = document.createElement('div');
      track.style.flex            = '1';
      track.style.height          = '12px';
      track.style.backgroundColor = '#1a1a1a';
      track.style.borderRadius    = '2px';
      track.style.overflow        = 'hidden';

      // バー本体（幅を ratio で制御）
      const fill = document.createElement('div');
      fill.style.width           = '0%';
      fill.style.height          = '100%';
      fill.style.backgroundColor = color;
      fill.style.transition      = 'width 0.08s ease-out';
      fill.style.borderRadius    = '2px';
      track.appendChild(fill);

      // 値ラベル
      const val = document.createElement('span');
      val.textContent    = '─';
      val.style.width    = '72px';
      val.style.fontSize = '0.78em';
      val.style.textAlign = 'right';
      val.style.flexShrink = '0';

      row.appendChild(lbl);
      row.appendChild(track);
      row.appendChild(val);
      wrapper.appendChild(row);

      this._bars[key] = fill;
      this._vals[key] = val;
    }

    container.appendChild(wrapper);
  }

  /** 値を人間が読める文字列に変換する */
  _fmt(key, raw) {
    if (raw == null || isNaN(raw)) return '─';
    switch (key) {
      case 'rms':               return raw.toFixed(3);
      case 'f0':                return raw > 0 ? `${raw.toFixed(0)} Hz` : '─';
      case 'spectral_centroid': return `${raw.toFixed(0)} Hz`;
      case 'zcr':               return raw.toFixed(3);
      default:                  return raw.toFixed(3);
    }
  }
}

module.exports = new EffectVisualizer();
