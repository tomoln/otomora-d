【作るファイル】
audio/GridPlayer.js

【参照してよいファイル】
memo/設計2.md

【やること】
#### audio/GridPlayer.js
96サンプル（6小節×16）グリッド再生

【やらないこと】
構成を下記にするので、役割以外のことは作らない
#### `effects/EffectChain.js`
| 依存先 | 種類 | 何のため |
|---|---|---|
| `audio/AudioEngine.js` | ローカル | バッファ再生 |
| `audio/SliceManager.js` | ローカル | `slices[]` を参照 |
| `audio/TimeStretcher.js` | ローカル | 各スライスをBPMに合わせて伸縮 |
| `audio/BpmSync.js` | ローカル | ビートのタイミング購読 |
| `audio/FadeManager.js` | ローカル | 重なり時のフェードアウト |
| `store/AppStore.js` | ローカル | 再生状態・x2フラグ参照 |

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

要点と、現時点でのユーザー側の確認作業があれば、013_GridPlayer.md に追加してください。

実装内容まとめ

再生フロー:


BpmSync.onBeat(sixteenth, when)
  → slot = sixteenth % 96
  → slice = slices[slot % slices.length]
  → TimeStretcher.stretch(buffer, sliceDur / targetSec)
  → BufferSourceNode → FadeManager.createFadeNode() → masterGain
主なAPI:

gridPlayer.play() — 再生開始
gridPlayer.stop() — 停止（50ms フェードアウト）
gridPlayer.onSlice(cb) — スライス再生時に (slice, slot) で UI 通知
ユーザー側の確認事項:

TimeStretcher.init() は AudioEngine.init() の後・gridPlayer.play() の前に呼ぶ必要があります
BpmSync.start() も同様に先行して呼ぶ必要があります
FadeManager が audioEngine.masterGain に直接接続するため、EffectChain をシグナルパスに挟むには index.js でのワイヤリング調整が必要です（FadeManager のカスタム接続先対応、または EffectChain を masterGain の前段に割り込ませる方法）