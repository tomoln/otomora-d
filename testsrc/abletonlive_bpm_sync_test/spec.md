# 仕様: Ableton Link BPM Sync テスト

## 概要

起動中の Ableton Live 12 のマスターテンポと、Web Audio API メトロノームをリアルタイムで同期するテスト。
Ableton Link を使うことで、BPM変更とビートのタイミングを完全に合わせる。

## 実行

```bash
npm run test:bpm_sync
```

## Ableton側の設定

Ableton Live の設定 → **Link/Tempo/MIDI** タブ → **Link** を ON にする。

## 依存パッケージ

| パッケージ | 役割 |
|-----------|------|
| `abletonlink` | Ableton Link C++ SDK の Node.js ネイティブバインディング |
| `electron-rebuild` | Electron 向けにネイティブアドオンをリビルド |

初回セットアップ時は以下が必要:
```bash
npm install
npm run rebuild
```

## アーキテクチャ

```
[Ableton Live] --Link protocol-- [main process]
                                      |
                               abletonlink (native addon)
                               startUpdate(10ms, callback)
                                      | IPC (ipcMain → ipcRenderer)
                               [renderer process]
                                      |
                            Web Audio API スケジューラー
```

- **Main プロセス**: `abletonlink` でLinkセッションに参加し、10ms間隔で `{beat, phase, bpm}` をIPCで送信
- **Renderer プロセス**: 受信データを元にメトロノームのタイミングを補正し、Web Audio API でクリック音をスケジュール

## UI構成

- **開始 / 停止ボタン**: Linkセッションへの参加・離脱
- **BPM表示**: Linkから受信中のテンポを小数点1桁で表示（例: `128.0 BPM`）
- **ビートドット × 4**: 現在のビート位置をリアルタイム表示
  - 1拍目（ダウンビート）: 橙色
  - 2〜4拍目: 青色
- **フェーズバー**: バー内の現在位置を横棒で表示（0〜4拍 = 0〜100%）
- **ステータス表示**: 接続状態・同期状態を文字で表示

## メトロノームのスケジューリング

Chris Wilson方式のルックアヘッドスケジューラーを採用:

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `LOOK_AHEAD` | 0.1秒 | 先読みしてスケジュールする時間幅 |
| `SCHEDULE_INTERVAL` | 25ms | スケジューラーの実行間隔 |
| `QUANTUM` | 4拍 | 1バーのビート数 |

クリック音: 発振器（Oscillator）+ ゲイン（Gain）で生成
- ダウンビート: 1000 Hz
- 通常ビート: 800 Hz
- 発音時間: 60ms（2msで立ち上がり → 指数減衰）

## Link同期ロジック

1. **初回キャリブレーション**: 最初のLink更新受信時に `nextBeatTime` をLinkのビートグリッドに合わせて初期化
2. **ドリフト補正**: 以降の更新ごとに、Linkが示す次ビート時刻と内部 `nextBeatTime` の差を計算し、25ms以上ずれた場合は差分の50%を補正（急激な跳びを防ぐハーフステップ補正）
3. **BPM変更追従**: `currentBpm` をリアルタイムで更新し、次回スケジュール時に自動反映

## IPC チャンネル

| チャンネル | 方向 | データ | 説明 |
|-----------|------|--------|------|
| `link:start` | renderer → main | `{ bpm, quantum }` | Linkセッション開始 |
| `link:stop` | renderer → main | — | Linkセッション停止 |
| `link:update` | main → renderer | `{ beat, phase, bpm }` | 10ms間隔のLink状態通知 |

## beat / phase の意味

- `beat`: セッション開始からの累積ビート数（float、単調増加）
- `phase`: バー内の位置（0.0 〜 quantum、例: quantum=4 なら 0.0〜4.0）
- `beat % 1`: 現在ビート内の位置（0.0〜1.0）
- `(1 - beat % 1) * (60/bpm)`: 次のビートまでの秒数
