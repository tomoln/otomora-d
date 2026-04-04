# IPC の説明

## Electron の2つのプロセス

Electron アプリは、内部的に**2つの別々のプログラム**が同時に動いている。

| プロセス | 場所 | できること |
|---|---|---|
| **メインプロセス** `main/` | Node.js 環境 | ファイル読み書き、OSへのアクセス、MIDIデバイス、Ableton Link |
| **レンダラープロセス** `renderer/` | ブラウザ環境 | 画面描画、Web Audio API、UI操作 |

この2つは**完全に別々のプログラム**として動いている。
ちょうど「バックヤード（倉庫）」と「店頭（売り場）」が別の建物にあるようなイメージ。

---

## なぜ直接 import できないのか

通常の JavaScript では、ファイルを `import` して使える。

```js
// これは同じプロセス内なら動く
import { something } from './other-file.js'
```

しかし Electron では、メインプロセスとレンダラープロセスは**別プロセス（別メモリ空間）**なので、
レンダラーから `main/linkBridge.js` を直接 import しても、そのファイルに触れない。

---

## IPC とは

**IPC = Inter-Process Communication（プロセス間通信）**

別々のプロセスが**メッセージを送り合う**仕組み。
「電話」のようなもの。直接会うことはできないが、電話越しに情報をやり取りできる。

---

## 実際の流れ（BPMを例に）

```
Ableton Live
  ↓ BPM情報
main/link/linkBridge.js   ← Node.js 環境。Ableton Link ライブラリが使える
  ↓ ipcMain.handle('get-bpm', ...) でメッセージを「受け付ける窓口」を作る
  ↕  ← ここが IPC（電話回線）
  ↑ ipcRenderer.invoke('get-bpm') で「教えて」と問い合わせる
renderer/audio/BpmSync.js ← ブラウザ環境。Web Audio API が使える
  ↓ BPMを受け取ってグリッドのタイミングを計算
```

---

## コードのイメージ

**メイン側（送る窓口を作る）**
```js
// main/link/linkBridge.js
const { ipcMain } = require('electron')

ipcMain.handle('get-bpm', () => {
  return currentBpm  // Ableton Link から取得した値
})
```

**レンダラー側（問い合わせる）**
```js
// renderer/audio/BpmSync.js
const { ipcRenderer } = require('electron')

const bpm = await ipcRenderer.invoke('get-bpm')
// bpm に値が届く
```

---

## このプロジェクトで IPC が必要な箇所

| メイン側（窓口） | レンダラー側（問い合わせ） | やり取りする内容 |
|---|---|---|
| `main/link/linkBridge.js` | `audio/BpmSync.js` | BPM・ビート位置 |
| `main/midi/midiMain.js` | `midi/MidiController.js` | MIDIメッセージ |
| `main/main.js` | `ui/FileSelector.js` | assets のファイル一覧 |

---

## まとめ

- Electron = メインプロセス（Node.js）＋ レンダラープロセス（ブラウザ）の2本立て
- 2つは別メモリなので直接 import 不可
- IPC = プロセス間の「電話」。メッセージ名（`'get-bpm'` など）を決めて送受信する
- **セットで作らないと動かない**（片方だけ作っても繋がらない）
