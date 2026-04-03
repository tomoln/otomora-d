# グラニュラーフリーズ+ テスト 再現プロンプト

以下をそのまま Claude Code に渡す。

---

Electron アプリで、改良版グラニュラーフリーズエフェクトのテストを最小構成で実装してください。

## 要件

- `assets/audio/001.wav` をループ再生する
- **フリーズ ON** ボタンを押した瞬間の位置の音を、グラニュラーエフェクトで連続的に持続させる
- フリーズ中はスタッターにならず、音が「線」として聞こえること（なめらかな持続音）
- **フリーズ OFF** で通常再生していた場合の位置から即座に復帰する
- 以下の3つをスライダーで調整できる UI を付けること：
  - グレインサイズ（40〜400ms）
  - 位置ランダム幅（0〜80ms）
  - ピッチランダム幅（0〜5%）

## 技術的な制約・注意点

**なめらかさのための核心パラメータ（変えないこと）：**
- グレイン重なり割合: `OVERLAP = 0.25`（`interval = grainSizeSec * 0.25`）→ 常に4枚重なる
- 窓関数: `Math.pow(Math.sin(Math.PI * t), 0.7)` の形（中央フラットなし、全体がなめらか）
- スケジューラ先読み: 0.3秒、呼び出し間隔: 60ms

**各グレインの処理：**
- 位置: `freezePos + (Math.random() * 2 - 1) * posRandSec` でランダムにズラす（バッファ端でクランプ）
- ピッチ: `playbackRate = 1.0 + (Math.random() * 2 - 1) * pitchRange`
- 各グレインに GainNode で窓関数を `setValueCurveAtTime(curve, when, grainSizeSec)` で適用

**OFF 時の再生位置復元：**
- フリーズ ON 時に `sourceStartTime`（AudioContext 時刻）と `playbackStartPos`（バッファオフセット秒）を記録
- `playbackStartPos + (audioCtx.currentTime - sourceStartTime)` で通常速度の現在位置を計算して復帰

- フリーズ中は通常再生ソースを stop() してグレインのみ鳴らす
- Electron の webPreferences は `nodeIntegration: true`、`contextIsolation: false`
- `fs` / `path` は `require()` で使用

## ファイル構成

```
testsrc/granular_plus_test/
  index.html
  test.js
```

`src/main/main.js` の pageMap に `granular_plus` エントリを追加し、`package.json` に以下を追加すること：

```json
"test:granular-plus": "cross-env OTOMORA_TEST=granular_plus electron ."
```

## 起動

```bash
npm run test:granular-plus
```
