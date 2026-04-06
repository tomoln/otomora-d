【作るファイル】
effects/Stutter.js

【参照してよいファイル】
memo/設計2.md


【やること】
#### effects/Stutter.js
16,32,64,128で分割可能。その時の音がドリルみたいな音になる
音を細かく刻んでリズム的に連続再生させることで、グリッチ感・トリッキーな動きを作るエフェクト


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

要点と、現時点でのユーザー側の確認作業があれば、009_Stutter.md に追加してください。

---

## 要点

**設計方針**
- AudioWorklet（`StutterProcessor`）で実装。`enable()` 時に 1 周期分の音をスナップショットし、それをひたすらループ再生することで "ドリル" 感を出す

**周期の計算**
```
period = 240 / (BPM × division) 秒

BPM=120 の場合:
  division=16  → 125ms（1/16 音符）
  division=32  →  62.5ms
  division=64  →  31.25ms
  division=128 →  15.6ms  ← ドリル感が最も強い
```

**主要メンバー**

| メンバー | 説明 |
|---|---|
| `init()` | AudioWorklet を登録してノードを生成（非同期・await 必須） |
| `node` | EffectChain が AudioGraph に挿入する `AudioWorkletNode` |
| `division` | 16 / 32 / 64 / 128 のいずれか（デフォルト 16） |
| `bpm` | 現在の BPM（EffectChain / UI から BpmSync 値を渡す） |
| `enable()` | スタッター開始。その瞬間の 1 周期分をキャプチャしてループ |
| `disable()` | パススルーに戻す |

**division / bpm をアクティブ中に変更した場合**
- 即座に新しいチャンクをスナップショットして更新される
- "ドリルのスピードをリアルタイムで変える" 操作が可能

**EffectChain 側の呼び出しイメージ**
```js
await stutter.init();
// AudioGraph に挿入: src → stutter.node → masterGain

stutter.bpm      = appStore.bpm; // BpmSync から取得した値を渡す
stutter.division = 32;
stutter.enable();                // スタッター開始
stutter.division = 64;           // アクティブ中に変更可
stutter.disable();               // 通常再生に戻す
```

---

## 現時点でのユーザー確認作業

**BPM の受け渡しが必要**

Stutter は BPM を自分では知りません。EffectChain（または UI）が `stutter.bpm = bpm` を呼んで現在の BPM を渡す必要があります。BpmSync がビートを受信するたびに更新するのが自然な設計です。