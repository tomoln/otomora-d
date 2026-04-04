# 再現プロンプト: Ableton Link BPM Sync テスト

electronを使用しています。
testsrc/abletonlive_bpm_sync_test 内にテストを実装してください。
実行コマンドも用意してください。

## 要件

- Web Audio API でメトロノームの音を出す
- 起動中の Ableton Live 12 のマスターテンポが変更された時、リアルタイムでメトロノームの BPM も変更される
- Ableton Live で再生されている音と、メトロノームの音のタイミングが完全に同期している
- Ableton Link を使って実装する

## 既存構成

- `src/main/main.js`: Electron メインプロセス（`OTOMORA_TEST` 環境変数でテスト切替）
- `package.json`: `cross-env` で環境変数を渡す npm scripts パターン
- `nodeIntegration: true`, `contextIsolation: false`
