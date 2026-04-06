electronを使用しています。
testsrc/abletonlive_bpm_sync_test 内でのテスト

まずはCodeは書かなくて良いです。

web audio apiで、メトロノームの音を出します

起動中のableton live 12があります。
これのマスターテンポを変更した場合に、
こちらのアプリの音もリアルタイムで変更され、
メトロノームのbpmも変更される必要があります。

この時、ableton live で再生されている音と、完全に音のタイミングが同期している必要があります。

これは実装できるか検討してください。

----

検討結果
実装可能です。 推奨アプローチは Ableton Link を使う方法です。

なぜ Ableton Link か
Ableton Live 12 はネイティブで Link をサポートしています。Link はテンポ・ビート・フェーズを複数アプリ間でリアルタイム同期するために設計されたプロトコルで、「音のタイミングが完全に合う」という要件にピッタリです。

Node.js から使えるバインディング（abletonlink npm パッケージなど）があり、Electron から利用できます。

実装の概要

[Ableton Live] --Link protocol-- [Electron main process]
                                       |
                              abletonlink native addon
                              ↓ BPM + beat phase
                         [Renderer process]
                              ↓
                      Web Audio API でクリック音をスケジュール
Main process — abletonlink でLinkセッションに参加し、現在のBPMとビートフェーズを取得
IPC — Renderer にテンポ・フェーズ情報を送る
Renderer — AudioContext.currentTime とLinkのビートフェーズを対応付け、次のビートをWeb Audio APIでscheduleAtTimeでスケジュール
技術的なポイント
課題	対策
AudioContext clock と Link clock のズレ	起動時に一度オフセットを計測して補正
ネイティブアドオンのElectron対応	electron-rebuild でリビルド必要
フェーズ情報の遅延	ポーリング間隔を短く（〜10ms）してルックアヘッドスケジューリング
代替案（簡易）
MIDI Clockを使う方法もあります。AbletonからMIDIクロック（24ppqn）を仮想MIDIポートに送り、midi npmパッケージで受信してBPMを計算します。ただしフェーズ精度がLinkより劣ります。

結論：Ableton Link を使えば、BPM変更のリアルタイム追従と音タイミングの完全同期は実装できます。 コードを書き始める際はお知らせください。