WebGL ジェネレーティブ・ビジュアライザー：ライブラリ選定
方針：依存を最小限に、ネイティブWebGLを活用
このプロジェクトは Electron 上で完結し、データ構造もシンプルなため、重いフレームワークは不要です。

推奨構成
用途	採用	理由
WebGL レンダリング	生 WebGL2（ライブラリなし）	Fluid・Glitch・Text Matrix はすべてシェーダで完結。Three.js は今回は過剰
音声再生 + タイムコード	Web Audio API（ブラウザ標準）	.currentTime で JSON タイムスタンプと同期可能。追加ライブラリ不要
ノイズ関数（Fluid 用）	glsl-noise をインライン記述	GLSL の simplex noise を関数として埋め込む（npm 不要）
フォントレンダリング（Text Matrix 用）	Canvas2D → WebGL テクスチャ	外部フォントライブラリ不要。ブラウザの Canvas で文字を描いてテクスチャに転送
追加パッケージ：ゼロ
既存の依存関係に何も追加する必要はありません。理由：

WebGL2 は Electron 29 (Chromium 122) で完全サポート済み
Web Audio API も同様にサポート済み
JSON 読み込みは Node.js の fs（すでに利用中）
.wav ファイルは AudioContext.decodeAudioData() で直接デコード可能
各アート方向性の実装方針
アート方向性	技術
Analogous / Complementary	f0 → HSL 色相マッピング（シェーダ内）
Fluid	Fragment shader + Simplex noise（時間・RMS でスケール）
Glitch	ZCR が閾値超えたらテクスチャを UV オフセット / 色チャンネルシフト
Text Matrix	Canvas2D でモーラ文字を描画 → WebGL テクスチャ → タイムスタンプでトリガー
まとめ
npm install は不要です。 Electron + WebGL2 + Web Audio API の組み合わせで、すべての要件をカバーできます。コードを書き始められます。