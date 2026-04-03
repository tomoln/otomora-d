# グラニュラーフリーズテスト 再現プロンプト

以下をそのまま Claude Code に渡す。

---

Electron アプリで、グラニュラーフリーズエフェクトのテストを最小構成で実装してください。

## 要件

- `assets/audio/001.wav` をループ再生する
- **フリーズ ON** ボタンを押した瞬間の再生位置の音を、グラニュラーエフェクトで連続的に持続させる（スタッターにならず、途切れのない音）
- グレインサイズをスライダーで調整できる（40〜400ms）
- **フリーズ OFF** を押すと、通常再生していた場合の位置から即座に通常再生に戻る
- UI は最小構成で構わない

## 技術的な制約・注意点

- **グラニュラーフリーズの実装**:
  - グレインの重なり割合は 50%（`interval = grainSizeSec * 0.5`）
  - 各グレインにフリーズ位置を中心に前後 `grainSize/2` の範囲を切り出す
  - 各グレインに **Hann 窓** を GainNode の `setValueCurveAtTime` で適用すること（これが途切れをなくす核心）
  - Hann 窓カーブ: `0.5 * (1 - Math.cos(2π * i / (steps-1)))`
  - グレインのスケジューリングは `setTimeout` ループ（間隔 80ms）＋ `AudioContext.currentTime` の先読み（0.3秒先まで）で行う
- **OFF 時の再生位置復元**: フリーズ ON 時に `sourceStartTime`（AudioContext 時刻）と `playbackStartPos`（バッファオフセット秒）を記録し、`playbackStartPos + (audioCtx.currentTime - sourceStartTime)` で通常速度の現在位置を計算して復帰する
- フリーズ中は通常再生ソースを stop() してグレインのみ鳴らす
- Electron の webPreferences は `nodeIntegration: true`、`contextIsolation: false`
- `fs` / `path` は `require()` で使用

## ファイル構成

```
testsrc/granular_test/
  index.html
  test.js
```

`src/main/main.js` の pageMap に `granular` エントリを追加し、`package.json` に以下を追加すること：

```json
"test:granular": "cross-env OTOMORA_TEST=granular electron ."
```

## 起動

```bash
npm run test:granular
```
