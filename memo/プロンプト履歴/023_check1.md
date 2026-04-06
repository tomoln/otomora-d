【参照してよいファイル】
audio/AudioEngine.js

【問題点】
現在UI上でのテストを行なっています。
UIが立ち上がるのは問題なし
Playを押した時に、音が再生されない問題を解決したい。
要点と、音が再生されるのはどこの関数か、教えてほしい。


【やらないこと】
依存ルールで、関係ない部分のファイルは見ない

## 依存の方向まとめ（上が下に依存する）

```
renderer/index.js
│
├─ ui/*.js
│   └─ audio/GridPlayer.js ←─────────┐
│       ├─ audio/SliceManager.js      │
│       ├─ audio/TimeStretcher.js     │
│       ├─ audio/BpmSync.js ←── IPC ─┼── main/link/linkBridge.js
│       ├─ audio/FadeManager.js       │
│       └─ audio/AudioEngine.js       │
│                                     │
├─ effects/EffectChain.js             │
│   ├─ effects/*.js                   │
│   └─ audio/AudioEngine.js           │
│                                     │
├─ midi/MidiMapping.js                │
│   ├─ midi/MidiController.js ← IPC ─┼── main/midi/midiMain.js
│   └─ store/AppStore.js              │
│                                     │
└─ store/AppStore.js（依存なし）      │
   audio/AudioEngine.js（依存なし）   │


結果

AudioEngine.js の要点
役割
AudioEngine は AudioContext と masterGain ノードの管理のみを担当する最下層モジュール。音の再生処理は持っていない。

音が再生されない原因として疑うべき点
init() が呼ばれていない可能性が高い（AudioEngine.js:13-21）


init() {
  if (this._context) return;
  this._context = new AudioContext();  // ← これが null のまま
  ...
}
init() はブラウザの制約上、ユーザー操作（クリック等）を起点に呼ぶ必要がある
Play ボタン押下時に init() が呼ばれていなければ this._context === null のまま
this._context が null だと、上位モジュール（GridPlayer など）が audioEngine.context を使おうとしても何もできない
音が再生される関数はどこか
AudioEngine.js 自体には再生関数は存在しない。AudioEngine はあくまで以下を提供するだけ：

context → AudioContext（音源バッファのデコード・スケジューリングに使う）
masterGain → 出力ノード（音声グラフの最終接続先）
実際の再生処理は依存ツリー上位の audio/GridPlayer.js が担っているはず。Play ボタン → GridPlayer → AudioEngine の context / masterGain を使って再生、という流れ。

確認ポイント
Play ボタンのハンドラで audioEngine.init() が呼ばれているか確認してください。


---
playボタンが押された時の挙動を確認する


問題点
playボタンを押すと、音がグリッドで再生されるが、
再生されるところとされないところがあり、
原因を調べてほしい
Codeはまだ修正しないで

playボタンが押された時の挙動

1. Bootボタンの実行
index.js
// ── エントリーポイント ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  el('btn-boot').addEventListener('click', boot);
});

Bootボタンの役割：AudioContextをユーザー操作で許可してもらうための最初のボタン


2. Playボタン押下 → gridPlayer.play()が呼ばれる
index.js
 // ⑥ 操作ボタン
  el('btn-play').addEventListener('click', () => gridPlayer.play());

3. play() が実行される
GridPlayer.js
  play() が実行される