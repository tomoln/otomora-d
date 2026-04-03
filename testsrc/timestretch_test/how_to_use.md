起動手順です：


cd c:\Users\k.uehara\Documents\workspace\otomora-d
npm install
npm run test:timestretch
作成したファイル構成：


package.json                          ← electron + soundtouch-audio-api
src/main/main.js                      ← Electron メインプロセス
testsrc/timestretch_test/
  index.html                          ← 最小UIのテストページ
  test.js                             ← SoundTouch 実装
操作方法：

▶ 再生 ボタンで 001.wav がループ再生される
テンポ倍率スライダー を動かすと、再生中にリアルタイムでピッチを維持したままテンポが変わる（x0.5〜x3）
BPM変換入力 に元BPM / 目標BPMを入力して「適用」でも変更可能