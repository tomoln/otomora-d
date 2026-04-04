【作るファイル】
SliceManager.js

【参照してよいファイル】
memo/設計2.md
003_SliceManager.md

【やること】
#### `audio/SliceManager.js`
| 依存先 | 種類 | 何のため |
|---|---|---|
| `audio/AudioEngine.js` | ローカル | `decodeAudioData` でWAVをバッファに変換 |
| `electron` | npm | `ipcRenderer.invoke` でメインに assets のパスを問い合わせ |

> **持つもの:** `slices[]` — `{ buffer, word, mora, startTime, rms, f0, spectral_centroid, zcr }` の配列

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

要点と、現時点でのユーザー側の確認作業があれば、003_SliceManager.mdに追加してください。

---

## 要点

**設計方針**
- シングルトンで export（`AppStore` / `AudioEngine` と同じパターン）
- `slices[]` はモーラ単位のフラット配列。word 情報は各要素に複製して持つ
- 再生ロジック・スケジューリングは一切持たない（それは `GridPlayer.js` の責務）

**主要メンバー**

| メンバー | 説明 |
|---|---|
| `slices[]` | モーラごとのスライス配列。各要素は `{ buffer, word, mora, startTime, rms, f0, spectral_centroid, zcr }` |
| `load(name)` | `"001"` 等を渡すと WAV + JSON を読み込み `slices[]` を構築する（async） |
| `clear()` | `slices[]` を空にする |
| `_sliceBuffer()` | AudioBuffer から時間範囲を切り出す内部関数 |

**呼び出し順序の制約**
```
AudioEngine.init()   ← ユーザー操作起点で呼ぶ
  └─ SliceManager.load('001')  ← context が必要なので必ず後
```

---

## 現時点でのユーザー確認作業

**1. メインプロセスに IPC ハンドラが必要（未実装）**

`main/main.js` に以下を追加しないと `load()` がエラーになります。

```js
const { ipcMain, app } = require('electron');
const path = require('path');

ipcMain.handle('get-asset-paths', (_, name) => ({
  audioPath: path.join(app.getAppPath(), 'assets', 'audio', `${name}.wav`),
  jsonPath:  path.join(app.getAppPath(), 'assets', 'json',  `${name}.json`),
}));
```

**2. `nodeIntegration: true` が必要**

`SliceManager.js` は `require('fs')` を使うため、`BrowserWindow` の設定で `nodeIntegration: true` が必要です。`main.js` で確認してください。

```js
new BrowserWindow({
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false,
  }
});
```

**3. 現時点では動作確認できない**

`renderer/index.html` と `renderer/index.js` がまだ空のため、`SliceManager` はどこからも呼ばれていません。動作確認は `GridPlayer.js` と接続した後になります。