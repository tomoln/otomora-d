const audioEngine    = require('../audio/AudioEngine');
const pitchDrop      = require('./PitchDrop');
const granularFreeze = require('./GranularFreeze');
const stutter        = require('./Stutter');
const scratch        = require('./Scratch');
const sequencerGate  = require('./SequencerGate');

// ────────────────────────────────────────────────────────────────────────────
// EffectChain
//
// エフェクトノードを AudioGraph に直列に挿入して管理するクラス。
//
// 信号経路:
//   inputNode → pitchDrop → granularFreeze → stutter → scratch
//             → sequencerGate → audioEngine.masterGain
//
// 各エフェクトは非アクティブ時にパススルーするため、
// 全ノードを常時接続したまま個別に enable/disable できる。
// ────────────────────────────────────────────────────────────────────────────

class EffectChain {
  constructor() {
    this._inputNode    = null;
    this._initPromise  = null;
    this._bpm          = 120;
  }

  // ── 初期化 ──────────────────────────────────────────────────────────────

  /**
   * 全エフェクトの AudioWorklet を登録し、ノードを直列接続する。
   * AudioEngine.init() 完了後に呼ぶこと（await 必須）。
   */
  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      // 全エフェクトを並列初期化
      await Promise.all([
        pitchDrop.init(),
        granularFreeze.init(),
        stutter.init(),
        scratch.init(),
        sequencerGate.init(),
      ]);

      // 入力用 GainNode（外部からの接続先）
      this._inputNode = audioEngine.context.createGain();
      this._inputNode.gain.value = 1.0;

      // 直列接続: inputNode → 各エフェクト → masterGain
      const chain = [
        pitchDrop.node,
        granularFreeze.node,
        stutter.node,
        scratch.node,
        sequencerGate.node,
      ];

      this._inputNode.connect(chain[0]);
      for (let i = 0; i < chain.length - 1; i++) {
        chain[i].connect(chain[i + 1]);
      }
      chain[chain.length - 1].connect(audioEngine.masterGain);
    })();
    return this._initPromise;
  }

  // ── AudioGraph 接続用ノード ─────────────────────────────────────────────

  /**
   * 音源をここに接続する（audioEngine.masterGain の代わりに使う）。
   * init() 完了後に参照すること。
   * @returns {GainNode}
   */
  get inputNode() { return this._inputNode; }

  // ── BPM 同期 ────────────────────────────────────────────────────────────

  /**
   * 現在の BPM を Stutter / SequencerGate に伝播させる。
   * BpmSync からビートを受信するたびに呼ぶこと。
   * @param {number} bpm
   */
  set bpm(bpm) {
    this._bpm          = bpm;
    stutter.bpm        = bpm;
    sequencerGate.bpm  = bpm;
  }
  get bpm() { return this._bpm; }

  // ── 各エフェクトへの委譲プロパティ ─────────────────────────────────────

  // PitchDrop
  get pitchDrop()  { return pitchDrop; }

  // GranularFreeze
  get granularFreeze() { return granularFreeze; }

  // Stutter
  get stutter()    { return stutter; }

  // Scratch
  get scratch()    { return scratch; }

  // SequencerGate
  get sequencerGate() { return sequencerGate; }
}

module.exports = new EffectChain();
