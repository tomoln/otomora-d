【作るファイル】
ui/WordDisplay.js

【参照してよいファイル】
memo/設計2.md

【やること】
#### `ui/WordDisplay.js`
再生中の単語・モーラ表示
| 依存先 | 種類 | 何のため |
|---|---|---|
| `audio/SliceManager.js` | ローカル | 各スライスの `word`・`mora` を参照 |
| `audio/GridPlayer.js` | ローカル | 今どのスライスが再生中かを受け取る |

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

要点と、現時点でのユーザー側の確認作業があれば、018_WordDisplay.md に追記してください。

実装内容まとめ：

主な API:

wordDisplay.init(container) — DOM 生成 + gridPlayer.onSlice 購読を一括実行
wordDisplay.initDOM(container) — DOM 生成のみ（index.js でファンアウトする場合）
wordDisplay.update(slice, slot) — 外部から直接呼べる更新メソッド
動作フロー:

モーラを 4em で大きく表示
単語を 1.4em で表示
スライス番号 / 総数を薄く表示（sliceManager.slices.length を参照）
ユーザー側の確認事項:

GridView と WordDisplay が両方 gridPlayer.onSlice を呼ぶと後勝ちになります。index.js では以下のようにファンアウトしてください：

gridPlayer.onSlice((slice, slot) => {
  gridView.highlight(slot);       // GridView に公開メソッドを追加するか
  wordDisplay.update(slice, slot);
});
または wordDisplay.initDOM(container) を使って gridPlayer.onSlice の登録は index.js 側でまとめて行うのが安全です。GridView 側も同様に highlight(slot) を public メソッドとして切り出すと綺麗になります。