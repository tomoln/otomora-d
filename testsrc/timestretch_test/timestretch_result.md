# タイムストレッチ 実装方式 検討結果

## 前提条件の整理

- 環境: Electron（レンダラープロセスで Web Audio API 使用可能）
- 対象: 日本語音声（speech）
- 範囲: x0.5 ～ x3（6倍の幅）
- 要件: リアルタイム・低遅延・ピッチ保持

---

## 主要な選択肢と評価

### 1. Web Audio API の `playbackRate`（❌ 不採用）

```js
audioBufferSourceNode.playbackRate.value = 2.0;
```

- ピッチも同時に変わる（テープ速度変化と同じ）
- ピッチ保持の要件を満たさない

---

### 2. Phase Vocoder（純 JS / AudioWorklet）

| 項目 | 評価 |
|------|------|
| 音質（音声） | △ 金属的なアーティファクトが出やすい |
| リアルタイム性 | ○ |
| 遅延 | △ FFT ウィンドウサイズ分（数十～数百 ms）|
| x0.5～x3 対応 | △ 極端な比率で劣化 |
| 実装難易度 | 高 |

日本語音声には不向き。ピッチ変換・楽器向き。

---

### 3. WSOLA（Waveform Similarity Overlap-Add）

| 項目 | 評価 |
|------|------|
| 音質（音声） | ○ 音声に適した設計 |
| リアルタイム性 | ○ 時間領域処理なので低コスト |
| 遅延 | ○ 小さい |
| x0.5～x3 対応 | △ x3 付近で品質低下あり |
| 実装難易度 | 中 |

音声向けだが、x3 の極端な引き伸ばしは厳しい。

---

### 4. **SoundTouch.js（WASM + AudioWorklet）** ✅ **推奨**

SoundTouch は C++ 製のリアルタイムテンポ変更ライブラリ。WebAssembly ポートが存在し、Electron の AudioWorklet から利用可能。

| 項目 | 評価 |
|------|------|
| 音質（音声） | ○ 音声・音楽両対応 |
| リアルタイム性 | ◎ ストリーム処理設計 |
| 遅延 | ○ バッファサイズ調整可（128〜512 samples） |
| x0.5～x3 対応 | ○ |
| Electron 対応 | ◎ |
| ライセンス | LGPL-2.1 |
| npm パッケージ | `soundtouch-audio-api` |

```
npm install soundtouch-audio-api
```

#### 実装イメージ（概要）

```js
// AudioWorklet に SoundTouch WASM を読み込む
// レンダラープロセス（Electron）で使用

const audioCtx = new AudioContext();
await audioCtx.audioWorklet.addModule('soundtouch-worklet.js');

const source = audioCtx.createBufferSource();
source.buffer = audioBuffer; // 001.wav をデコード済み

const stretcher = new AudioWorkletNode(audioCtx, 'soundtouch-processor');

// BPM変更時にリアルタイムでテンポ比を送信
function onBpmChange(newBpm, originalBpm) {
  const ratio = newBpm / originalBpm;
  stretcher.port.postMessage({ tempo: ratio });
}

source.connect(stretcher).connect(audioCtx.destination);
source.start();
```

#### BPM 変更時の遅延について

- AudioWorklet のバッファサイズを 128 samples（約 3ms @44100Hz）に設定することで、BPM 変更から音声変化まで **10ms 以下** が期待できる
- SoundTouch 内部バッファ分（数十 ms）は避けられないが、体感上は十分低遅延

---

### 5. Rubber Band Library（WASM）

| 項目 | 評価 |
|------|------|
| 音質 | ◎ 最高品質 |
| リアルタイム性 | ○（Real-time モードあり） |
| 遅延 | △ SoundTouch よりやや大きい |
| x0.5～x3 対応 | ◎ |
| Electron 対応 | ○ |
| ライセンス | GPL / 商用ライセンス |
| npm パッケージ | `rubberband-web` |

音質を最優先にするなら Rubber Band。ただしライセンスが GPL なので商用利用には商用ライセンスが必要。

---

## 結論

| 優先事項 | 推奨 |
|----------|------|
| 実装のシンプルさ + 低遅延 + 音声品質のバランス | **SoundTouch.js（soundtouch-audio-api）** |
| 最高音質（GPL 許容 or 商用ライセンス取得） | Rubber Band Library |

**→ まず `soundtouch-audio-api` で実装し、音質が不足なら Rubber Band に移行する** のが現実的なアプローチ。

---

## 参考リンク

- soundtouch-audio-api: https://www.npmjs.com/package/soundtouch-audio-api
- SoundTouch 公式: https://www.surina.net/soundtouch/
- Rubber Band Web: https://github.com/w-okada/rubberband-web
- Web Audio API AudioWorklet: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
