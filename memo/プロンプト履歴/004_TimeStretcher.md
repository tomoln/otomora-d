【作るファイル】
TimeStretcher.js

【参照してよいファイル】
memo/設計2.md
004_TimeStretcher.md

【やること】
#### `audio/TimeStretcher.js`
| 依存先 | 種類 | 何のため |
|---|---|---|
| `audio/AudioEngine.js` | ローカル | 処理結果を AudioContext に流す |
| `soundtouchjs ^0.2.3` | npm | ピッチを保ったまま再生速度を変える |

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

要点と、現時点でのユーザー側の確認作業があれば、004_TimeStretcher.md に追加してください。

---

## 要点

**設計方針：オフライン処理**
- `stretch()` はその場で AudioBuffer を生成して返す（同期処理）
- GridPlayer は返値を `BufferSourceNode` に渡し `src.start(when)` で精密スケジュールできる
- `getWebAudioNode`（リアルタイム）は使わない → Ableton Link の精度を維持するため

**soundtouchjs の読み込み方**
- soundtouchjs は ESM のため `require()` 不可
- `pathToFileURL(__dirname + ...)` で絶対パスを作り `import()` で読む
- `init()` が完了するまで `stretch()` は呼べない

**主要メンバー**

| メンバー | 説明 |
|---|---|
| `init()` | soundtouchjs を動的 import（async、一度だけ呼ぶ） |
| `stretch(buffer, tempo)` | tempo 倍率でストレッチした新しい AudioBuffer を返す（同期） |

**tempo 倍率の計算（GridPlayer が行う）**
```
tempo = moraDuration / beatSec
// 例: 0.2s のモーラを BPM120（0.5s/beat）に収める → tempo = 0.2 / 0.5 = 0.4（遅く伸ばす）
// 例: 0.8s のモーラを BPM120 に収める → tempo = 0.8 / 0.5 = 1.6（速く縮める）
```

**呼び出し順序**
```
AudioEngine.init()       ← ユーザー操作起点
  └─ TimeStretcher.init()  ← await で soundtouchjs をロード
       └─ stretch(buffer, tempo)  ← GridPlayer が各ビートで呼ぶ（同期）
```

---

## 現時点でのユーザー確認作業

**確認は不要です。**

TimeStretcher は AudioEngine と soundtouchjs のみに依存しており、IPC やメインプロセスの準備は不要です。動作確認は GridPlayer と接続した後になります。

ただし、BPM変化時の**再計算コスト**については将来的に注意が必要です。リアルタイムで BPM が変わるたびに `stretch()` を呼ぶと、次のビートまでの時間内に処理が終わる必要があります。モーラ1つあたりのストレッチ処理は数ミリ秒以下ですが、GridPlayer 側でキャッシュ戦略を検討しておくと安全です。