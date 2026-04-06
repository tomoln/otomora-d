AppStore.js とは
アプリ全体で共有する「状態（データ）の置き場所」です。

なぜ必要か
例えば「現在のBPM」は、複数のファイルが同時に参照する。

BpmSync.js → BPMを受け取ってグリッドタイミングを計算
GridPlayer.js → BPMに合わせて再生速度を決める
ui/GridView.js → BPMを画面に表示する
それぞれが「自分でBPMを持つ」と、どこかで値がズレたときに混乱する。
1箇所にまとめて置けば、全員が同じ値を見られる。 それが AppStore.js の役割。

具体的に何が定義されるか

// AppStore.js のイメージ

const state = {
  bpm: 120,              // 現在のBPM（60〜200）
  isPlaying: false,      // 再生中かどうか
  x2: false,             // x2モード（倍速）のオン/オフ

  selectedFile: '001',   // 今選んでいるオーディオファイルの名前

  effectStates: {        // 各エフェクトの状態
    pitchDrop:     { enabled: false, ... },
    granularFreeze:{ enabled: false, ... },
    stutter:       { enabled: false, division: 16 },
    scratch:       { enabled: false, ... },
    sequencerGate: { enabled: false, division: 16 },
  },

  midiMappings: {        // MIDIコントローラーの割り当て
    // pad 1 → 再生/停止、など
  }
}
どう使われるか

AppStore.js
  ├── BpmSync.js      が bpm を読む・書く
  ├── GridPlayer.js   が isPlaying, x2 を読む
  ├── EffectPanel.js  が effectStates を読む・書く
  ├── MidiMapping.js  が midiMappings を読む・書く
  └── FileSelector.js が selectedFile を書く
各ファイルは AppStore から値を読むだけ。
値を変えたいときも AppStore の関数を通して変える。
→ 「状態の変更は必ずここを通る」 という一本道を作ることで、バグの原因が追いやすくなる。

一言で言うと：アプリの「現在の状態」を全員が共有するための共通メモ帳 です。