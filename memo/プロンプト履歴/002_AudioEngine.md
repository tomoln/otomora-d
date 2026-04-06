【作るファイル】
AudioEngine.js

【参照してよいファイル】
memo/設計2.md

【やること】
**他のファイルへの依存：なし**（最も根本のファイル）

| 持つもの | 内容 |
|---|---|
| `AudioContext` | Web Audio API のコンテキスト（全音声処理の基盤） |
| `masterGainNode` | 出力ゲート |

【やらないこと】
あとで
renderer/index.js
├─ ui/*.js　# UI処理
linkBridge.js　# Ableton Link ブリッジ（ネイティブモジュール連携）
├─ effects/EffectChain.js   　# エフェクトチェーン管理・切り替え
midiMain.js　# Web MIDI API または node-midi の初期化
は後で実装するんで、その辺はここに書かない


現時点での位置づけ
renderer/AudioEngine.js は 骨格のみの状態です。AppStore.js と並んで新しい renderer 構成として作られていますが、src/renderer/app.js と src/renderer/index.html は空のため、まだどこからも使われていません。

testsrc の audiosync_test/test.js に動作する実装があり、そこと比べると現在の AudioEngine には以下がまだないことが分かります。

機能	testsrc での実装	AudioEngine での状態
AnalyserNode	あり（波形表示に必要）	なし
音声ファイル読み込み・デコード	あり	なし
モーラのスケジューリング	あり	なし
クリック音生成	あり	なし
ユーザーが今確認すべきこと
確認は不要です。 現時点では AudioEngine.js は単独で動作する画面もなく、テストする手段がありません。