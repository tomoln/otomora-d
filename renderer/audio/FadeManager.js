const audioEngine = require('./AudioEngine');

class FadeManager {
  constructor() {
    this._destination = null; // null のときは audioEngine.masterGain にフォールバック
  }

  /**
   * 音声の出力先ノードを設定する。
   * index.js で effectChain.init() 完了後に effectChain.inputNode を渡すこと。
   * 設定しない場合は audioEngine.masterGain に直接接続される。
   * @param {AudioNode} node
   */
  set destination(node) {
    this._destination = node;
  }

  // ── ノード生成 ────────────────────────────────────────────

  /**
   * 出力先ノードに接続済みの GainNode を生成して返す。
   * GridPlayer は各スライスの BufferSourceNode をこのノード経由で出力する。
   *
   *   src → gainNode → destination(effectChain.inputNode) → ... → masterGain
   *
   * @returns {GainNode}
   */
  createFadeNode() {
    const gain = audioEngine.context.createGain();
    gain.gain.value = 1.0;
    gain.connect(this._destination ?? audioEngine.masterGain);
    return gain;
  }

  // ── フェードアウト ────────────────────────────────────────

  /**
   * startTime から duration 秒かけてゲインを 0 にランプし、
   * 完了後に disconnect してリソースを解放する。
   *
   * 使い方（GridPlayer 側）:
   *   次のビートが来たとき、前のスライスがまだ鳴っていれば
   *   fadeManager.scheduleFadeOut(prevGain, when, 0.02) を呼ぶ。
   *
   * @param {GainNode} gainNode
   * @param {number} startTime  AudioContext.currentTime 基準のフェード開始時刻
   * @param {number} duration   フェードにかける秒数（デフォルト 20ms）
   */
  scheduleFadeOut(gainNode, startTime, duration = 0.02) {
    const g = gainNode.gain;
    g.setValueAtTime(g.value, startTime);
    g.linearRampToValueAtTime(0, startTime + duration);

    // フェード完了後に disconnect してリソースを解放
    const msUntilEnd = (startTime + duration - audioEngine.context.currentTime) * 1000;
    setTimeout(() => {
      try { gainNode.disconnect(); } catch (_) {}
    }, Math.max(msUntilEnd + 30, 0)); // 30ms マージン
  }
}

module.exports = new FadeManager();
