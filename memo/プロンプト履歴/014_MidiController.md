【作るファイル】
midi/MidiController.js
main/midi/midiMain.js

【参照してよいファイル】
memo/設計2.md

【やること】
midi/MidiController.js ← IPC ─┼── main/midi/midiMain.js
#### `midi/MidiController.js`
| 依存先 | 種類 | 何のため |
|---|---|---|
| `electron` | npm | `ipcRenderer.on('midi-message')` でメインから受信 |

#### `main/midi/midiMain.js`
| 依存先 | 種類 | 何のため |
|---|---|---|
| `node-midi` | npm | MIDIデバイス列挙・メッセージ受信 |
| `electron` | npm | `ipcMain` でレンダラーへ転送 |


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

要点と、現時点でのユーザー側の確認作業があれば、014_MidiController.md に追加してください。

実装内容まとめ

main/midi/midiMain.js

起動時に全 MIDI 入力ポートを node-midi で開く
メッセージを { type, channel, number, value, raw } にパースして 'midi-message' で転送
デバイス名一覧を 'midi-devices' で転送
start(win) / stop() を export
renderer/midi/MidiController.js

'midi-message' / 'midi-devices' を IPC で受信
onMessage(cb) / offMessage(cb) でコールバック登録
onDevices(cb) / offDevices(cb) でデバイス変更を購読
devices getter で現在の接続デバイス一覧を参照
ユーザー側の確認事項:

node-midi が package.json に含まれていないため、インストールとリビルドが必要です:

npm install midi
npx electron-rebuild -w midi

main.js で midiMain.start(win) を BrowserWindow 生成後に呼ぶ必要があります
ホットプラグ（起動後のデバイス接続）には現時点で対応していません（対応が必要な場合は別途ポーリングまたは node-midi のウォッチ機能を追加）