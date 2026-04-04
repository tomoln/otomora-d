const audioEngine = require('./AudioEngine');

class FadeManager {
  // ── ノード生成 ────────────────────────────────────────────

  /**
   * masterGain に接続済みの GainNode を生成して返す。
   * GridPlayer は各スライスの BufferSourceNode をこのノード経由で出力する。
   *
   *   src → gainNode → masterGain → destination
   *
   * @returns {GainNode}
   */
  createFadeNode() {
    const gain = audioEngine.context.createGain();
    gain.gain.value = 1.0;
    gain.connect(audioEngine.masterGain);
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
