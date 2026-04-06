【作るファイル】
main/main.js

【参照してよいファイル】
memo/設計2.md

【やること】
#### `main/main.js`
エントリポイント、ウィンドウ生成
| 依存先 | 種類 | 何のため |
|---|---|---|
| `main/link/linkBridge.js` | ローカル | Link の起動・IPC登録 |
| `main/midi/midiMain.js` | ローカル | MIDI の起動・IPC登録 |
| `electron` | npm | BrowserWindow, ipcMain |
| `path`, `fs` | Node.js 標準 | ファイルパス解決、assets一覧取得 |

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

要点と、現時点でのユーザー側の確認作業があれば、021_main.md に追記してください。

作成した main/main.js の要点：

役割	内容
assets-list IPC	assets/audio/ と assets/json/ のファイル名一覧を返す
createWindow	BrowserWindow 生成 → renderer/index.html をロード → linkBridge・midiMain を起動
closed イベント	linkBridge.stop() / midiMain.stop() でリソース解放
MIDI 権限	setPermissionRequestHandler で midi/midiSysex を許可
確認作業

package.json の "main" が "src/main/main.js" になっていますが、実際のパスは main/main.js です。"main/main.js" に修正が必要です。
renderer/index.html はまだ存在しないため、作成するまで起動時にエラーになります。