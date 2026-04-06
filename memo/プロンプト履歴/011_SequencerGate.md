【作るファイル】
effects/SequencerGate.js

【参照してよいファイル】
memo/設計2.md


【やること】
#### effects/SequencerGate.js
16,32,64,128で分割可能。音はそのまま再生され、グリッドでゲートで音量が消える
音量のオン／オフをステップごとに自動制御して、リズム的に音を刻むエフェクト


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

要点と、現時点でのユーザー側の確認作業があれば、011_SequencerGate.md に追加してください。

---

## 要点

**設計方針**
- AudioWorklet（`SequencerGateProcessor`）で実装。音はそのまま再生しながら、パターン配列に従って音量を on/off する
- Stutter と違い、キャプチャはしない。入力をリアルタイムで通過させつつゲートをかける

**クリック防止**
- ゲート切替時に 2ms のスラーをかけて線形補間（急激なオン/オフによるポップ音を防止）

**ステップ周期の計算**（Stutter と同じ式）
```
stepSamples = 240 / (BPM × division) × sampleRate

BPM=120 の場合:
  division=16  → 125ms
  division=32  →  62.5ms
  division=64  →  31.25ms
  division=128 →  15.6ms
```

**主要メンバー**

| メンバー | 説明 |
|---|---|
| `init()` | AudioWorklet を登録してノードを生成（非同期・await 必須） |
| `node` | EffectChain が AudioGraph に挿入する `AudioWorkletNode` |
| `division` | 16 / 32 / 64 / 128（デフォルト 16）。変更時にパターンも交互リセット |
| `bpm` | 現在の BPM（EffectChain / UI から BpmSync 値を渡す） |
| `pattern` | 0/1 の配列（length = division）。アクティブ中に変更可（位相保持） |
| `enable()` | ゲート開始 |
| `disable()` | パススルーに戻す |

**デフォルトパターン**
```
division=16: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0]
```

**カスタムパターンの例**
```js
// 4つで1グループ: オン・オン・オフ・オフ
sequencerGate.pattern = [1,1,0,0, 1,1,0,0, 1,1,0,0, 1,1,0,0];

// 最後の4ステップだけ消す
sequencerGate.pattern = [1,1,1,1, 1,1,1,1, 1,1,1,1, 0,0,0,0];
```

**EffectChain 側の呼び出しイメージ**
```js
await sequencerGate.init();
// AudioGraph に挿入: src → sequencerGate.node → masterGain

sequencerGate.bpm      = appStore.bpm;
sequencerGate.division = 32;
sequencerGate.enable();

// アクティブ中にパターンを変更
sequencerGate.pattern = [1,1,0,0, 1,0,0,0, ...];

sequencerGate.disable();
```

---

## 現時点でのユーザー確認作業

**BPM の受け渡しが必要**（Stutter と同様）

EffectChain（または UI）が `sequencerGate.bpm = bpm` を呼んで現在の BPM を渡す必要があります。BpmSync がビートを受信するたびに更新するのが自然な設計です。