# オーディオポイント再生 設計書

## やりたいこと

- `001.wav` の台詞をモーラ単位でスライスし、BPM のリズムに乗せて順番に再生する
- メトロノーム音（クリック）と台詞スライスを**完全に同期**させる
- 「同じ箱に時刻を入れてから再生」＝ **Web Audio API の AudioContext 時計を一本化する**

---

## 核心：なぜ「同じ箱」が必要か

`setTimeout` や `setInterval` を使って再生をスケジュールすると、  
JavaScript のイベントループ遅延（数〜数十ms）が発生し、  
メトロノームとスライスがズレる。

Web Audio API の `AudioContext.currentTime` は**サンプル精度のハードウェア時計**であり、  
すべての音を「未来の時刻に鳴らす予約」として登録できる。  
この一本の時計を使うことで、完全な同期が保証される。

---

## JSON 構造（001.json）

```json
[
  {
    "word_id": 1,
    "word": "イスタンブール",
    "start": 0.33,
    "end": 1.23,
    "moras": [
      { "slice_id": 1, "text": "い", "start": 0.33, "end": 0.45, "duration": 0.12 },
      { "slice_id": 2, "text": "s",  "start": 0.45, "end": 0.58, "duration": 0.13 },
      ...
    ]
  },
  ...
]
```

- `moras[].start` / `end` : 元音声内での秒位置
- `moras[].duration` : スライスの長さ（秒）

---

## 仕組み

```
AudioContext（ハードウェア時計）
  │
  ├── [beat 0]  クリック音     @  t0 + 0 * beatSec
  │   [beat 0]  モーラ[0]     @  t0 + 0 * beatSec
  │
  ├── [beat 1]  クリック音     @  t0 + 1 * beatSec
  │   [beat 1]  モーラ[1]     @  t0 + 1 * beatSec
  │
  ├── [beat 2]  クリック音     @  t0 + 2 * beatSec
  │   [beat 2]  モーラ[2]     @  t0 + 2 * beatSec
  │
  ...
```

- `beatSec = 60 / BPM`
- クリックもスライスも同じ `t0 + n * beatSec` に `.start(scheduleTime)` を呼ぶだけ
- ズレは原理的に発生しない

---

## 工程

### 1. データ準備

1. `001.wav` を `fetch` → `AudioContext.decodeAudioData()` で `AudioBuffer` に変換
2. `001.json` を `fetch` → 全モーラをフラットな配列に展開

```js
const moras = json.flatMap(word => word.moras);
// [{ text:'い', start:0.33, end:0.45 }, { text:'s', start:0.45, end:0.58 }, ...]
```

### 2. モーラスライスの切り出し

`AudioBuffer` から各モーラ区間を切り出して個別の `AudioBuffer` に変換する。

```js
function sliceBuffer(fullBuffer, startSec, endSec) {
  const sampleRate = fullBuffer.sampleRate;
  const startFrame = Math.round(startSec * sampleRate);
  const endFrame   = Math.round(endSec   * sampleRate);
  const frames     = endFrame - startFrame;
  const sliced     = audioCtx.createBuffer(fullBuffer.numberOfChannels, frames, sampleRate);
  for (let ch = 0; ch < fullBuffer.numberOfChannels; ch++) {
    sliced.getChannelData(ch).set(fullBuffer.getChannelData(ch).subarray(startFrame, endFrame));
  }
  return sliced;
}
```

### 3. クリック音の生成

短い正弦波バースト（約 10ms）を `AudioBuffer` としてプログラム的に生成する。  
外部ファイル不要。

```js
function createClickBuffer(audioCtx) {
  const frames = Math.round(audioCtx.sampleRate * 0.01); // 10ms
  const buf = audioCtx.createBuffer(1, frames, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = Math.sin(2 * Math.PI * 1000 * i / audioCtx.sampleRate)
              * Math.exp(-i / (frames * 0.3));
  }
  return buf;
}
```

### 4. スケジューリング

```js
const beatSec = 60 / bpm;
const t0 = audioCtx.currentTime + 0.1; // 少し未来から開始

moras.forEach((mora, n) => {
  const scheduleTime = t0 + n * beatSec;

  // クリック
  const click = audioCtx.createBufferSource();
  click.buffer = clickBuffer;
  click.connect(audioCtx.destination);
  click.start(scheduleTime);

  // モーラスライス
  const slice = audioCtx.createBufferSource();
  slice.buffer = slicedBuffers[n];
  slice.connect(audioCtx.destination);
  slice.start(scheduleTime);
});
```

すべて同じ `scheduleTime` に登録するため、**ハードウェアレベルで完全同期**する。

---

## ファイル構成（実装予定）

```
testsrc/audio_point_test/
  index.html    ← 最小UI（再生/停止、BPM入力）
  test.js       ← 上記ロジックの実装
```

---

## 補足：モーラ数とビート数の関係

- モーラ数 > BPM 分解能の場合：1ビートに複数モーラを詰める必要が生じうる  
  → まず「1モーラ = 1ビート」のシンプル実装で動作確認する
- モーラが終わったあと: ループするか停止するか選べるようにする
