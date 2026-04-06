【作るファイル】
store/                   # 状態管理
│       └── AppStore.js          # グローバル状態（BPM、再生状態、マッピング等）

【参照してよいファイル】
memo/設計2.md

【やること】
| 持つ状態 | 内容 |
|---|---|
| `bpm` | 現在のBPM |
| `isPlaying` | 再生中フラグ |
| `x2` | x2モードフラグ |
| `selectedFile` | 選択中のオーディオファイル名 |
| `effectStates` | 各エフェクトのオン/オフ・パラメータ |
| `midiMappings` | MIDIマッピング設定 |

【やらないこと】
あとで
renderer/index.js
├─ ui/*.js　# UI処理
linkBridge.js　# Ableton Link ブリッジ（ネイティブモジュール連携）
├─ effects/EffectChain.js   　# エフェクトチェーン管理・切り替え
midiMain.js　# Web MIDI API または node-midi の初期化
は後で実装するんで、その辺はここに書かない


回答
store/AppStore.js を作成しました。

構成のポイント：

シングルトンとして module.exports = new AppStore() でエクスポート（どこからimportしても同じインスタンス）
状態は _state にまとめ、直接触らせず getter/setter 経由で変更
setBpm は60〜200にクランプ
エフェクト系は setEffectEnabled(effectName, bool) と setEffectParam(effectName, key, value) で個別操作
on('bpm', (next, prev) => ...) のようにキーごとのイベント購読が可能。また on('change', ({ key, value, prev }) => ...) で全変更を一括監視できる

udioEngine.js の要点と確認事項
要点
設計方針

シングルトンとして export（module.exports = new AudioEngine()）— アプリ全体で1つのインスタンスを共有
AudioContext + マスター GainNode の最小構成
ボリューム変更は setTargetAtTime で急激な変化（プツ音）を防止
主要メソッド

メソッド	説明
init()	AudioContext を生成（ユーザー操作後に呼ぶ）
dispose()	リソース解放
setMasterVolume(0〜1)	マスター音量をスムーズに変更
getMasterVolume()	現在の音量値を取得


ユーザー側で確認・注意すべき点
1. init() を必ずユーザー操作の中で呼ぶ
ブラウザ（Electron の renderer プロセスも同様）は、ユーザー操作なしに AudioContext を作ると suspended 状態になります。クリックや Enter キーのイベントハンドラ内で呼んでください。


button.addEventListener('click', () => {
  audioEngine.init(); // ← ここで呼ぶ
});
2. getMasterVolume() の値は瞬間値
setTargetAtTime で変化中の場合、.gain.value はスケジュール前の値を返すことがあります。UI スライダーと同期する場合は、セットした値を別途保持する方が確実です。

3. 他の音源ノードをマスターゲインに繋ぐ
BGM や SE を追加する際は、必ず masterGain に接続するように統一してください。


const source = audioEngine.context.createBufferSource();
source.connect(audioEngine.masterGain); // destination ではなく masterGain へ
4. dispose() の呼び出しタイミング
ウィンドウを閉じるときや画面遷移時に忘れずに呼ばないと、AudioContext がリークします。Electron なら window.addEventListener('beforeunload', ...) で呼ぶと安全です。