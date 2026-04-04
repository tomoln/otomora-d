【作るファイル】
ui/EffectVisualizer.js

【参照してよいファイル】
memo/設計2.md

【やること】
#### `ui/EffectVisualizer.js`
RMS/f0/spectral_centroid/zcr の可視化
| 依存先 | 種類 | 何のため |
|---|---|---|
| `audio/SliceManager.js` | ローカル | `rms`・`f0`・`spectral_centroid`・`zcr` を参照 |
| `audio/GridPlayer.js` | ローカル | 再生中スライスのインデックスを受け取る |

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

要点と、現時点でのユーザー側の確認作業があれば、019_EffectVisualizer.md に追記してください。

実装内容まとめ：

主な API:

effectVisualizer.init(container) — DOM 生成 + gridPlayer.onSlice 購読
effectVisualizer.initDOM(container) — DOM 生成のみ（index.js ファンアウト用）
effectVisualizer.update(slice, slot) — 外部から直接呼べる更新メソッド
表示内容（4 本のバー）:

メトリクス	最大値	色
RMS	1.0	緑
F0	500 Hz	青
Centroid	8000 Hz	オレンジ
ZCR	0.5	ピンク
ユーザー側の確認事項:

f0 が 0 のとき（無声音）は ─ と表示します。JSON の f0: 0 は無声音扱いです。
最大値（max）は固定値のため、素材によっては常にフル表示になる場合があります。必要であれば METRICS の max を調整してください。