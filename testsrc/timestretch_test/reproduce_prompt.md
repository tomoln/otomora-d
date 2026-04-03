# タイムストレッチ テスト 再現プロンプト

以下をそのまま Claude Code に渡す。

---

Electron アプリで、オーディオファイルのリアルタイム タイムストレッチ（ピッチ保持）テストを最小構成で実装してください。

## 要件

- `assets/audio/001.wav` をループ再生する
- 再生中にテンポ倍率（x0.5〜x3）をリアルタイムで変更できる
- ピッチは変えず、速度だけ変わること
- BPM入力（元BPM→目標BPM）でも倍率を指定できる
- UI は最小構成で構わない（デザイン不要）

## 技術的な制約・注意点

- npm パッケージ `soundtouchjs`（バージョン `^0.2.3`）を使う
- `soundtouchjs` は ESM 形式のため `require()` は使えない。Electron レンダラー内では `await import('../../node_modules/soundtouchjs/dist/soundtouch.js')` で動的インポートすること
- `fs` / `path` など Node.js 組み込みモジュールは `require()` で問題ない
- Electron の webPreferences は `nodeIntegration: true`、`contextIsolation: false` にすること
- `SimpleFilter.extract` は `(target, numFrames, position)` の3引数で呼ばれる。`position` は SimpleFilter が管理する累積フレーム数なので `position % totalFrames` でループを実現すること

## ファイル構成（出力先）

```
package.json
src/main/main.js
testsrc/timestretch_test/index.html
testsrc/timestretch_test/test.js
```

`src/main/main.js` は `testsrc/timestretch_test/index.html` を開くこと。

## 起動

```bash
npm install
npm start
```
