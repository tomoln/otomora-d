【作るファイル】
midi/MidiMapping.js

【参照してよいファイル】
memo/設計2.md

【やること】
#### `midi/MidiMapping.js`

| 依存先 | 種類 | 何のため |
|---|---|---|
| `midi/MidiController.js` | ローカル | MIDIメッセージを購読 |
| `store/AppStore.js` | ローカル | マッピング設定の保存・読み込み |


【やらないこと】
依存の方向を間違えない

## 依存の方向まとめ（上が下に依存する）

```
renderer/index.js
│
├─ ui/*.js
│   └─ audio/GridPlayer.js ←─────────┐
│       ├─ audio/SliceManager.js      │
│       ├─ audio/TimeStretcher.js     │
│       ├─ audio/BpmSync.js ←── IPC ─┼── main/link/linkBridge.js
│       ├─ audio/FadeManager.js       │
│       └─ audio/AudioEngine.js       │
│                                     │
├─ effects/EffectChain.js             │
│   ├─ effects/*.js                   │
│   └─ audio/AudioEngine.js           │
│                                     │
├─ midi/MidiMapping.js                │
│   ├─ midi/MidiController.js ← IPC ─┼── main/midi/midiMain.js
│   └─ store/AppStore.js              │
│                                     │
└─ store/AppStore.js（依存なし）      │
   audio/AudioEngine.js（依存なし）   │

要点と、現時点でのユーザー側の確認作業があれば、014_MidiController.md に追加してください。

実装内容まとめ

主なAPI:

midiMapping.register('play', () => gridPlayer.play()) — アクション登録
midiMapping.learn('play') — 学習モード開始（次の MIDI 入力をマッピング）
midiMapping.cancelLearn() — 学習キャンセル
midiMapping.unmap('play') — マッピング削除
midiMapping.getMappedControlId('play') — 現在のマッピング確認
midiMapping.learningAction — 学習中のアクション名（UI 表示用）
index.js 側でやること:


midiMapping.start();

midiMapping.register('play',          () => gridPlayer.play());
midiMapping.register('stop',          () => gridPlayer.stop());
midiMapping.register('x2',            () => appStore.setX2(!appStore.x2));
midiMapping.register('pitchDrop',     () => effectChain.pitchDrop.enable());
midiMapping.register('granularFreeze',() => effectChain.granularFreeze.enable());
midiMapping.register('stutter',       () => effectChain.stutter.enable());
midiMapping.register('scratch',       () => effectChain.scratch.enable());
midiMapping.register('sequencerGate', () => effectChain.sequencerGate.enable());