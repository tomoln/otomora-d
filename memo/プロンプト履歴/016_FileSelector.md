【作るファイル】
ui/FileSelector.js

【参照してよいファイル】
memo/設計2.md

【やること】
#### `ui/FileSelector.js`
assets/audio・json の一覧取得・ファイル選択UI
| 依存先 | 種類 | 何のため |
|---|---|---|
| `electron` | npm | `ipcRenderer.invoke('get-asset-list')` でファイル一覧取得 |
| `audio/SliceManager.js` | ローカル | 選択したファイルを読み込み依頼 |
| `store/AppStore.js` | ローカル | 現在選択中のファイル名を保存 |

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

要点と、現時点でのユーザー側の確認作業があれば、016_FileSelector.md に追加してください。

実装内容まとめ

主なAPI:

await fileSelector.init(containerElement) — DOM 生成 + アセット一覧取得を一括実行
動作フロー:

ipcRenderer.invoke('get-asset-list') → ["001", "002", "003"] を受け取り <select> を生成
デフォルトで先頭ファイルを自動ロード（sliceManager.load(name)）
選択変更時に再ロード → appStore.setSelectedFile(name) を更新
AppStore に選択済みファイルがあれば復元
ユーザー側の確認事項:

main.js に ipcMain.handle('get-asset-list', ...) ハンドラが必要です（assets フォルダをスキャンして名前一覧を返す）