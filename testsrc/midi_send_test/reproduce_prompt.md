# 再現プロンプト: MIDI ボタンマッピング テスト

electronを使用しています。
testsrc/midi_send_test 内にテストを実装してください。
実行コマンドも用意してください。

## 要件

- UIボタンを4つ用意する
- 接続されているMIDIコントローラーを認識する
- 各UIボタンに、MIDIコントローラーの好きなボタンを割り当てられる（MIDI Learn）
- 割り当て手順: 「割り当て」ボタンを押す → MIDIコントローラーのボタンを押す → 登録完了
- 以降、そのMIDIボタンを押すとUIボタンが発火する
- UIボタンはクリックでも手動発火できる
- 割り当て解除ボタンあり

## 既存構成

- `src/main/main.js`: Electron メインプロセス（`OTOMORA_TEST` 環境変数でテスト切替）
- `package.json`: `cross-env` で環境変数を渡す npm scripts パターン
- `nodeIntegration: true`, `contextIsolation: false`
- Web MIDI API を使う（追加パッケージ不要）
- main.js に `session.defaultSession.setPermissionRequestHandler` で `midi` / `midiSysex` を許可する処理を追加する
