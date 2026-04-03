# オーディオポイントテスト 再現プロンプト

以下をそのまま Claude Code に渡す。

---

Electron アプリで、オーディオとメトロノームの同期再生テストを最小構成で実装してください。

## ファイル

- 音声: `assets/audio/001.wav`
- タイムスタンプ: `assets/json/001.json`

JSON 構造:
```json
[
  {
    "word_id": 1,
    "word": "...",
    "moras": [
      { "slice_id": 1, "text": "い", "start": 0.33, "end": 0.45, "duration": 0.12, ... },
      ...
    ]
  }
]
```

## 要件

1. JSON の全モーラをフラット配列に展開し、BPM のビートごとに1モーラずつ順番に再生する
2. 各ビートで、モーラスライスと同時にクリック音（メトロノーム）も鳴らす
3. クリック音とモーラスライスは **完全に同期** させること
4. 再生中にリアルタイム波形を表示する（キャンバス）
5. ビート時に波形の枠と線を赤くフラッシュ（80ms）させて同期確認できるようにする
6. 波形の拡大縮小スライダー（x1〜x32）
7. **オーディオオフセット調整ボタン**：`-10ms` `-1ms` `+1ms` `+10ms` とリセット。クリック基準でオーディオ再生タイミングをずらせる（マイナス＝早める、プラス＝遅らせる）
8. 現在のオフセット値を ms 表示する
9. UI は最小構成で構わない

## 技術的な制約

- **同期の実装**: `setTimeout` は使わず、`AudioContext.currentTime` を一本化して全音源を `.start(scheduleTime)` で予約すること
- クリック音は外部ファイル不要。正弦波バースト（約 10ms、1000Hz、指数減衰）をプログラムで生成する
- モーラスライスは `AudioBuffer.getChannelData().subarray()` で切り出す
- リアルタイム波形は `AnalyserNode`（fftSize: 2048）を `destination` の前に挟み、`getFloatTimeDomainData` で描画する
- `fs` / `path` は `require()` で使用。Node.js 組み込みのみ `require()` でよい
- Electron の webPreferences は `nodeIntegration: true`、`contextIsolation: false`

## ファイル構成

```
testsrc/audio_point_test/
  index.html
  test.js
```

`src/main/main.js` はこのテストの `index.html` を開くこと。

## 起動

```bash
npm start
```
