【作るファイル】
audio/FadeManager.js

【参照してよいファイル】
memo/設計2.md


【やること】
#### `audio/FadeManager.js`
| 依存先 | 種類 | 何のため |
|---|---|---|
| `audio/AudioEngine.js` | ローカル | `GainNode` の `linearRampToValueAtTime` でフェード |

【やらないこと】
構成を下記にするので、役割以外のことは作らない
#### `audio/GridPlayer.js`
| 依存先 | 種類 | 何のため |
|---|---|---|
| `audio/AudioEngine.js` | ローカル | バッファ再生 |
| `audio/SliceManager.js` | ローカル | `slices[]` を参照 |
| `audio/TimeStretcher.js` | ローカル | 各スライスをBPMに合わせて伸縮 |
| `audio/BpmSync.js` | ローカル | ビートのタイミング購読 |
| `audio/FadeManager.js` | ローカル | 重なり時のフェードアウト |
| `store/AppStore.js` | ローカル | 再生状態・x2フラグ参照 |

要点と、現時点でのユーザー側の確認作業があれば、006_FadeManager.md に追加してください。

---

## 要点

**設計方針**
- FadeManager はノード生成とフェードスケジュールの2つだけを持つ
- 「重なっているかどうかの判定」はしない。GridPlayer が判断して呼ぶ

**オーディオグラフの接続**
```
BufferSourceNode → gainNode(FadeManager製) → masterGain → destination
```
各スライスに1つの gainNode を割り当てる。

**主要メンバー**

| メンバー | 説明 |
|---|---|
| `createFadeNode()` | masterGain に接続済みの GainNode を返す |
| `scheduleFadeOut(gainNode, startTime, duration=0.02)` | `startTime` から `duration` 秒でゲインを 0 にランプ、完了後に disconnect |

**GridPlayer 側の使い方イメージ**
```js
// ビート N を再生するとき
const gain = fadeManager.createFadeNode();
src.connect(gain);
src.start(when);

// ビート N+1 が来たとき、まだ鳴っていれば前のノードをフェードアウト
fadeManager.scheduleFadeOut(prevGain, nextBeatWhen - 0.01, 0.02);
// → 次のビート 10ms 前から 20ms かけてフェードアウト
```

---

## 現時点でのユーザー確認作業

**確認は不要です。**

FadeManager は AudioEngine のみに依存しており、IPC もメインプロセスも不要です。動作確認は GridPlayer と接続した後になります。

