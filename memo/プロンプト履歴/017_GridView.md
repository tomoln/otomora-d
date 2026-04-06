【作るファイル】
ui/GridView.js

【参照してよいファイル】
memo/設計2.md

【やること】
#### `ui/GridView.js`
グリッド表示（再生位置のハイライト）
| 依存先 | 種類 | 何のため |
|---|---|---|
| `audio/GridPlayer.js` | ローカル | 現在再生中のグリッド位置を受け取る |
| `store/AppStore.js` | ローカル | BPM・再生状態の表示 |

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

要点と、現時点でのユーザー側の確認作業があれば、017_GridView.md に追記してください。

実装内容まとめ：

主な API:

gridView.init(containerElement) — DOM 生成 + イベント購読を一括実行
動作フロー:

gridPlayer.onSlice() で再生スロット通知を受け取り、該当セルを白くハイライト
前のスロットは小節の濃淡色（偶数小節 #2a2a2a / 奇数小節 #1e1e1e）に戻す
appStore.on('bpm') → ヘッダーの BPM 表示を更新
appStore.on('isPlaying') → 再生/停止ラベルを更新、停止時はハイライトもクリア
ユーザー側の確認事項:

なし（GridView は読み取り専用。gridPlayer.onSlice は1つしか登録できないため、index.js で WordDisplay 等も使う場合は GridPlayer 側を複数コールバック対応に拡張するか、index.js でファンアウトする必要があります）