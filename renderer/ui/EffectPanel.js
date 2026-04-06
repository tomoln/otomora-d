const effectChain = require('../effects/EffectChain');
const appStore    = require('../store/AppStore');

// ────────────────────────────────────────────────────────────────────────────
// EffectPanel
//
// 各エフェクトのオン/オフトグルと、Stutter・SequencerGate の
// 分割数セレクターを提供する UI コンポーネント。
//
// AppStore の effectStates を正とし、MIDI 操作などで外部から状態が変わっても
// ボタン表示が追従する。
// ────────────────────────────────────────────────────────────────────────────

const EFFECTS = [
  { key: 'pitchDrop',      label: 'Pitch Drop',      hasDivision: false },
  { key: 'granularFreeze', label: 'Granular Freeze',  hasDivision: false },
  { key: 'stutter',        label: 'Stutter',          hasDivision: true  },
  { key: 'scratch',        label: 'Scratch',          hasDivision: false },
  { key: 'sequencerGate',  label: 'Sequencer Gate',   hasDivision: true  },
];

const DIVISIONS = [16, 32, 64, 128];

class EffectPanel {
  constructor() {
    // { [effectKey]: { btn: HTMLElement, sel: HTMLElement|null } }
    this._widgets = {};
  }

  // ── 初期化 ────────────────────────────────────────────────────────────────

  /**
   * エフェクトパネル UI を container 内に生成する。
   * effectChain.init() 完了後に呼ぶこと。
   * @param {HTMLElement} container
   */
  init(container) {
    this._buildDOM(container);
    this._syncFromStore();

    // AppStore の外部変化（MIDI など）に追従
    appStore.on('effectStates', () => this._syncFromStore());
  }

  // ── 内部 ─────────────────────────────────────────────────────────────────

  _buildDOM(container) {
    const panel = document.createElement('div');
    panel.style.display       = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap           = '6px';

    for (const { key, label, hasDivision } of EFFECTS) {
      const row = document.createElement('div');
      row.style.display    = 'flex';
      row.style.alignItems = 'center';
      row.style.gap        = '8px';

      // オン/オフトグルボタン
      const btn = document.createElement('button');
      btn.textContent      = label;
      btn.style.minWidth   = '130px';
      btn.style.padding    = '4px 10px';
      btn.style.cursor     = 'pointer';
      btn.style.borderRadius = '4px';
      btn.style.border     = '1px solid #555';
      btn.addEventListener('click', () => this._toggle(key));

      row.appendChild(btn);

      // 分割数セレクター（Stutter・SequencerGate のみ）
      let sel = null;
      if (hasDivision) {
        sel = document.createElement('select');
        sel.style.padding = '2px 6px';
        for (const d of DIVISIONS) {
          const opt = document.createElement('option');
          opt.value       = String(d);
          opt.textContent = `/${d}`;
          sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
          const div = Number(sel.value);
          effectChain[key].division = div;
          appStore.setEffectParam(key, 'division', div);
        });
        row.appendChild(sel);
      }

      panel.appendChild(row);
      this._widgets[key] = { btn, sel };
    }

    container.appendChild(panel);
  }

  /** ボタンクリック: 有効/無効を切り替える */
  _toggle(key) {
    const states  = appStore.effectStates;
    const enabled = states[key]?.enabled ?? false;

    if (enabled) {
      effectChain[key].disable();
      appStore.setEffectEnabled(key, false);
    } else {
      effectChain[key].enable();
      appStore.setEffectEnabled(key, true);
    }
  }

  /** AppStore の状態をボタン表示に反映する */
  _syncFromStore() {
    const states = appStore.effectStates;

    for (const { key } of EFFECTS) {
      const { btn, sel } = this._widgets[key] ?? {};
      if (!btn) continue;

      const effectState = states[key] ?? {};
      const enabled     = effectState.enabled ?? false;

      btn.style.backgroundColor = enabled ? '#4caf50' : '#333';
      btn.style.color           = enabled ? '#000'    : '#ccc';

      if (sel) {
        const div = effectState.params?.division ?? 16;
        sel.value = String(div);
      }
    }
  }
}

module.exports = new EffectPanel();
