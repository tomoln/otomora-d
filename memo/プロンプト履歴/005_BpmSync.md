【作るファイル】
audio/BpmSync.js
main/link/linkBridge.js

【参照してよいファイル】
memo/設計2.md


【やること】
audio/BpmSync.js ←── IPC ─┼── main/link/linkBridge.js

#### `audio/BpmSync.js`
| 依存先 | 種類 | 何のため |
|---|---|---|
| `audio/AudioEngine.js` | ローカル | `AudioContext.currentTime` でスケジューリング |
| `electron` | npm | `ipcRenderer.on('link-beat')` でBPM受信 |
| `store/AppStore.js` | ローカル | 現在のBPM・x2状態を読み書き |

> **持つもの:** `onBeat(callback)` — グリッドの各16分音符のタイミングでコールバックを呼ぶ


#### `main/link/linkBridge.js`
| 依存先 | 種類 | 何のため |
|---|---|---|
| `abletonlink`（または類似）| npm ネイティブ | BPM・ビート位置の取得 |
| `electron` | npm | `ipcMain` でレンダラーへ送信 |

【やらないこと】
構成を下記にするので、役割以外のことは作らない
#### `audio/GridPlayer.js`
| 依存先 | 種類 | 何のため |
|---|---|---|
| `audio/AudioEngine.js` | ローカル | バッファ再生 |
| `audio/SliceManager.js` | ローカル | `slices[]` を参照 |
| `audio/TimeStretcher.js` | ローカル | 各スライスをBPMに合わせて伸縮 |
| `audio/BpmSync.js` | ローカル | ビートのタイミング購読 |
| `audio/FadeManager.js` | ローカル | 重なり時のフェードアウト |
| `store/AppStore.js` | ローカル | 再生状態・x2フラグ参照 |

要点と、現時点でのユーザー側の確認作業があれば、005_BpmSync.md に追加してください。

---

## 要点

### linkBridge.js（メインプロセス）

| メンバー | 説明 |
|---|---|
| `start(win)` | AbletonLink を起動し 10ms ごとに `link-beat` IPC を送信 |
| `stop()` | Link を停止・IPC ハンドラを解除 |
| IPC ハンドラ | `link-set-bpm` / `link-play` / `link-stop` を renderer から操作可能 |

- `new AbletonLink(120, 4, true)` — 初期 BPM 120、quantum 4（= 1 bar）、有効化
- `win.isDestroyed()` チェックでウィンドウ閉じ後の crash を防止

### BpmSync.js（レンダラー）

**スケジューリングの仕組み**
```
Link が beat=3.75, bpm=120 を送信
  ↓
currentSixteenth = 3.75 × 4 = 15.0
sixteenthSec = (60/120)/4 = 0.125s
LOOK_AHEAD_SEC = 0.15s → 約 1.2 個先まで対象

n=16 → when = audioNow + (16 - 15.0) × 0.125 = audioNow + 0.125s
setTimeout(delay=125ms) → 発火時に callbacks(16, when) を呼ぶ
```

**GridPlayer との契約（コールバック引数）**
```
callback(sixteenth: number, when: number)
  sixteenth … Link 起点からのグローバル 16 分音符カウント（単調増加）
  when      … AudioContext.currentTime での再生予定時刻
```

GridPlayer 側で `(sixteenth - startSixteenth) % 96` を計算してパターン位置を決める。

**呼び出し順序**
```
AudioEngine.init()
  └─ BpmSync.start()          ← IPC 受信開始
       └─ BpmSync.onBeat(cb)  ← GridPlayer が登録
            └─ callback(sixteenth, when) が 16 分音符ごとに発火
```

---

## 現時点でのユーザー確認作業

**1. `main/main.js` に linkBridge の呼び出しが必要（未実装）**

```js
const { app, BrowserWindow } = require('electron');
const linkBridge = require('./link/linkBridge');

app.whenReady().then(() => {
  const win = new BrowserWindow({ ... });
  linkBridge.start(win);          // ← これを追加

  win.on('closed', () => {
    linkBridge.stop();            // ← これを追加
  });
});
```

**2. abletonlink のネイティブビルドが必要**

`abletonlink` は C++ ネイティブアドオンのため、Electron のバージョンに合わせたリビルドが必要です。

```bash
npm run rebuild
# = electron-rebuild -w abletonlink
```

**実行前に必ず一度このコマンドを走らせてください。** 失敗する場合は Xcode Command Line Tools が入っているか確認してください。

**3. Ableton Live が起動していなくても動作する**

abletonlink は Link ネットワーク上のピアがいなくても単独で動作します。`numPeers=0` のまま BPM だけが取れる状態で、Ableton Live を起動してリンクを有効にすると自動で同期されます。