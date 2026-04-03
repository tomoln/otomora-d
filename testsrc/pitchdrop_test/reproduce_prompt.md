# ピッチドロップテスト 再現プロンプト

以下をそのまま Claude Code に渡す。

---

Electron アプリで、ピッチドロップエフェクトのテストを最小構成で実装してください。

## 要件

- `assets/audio/001.wav` をループ再生する
- **ピッチドロップ ON** ボタンを押すと、レコードを止めたようにピッチがなめらかに下がり最終的に無音になる
- **ピッチドロップ OFF** ボタンを押すと、通常速度で再生していた場合の位置から即座に通常再生に戻る
- ピッチが落ちる時間（秒）をスライダーで調整できる（0.3〜8秒）
- UI は最小構成で構わない

## 技術的な制約・注意点

- `AudioBufferSourceNode.playbackRate.setValueCurveAtTime()` でピッチドロップを実装すること
- ピッチドロップ曲線は `1.0 → 0.001` の凸型カーブ（`Math.pow(1-t, 1.8)` 的な形）にすること
- OFF 時の再生位置復元：ソース開始時の AudioContext 時刻（`sourceStartTime`）とバッファオフセット（`playbackStartPos`）を記録しておき、`playbackStartPos + (audioCtx.currentTime - sourceStartTime)` で通常速度での現在位置を計算する。ピッチドロップ中は `playbackRate` が遅いため実際の再生位置と乖離するため、この計算が必須
- OFF 時は現在のソースを stop() して、新しい `AudioBufferSourceNode` を計算した位置から start() する
- Electron の webPreferences は `nodeIntegration: true`、`contextIsolation: false`
- `fs` / `path` は `require()` で使用

## ファイル構成

```
testsrc/pitchdrop_test/
  index.html
  test.js
```

`src/main/main.js` の pageMap に `pitchdrop` エントリを追加し、`package.json` に以下を追加すること：

```json
"test:pitchdrop": "cross-env OTOMORA_TEST=pitchdrop electron ."
```

## 起動

```bash
npm run test:pitchdrop
```
