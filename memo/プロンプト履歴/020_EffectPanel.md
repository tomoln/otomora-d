【作るファイル】
ui/EffectPanel.js

【参照してよいファイル】
memo/設計2.md

【やること】
エフェクトのオン/オフ・パラメータUI
#### `ui/EffectPanel.js`
| 依存先 | 種類 | 何のため |
|---|---|---|
| `effects/EffectChain.js` | ローカル | エフェクトのオン/オフ・パラメータ操作 |
| `store/AppStore.js` | ローカル | 現在のエフェクト状態を読み書き |

【やらないこと】
依存の方向を間違えない

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

要点と、現時点でのユーザー側の確認作業があれば、020_EffectPanel.md に追記してください。

実装内容まとめ：

主な API:

effectPanel.init(container) — DOM 生成 + AppStore 購読（effectChain.init() 完了後に呼ぶこと）
動作フロー:

各エフェクトのボタンをクリック → effectChain[key].enable()/disable() + appStore.setEffectEnabled() を同時に呼ぶ
Stutter / SequencerGate は分割数セレクター（16/32/64/128）付き → effectChain[key].division = div + appStore.setEffectParam()
appStore.on('effectStates', ...) で MIDI 等の外部変化にもボタン表示が追従
ユーザー側の確認事項:

なし。index.js で await effectChain.init() の後に effectPanel.init(container) を呼ぶだけで動作します。
これで UI 系は全 5 ファイル揃いました：

ファイル	役割
FileSelector.js	アセット選択
GridView.js	グリッド表示
WordDisplay.js	モーラ・単語表示
EffectVisualizer.js	音響特徴量バー
EffectPanel.js	エフェクト ON/OFF
次は main/main.js か renderer/index.js になると思います。