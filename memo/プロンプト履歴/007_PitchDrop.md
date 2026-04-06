【作るファイル】
effects/PitchDrop.js

【参照してよいファイル】
memo/設計2.md


【やること】
#### `effects/PitchDrop.js`
最終的に0になるので、音がなくなる
レコードをoffにしたときみたいな感じ
そのピッチが下がっていく度合も、設定できる
オフにしたら、音声が戻る
オフにしたときの再生位置は、通常に再生していた時の再生位置になる


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

要点と、現時点でのユーザー側の確認作業があれば、007_PitchDrop.md に追加してください。

---

## 要点

**設計方針**
- AudioWorklet（`PitchDropProcessor`）でリングバッファ可変速読み出しを行う
- speed パラメータ（AudioParam）が 1.0 → 0.0 に線形ランプすることで、ピッチ・テンポが同時に落ちる（レコードを止めたときの物理的な挙動に一致）

**オーディオグラフの接続（EffectChain が担当）**
```
BufferSourceNode → gainNode → [PitchDrop.node] → masterGain → destination
```

**主要メンバー**

| メンバー | 説明 |
|---|---|
| `init()` | AudioWorklet を登録してノードを生成（非同期・await 必須） |
| `node` | EffectChain が AudioGraph に挿入する `AudioWorkletNode` |
| `dropDuration` | 1.0 → 0.0 になるまでの秒数（デフォルト 2.0s） |
| `enable()` | ピッチドロップ開始 |
| `disable()` | 通常再生に戻す。ワークレット内の readPos をリセットし、オフにした瞬間の「本来の再生位置」から再開 |

**オフ時の再生位置について**
- ドロップ中は readPos が writeIdx より遅れていく
- `disable()` が `port.postMessage({ type: 'reset' })` を送り、ワークレットが readPos を writeIdx に合わせる
- 次の瞬間から通常速度で「今」の位置から再生されるため、不自然なズレがない

**EffectChain 側の呼び出しイメージ**
```js
await pitchDrop.init();
// AudioGraph に挿入: src → pitchDrop.node → masterGain

pitchDrop.dropDuration = 3.0; // 3秒でドロップ（任意）
pitchDrop.enable();            // ピッチドロップ開始
pitchDrop.disable();           // 通常再生に戻す
```

---

## 現時点でのユーザー確認作業

**確認は不要です。**

PitchDrop は AudioEngine のみに依存しており、IPC もメインプロセスも不要です。
動作確認は EffectChain と接続した後になります。