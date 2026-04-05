'use strict';

// ── シングルトン ──────────────────────────────────────────────────────────────
const appStore         = require('./store/AppStore');
const audioEngine      = require('./audio/AudioEngine');
const gridPlayer       = require('./audio/GridPlayer');
const bpmSync          = require('./audio/BpmSync');
const effectChain      = require('./effects/EffectChain');
const midiController   = require('./midi/MidiController');
const midiMapping      = require('./midi/MidiMapping');

const fadeManager      = require('./audio/FadeManager');

const fileSelector     = require('./ui/FileSelector');
const gridView         = require('./ui/GridView');
const wordDisplay      = require('./ui/WordDisplay');
const effectPanel      = require('./ui/EffectPanel');
const effectVisualizer = require('./ui/EffectVisualizer');

// ── ヘルパー ──────────────────────────────────────────────────────────────────
const el = (id) => document.getElementById(id);

// ── エフェクトトグル（MIDI ハンドラと UI ボタンの共通処理） ──────────────────
function toggleEffect(key) {
  const enabled = appStore.effectStates[key]?.enabled ?? false;
  if (enabled) {
    effectChain[key].disable();
    appStore.setEffectEnabled(key, false);
  } else {
    effectChain[key].enable();
    appStore.setEffectEnabled(key, true);
  }
}

// ── 起動処理（ユーザー操作起点で AudioContext を開始） ───────────────────────
async function boot() {
  // ① AudioContext 初期化（ブラウザ制約: ユーザー操作後に呼ぶこと）
  await audioEngine.init();

  // ② エフェクトチェーン（AudioWorklet を含む非同期処理）
  await effectChain.init();
  // 音声出力先を effectChain の入り口に変更（スライス音がエフェクトを通るようにする）
  fadeManager.destination = effectChain.inputNode;

  // ③ BPM 同期（IPC 経由で Ableton Link から受信）
  bpmSync.start();

  // BPM 変化を EffectChain（Stutter / SequencerGate）に伝播
  appStore.on('bpm', (bpm) => { effectChain.bpm = bpm; });

  // ④ MIDI 受信
  midiController.start();
  midiMapping.start();

  // MIDI アクション登録
  midiMapping.register('play',           () => gridPlayer.play());
  midiMapping.register('stop',           () => gridPlayer.stop());
  midiMapping.register('x2',             () => appStore.setX2(!appStore.x2));
  midiMapping.register('pitchDrop',      () => toggleEffect('pitchDrop'));
  midiMapping.register('granularFreeze', () => toggleEffect('granularFreeze'));
  midiMapping.register('stutter',        () => toggleEffect('stutter'));
  midiMapping.register('scratch',        () => toggleEffect('scratch'));
  midiMapping.register('sequencerGate',  () => toggleEffect('sequencerGate'));

  // ⑤ UI 初期化
  await fileSelector.init(el('file-selector'));
  gridView.init(el('grid-view'));
  wordDisplay.initDOM(el('word-display'));
  effectPanel.init(el('effect-panel'));
  effectVisualizer.initDOM(el('effect-visualizer'));

  // gridPlayer.onSlice はシングルコールバック。
  // gridView.init() が内部で登録した onSlice をここで上書きし、全 UI にファンアウトする。
  gridPlayer.onSlice((slice, slot) => {
    gridView._highlight(slot);
    wordDisplay.update(slice, slot);
    effectVisualizer.update(slice, slot);
  });

  // ⑥ 操作ボタン
  el('btn-play').addEventListener('click', () => gridPlayer.play());
  el('btn-stop').addEventListener('click', () => gridPlayer.stop());
  el('btn-x2').addEventListener('click', () => {
    const next = !appStore.x2;
    appStore.setX2(next);
    el('btn-x2').textContent          = next ? 'x2: ON' : 'x2: OFF';
    el('btn-x2').style.backgroundColor = next ? '#ff9800' : '#333';
  });

  // ⑦ 画面切り替え
  el('boot-section').style.display = 'none';
  el('main-ui').style.display      = 'block';
}

// ── エントリーポイント ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  el('btn-boot').addEventListener('click', boot);
});
