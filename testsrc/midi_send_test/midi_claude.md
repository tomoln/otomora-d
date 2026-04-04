electronを使用しています。
testsrc/midi_send_test 内でのテスト

まずはCodeは書かなくて良いです。

UIは最小で良いです。
ボタンを4つ用意してください。

接続されているmidiコントローラーを認識し、

そのUIボタンに、midiコントローラーの好きなボタンを割り当てられるアプリを作りたいです。

こちら作れるか検討してください。


-----


検討結果
実装可能です。

使用技術
Electron の Renderer で Web MIDI API (navigator.requestMIDIAccess()) を使います。追加パッケージ不要で、Electron の Chromium がネイティブサポートしています。

動作フロー

[MIDIコントローラー]
        ↓ MIDIメッセージ (Note On / CC)
[Web MIDI API - onmidimessage]
        ↓
  "学習モード" 中なら → 対象UIボタンにマッピング登録
  通常時なら       → 登録済みボタンを発火
マッピング割り当て手順（MIDI Learn）:

UIボタンの「割り当て」をクリック → 学習モードへ
MIDIコントローラーの好きなボタンを押す
そのMIDIメッセージ（チャンネル・種類・番号）をUIボタンに登録
以降、そのMIDIボタンを押すとUIボタンが発火
対応するMIDIメッセージ
種類	説明
Note On (0x9n)	鍵盤・パッドボタン
Control Change (0xBn)	ノブ・フェーダー（値 > 0 で押下判定）
Program Change (0xCn)	プログラムチェンジボタン
注意点
Electron 29 は Web MIDI API に権限リクエストが必要な場合があります。session.setPermissionRequestHandler で midi / midiSysex を許可する処理を main.js に追加します。
コントローラーが認識されない場合は midi npm パッケージ（native addon）に切り替えることもできます。
コードを書き始める場合はお知らせください。