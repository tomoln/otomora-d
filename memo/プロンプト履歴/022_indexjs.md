【作るファイル】
renderer/index.js 
renderer/index.html

【参照してよいファイル】
memo/設計2.md

【やること】
#### `renderer/index.js`（エントリポイント）
レンダラーエントリポイント
全モジュールをここで初期化・接続する。依存が最も多い。

| 依存先 | 種類 |
|---|---|
| `store/AppStore.js` | ローカル |
| `audio/AudioEngine.js` | ローカル |
| `audio/GridPlayer.js` | ローカル |
| `audio/BpmSync.js` | ローカル |
| `effects/EffectChain.js` | ローカル |
| `midi/MidiController.js` | ローカル |
| `midi/MidiMapping.js` | ローカル |
| `ui/*.js`（全UI） | ローカル |

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

要点と、現時点でのユーザー側の確認作業があれば、022_indexjs.md に追記してください。

作成・修正したファイルのまとめ：

修正: main/main.js

assets-list → get-asset-list（FileSelector が期待するIPC名）に変更
get-asset-paths ハンドラを追加（SliceManager が期待するIPC）
get-asset-list は audio・json 両方が揃っているベース名のみ返す
新規: renderer/index.js

起動順: audioEngine.init() → effectChain.init() → bpmSync.start() → MIDI → UI
gridPlayer.onSlice はシングルコールバックなので、gridView.init() が登録したものをここで上書きし、3コンポーネントにファンアウト
appStore.on('bpm', ...) で BPM変化を effectChain.bpm へ伝播
新規: renderer/index.html

「起動」ボタンクリック → boot() → AudioContext 開始（ブラウザ制約対応）
起動後にメイン UI を表示（左: グリッド・音響特徴量 / 右: モーラ表示・エフェクトパネル）
確認作業

package.json の "main" が "src/main/main.js" になっていますが、実ファイルは main/main.js です。"main/main.js" に修正が必要です。
assets ファイルは .wav 拡張子を前提にしています（例: 001.wav）。別の拡張子の場合は main/main.js の get-asset-list を要修正。