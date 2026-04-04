【作るファイル】
effects/EffectChain.js

【参照してよいファイル】
memo/設計2.md


【やること】
#### effects/EffectChain.js
エフェクトチェーン管理・切り替え

依存関係的に問題なければ
EffectChain（または UI）が `sequencerGate.bpm = bpm` を呼んで現在の BPM を渡す必要があります。BpmSync がビートを受信するたびに更新するのが良いのかも

【やらないこと】
構成を下記にするので、役割以外のことは作らない
#### `effects/EffectChain.js`
| 依存先 | 種類 | 何のため |
|---|---|---|
| `audio/AudioEngine.js` | ローカル | エフェクトノードを AudioGraph に挿入 |
| `effects/PitchDrop.js` | ローカル | インスタンス生成・管理 |
| `effects/GranularFreeze.js` | ローカル | 同上 |
| `effects/Stutter.js` | ローカル | 同上 |
| `effects/Scratch.js` | ローカル | 同上 |
| `effects/SequencerGate.js` | ローカル | 同上 |

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

要点と、現時点でのユーザー側の確認作業があれば、012_EffectChain.md に追加してください。

実装内容まとめ

信号経路:


inputNode → pitchDrop → granularFreeze → stutter → scratch → sequencerGate → masterGain
主なAPI:

await effectChain.init() — 全エフェクトを並列初期化して接続
effectChain.inputNode — 音源の接続先（audioEngine.masterGain の代わりに使う）
effectChain.bpm = bpm — Stutter / SequencerGate に BPM を一括伝播
effectChain.pitchDrop.enable() など — 各エフェクトに直接アクセス
ユーザー側の確認事項:

GridPlayer（または他の音源）が audioEngine.masterGain に接続している箇所を effectChain.inputNode に変更する必要があります
BpmSync がビートを受信するたびに effectChain.bpm = bpm を呼ぶ処理を UI または index.js で追加する必要があります