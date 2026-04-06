【作るファイル】
effects/Scratch.js

【参照してよいファイル】
memo/設計2.md


【やること】
#### effects/Scratch.js
音のピッチを上下しスクラッチのようなピッチの揺らぎを作る
今読んでるスライスのピッチが最初の点より前になった場合、現在スライスの終点地点に一周する


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

要点と、現時点でのユーザー側の確認作業があれば、010_Scratch.md に追加してください。

---

## 要点

**設計方針**
- AudioWorklet（`ScratchProcessor`）で実装。`enable()` 時に `windowMs` 分の音をスナップショットし、LFO で readPos を前後させてスクラッチ感を出す

**仕組み**
```
speed = 1.0 + depth × sin(lfoPhase)

depth=1.2 の場合: speed は -0.2 〜 +2.2 で推移
  → speed > 0: 前方向に再生（ピッチ上昇または正常）
  → speed < 0: 逆方向に再生（ピッチ逆転）
  → この往復がスクラッチ音を生む

ラップ: readPos < 0 → winLen（終点）へ
        readPos ≥ winLen → 0（始点）へ
```

**主要メンバー**

| メンバー | 説明 |
|---|---|
| `init()` | AudioWorklet を登録してノードを生成（非同期・await 必須） |
| `node` | EffectChain が AudioGraph に挿入する `AudioWorkletNode` |
| `lfoRate` | スクラッチの往復速度 Hz（デフォルト 4Hz、推奨 1〜12Hz） |
| `lfoDepth` | speed の振れ幅（デフォルト 1.2、1.0 超えで逆再生が混じる） |
| `windowMs` | スクラッチウィンドウ長 ms（デフォルト 250ms） |
| `enable()` | スクラッチ開始。windowMs 分をキャプチャして LFO 再生 |
| `disable()` | パススルーに戻す |

**パラメータのチューニング目安**

| lfoRate | lfoDepth | 聴こえ方 |
|---|---|---|
| 2Hz | 0.8 | ゆっくりしたピッチ揺らぎ |
| 4Hz | 1.2 | 典型的なスクラッチ感 |
| 8Hz | 1.5 | 激しい逆再生混じりのグリッチ |

**EffectChain 側の呼び出しイメージ**
```js
await scratch.init();
// AudioGraph に挿入: src → scratch.node → masterGain

scratch.lfoRate  = 6;
scratch.lfoDepth = 1.4;
scratch.windowMs = 60000 / bpm; // 1 拍分をウィンドウに（任意）
scratch.enable();
scratch.disable();
```

---

## 現時点でのユーザー確認作業

**確認は不要です。**

Scratch は AudioEngine のみに依存しており、IPC もメインプロセスも不要です。
動作確認は EffectChain と接続した後になります。