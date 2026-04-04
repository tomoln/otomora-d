【作るファイル】
effects/GranularFreeze.js

【参照してよいファイル】
memo/設計2.md


【やること】
#### `effects/GranularFreeze.js`
その瞬間になっている音をグラニュラーエフェクト的、もしくはそれ近い音で、
連続的に、スタッター的にはならず、音が連続で鳴り続けるエフェクトを付けます。
グラニュラーフリーズ
グレインが途切れ目なく重なり合い、連続した音に聞こえる
オフにしたら、音がそこからまた普通に再生される


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

要点と、現時点でのユーザー側の確認作業があれば、008_GranularFreeze.md に追加してください。

---

## 要点

**設計方針**
- AudioWorklet（`GranularFreezeProcessor`）で実装。スタッターにならない連続音のために Hann 窓グレインを複数同時再生する
- `enable()` を呼んだ瞬間に直近 ~320ms のオーディオをスナップショットし、以降はそのバッファからグレインを生成し続ける

**グレインが "途切れない" 仕組み**
```
グレイン 0: ████░░░░░░░░ (Hann 窓: 両端がフェード)
グレイン 1:   ████░░░░░░
グレイン 2:     ████░░░░   … N グレインが等間隔にずれて常に重なる
グレイン 3:       ████░░
```
- グレイン終端で Gain が 0 になるタイミングに別グレインが中央（最大 Gain）に来るため、音量ムラがなく連続する
- 各グレインは終端で次のランダム位置から再スタート → 微妙に揺らいだフリーズ感

**オーディオグラフの接続（EffectChain が担当）**
```
BufferSourceNode → gainNode → [GranularFreeze.node] → masterGain → destination
```

**主要メンバー**

| メンバー | 説明 |
|---|---|
| `init()` | AudioWorklet を登録してノードを生成（非同期・await 必須） |
| `node` | EffectChain が AudioGraph に挿入する `AudioWorkletNode` |
| `grainMs` | グレイン長 ms（デフォルト 80ms）。長いほど音が安定し短いほどザラつく |
| `numGrains` | 同時グレイン数（デフォルト 6）。多いほど密に重なる |
| `enable()` | スナップショットを取ってグラニュラーフリーズ開始 |
| `disable()` | パススルーに戻す。リングバッファが常に入力を書き続けているため、オフ時に「本来の再生位置」へシームレスに戻る |

**EffectChain 側の呼び出しイメージ**
```js
await granularFreeze.init();
// AudioGraph に挿入: src → granularFreeze.node → masterGain

granularFreeze.grainMs   = 100; // グレイン長を変更（任意）
granularFreeze.numGrains = 8;   // グレイン数を変更（任意）
granularFreeze.enable();        // フリーズ開始
granularFreeze.disable();       // 通常再生に戻す
```

---

## 現時点でのユーザー確認作業

**確認は不要です。**

GranularFreeze は AudioEngine のみに依存しており、IPC もメインプロセスも不要です。
動作確認は EffectChain と接続した後になります。