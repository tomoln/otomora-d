class AppStore {
  constructor() {
    this._state = {
      bpm: 120,
      isPlaying: false,
      x2: false,
      selectedFile: null,
      effectStates: {
        pitchDrop:       { enabled: false, params: {} },
        granularFreeze:  { enabled: false, params: {} },
        stutter:         { enabled: false, params: { division: 16 } },
        scratch:         { enabled: false, params: {} },
        sequencerGate:   { enabled: false, params: { division: 16 } },
      },
      midiMappings: {},
    };

    this._listeners = {};
  }

  // ── getter ──────────────────────────────────────────────

  get bpm()          { return this._state.bpm; }
  get isPlaying()    { return this._state.isPlaying; }
  get x2()           { return this._state.x2; }
  get selectedFile() { return this._state.selectedFile; }
  get effectStates() { return this._state.effectStates; }
  get midiMappings() { return this._state.midiMappings; }

  // ── setter ──────────────────────────────────────────────

  setBpm(value) {
    const clamped = Math.min(200, Math.max(60, value));
    this._set('bpm', clamped);
  }

  setIsPlaying(value) {
    this._set('isPlaying', Boolean(value));
  }

  setX2(value) {
    this._set('x2', Boolean(value));
  }

  setSelectedFile(filename) {
    this._set('selectedFile', filename);
  }

  setEffectEnabled(effectName, enabled) {
    if (!(effectName in this._state.effectStates)) return;
    const next = {
      ...this._state.effectStates,
      [effectName]: { ...this._state.effectStates[effectName], enabled: Boolean(enabled) },
    };
    this._set('effectStates', next);
  }

  setEffectParam(effectName, paramKey, value) {
    if (!(effectName in this._state.effectStates)) return;
    const next = {
      ...this._state.effectStates,
      [effectName]: {
        ...this._state.effectStates[effectName],
        params: { ...this._state.effectStates[effectName].params, [paramKey]: value },
      },
    };
    this._set('effectStates', next);
  }

  setMidiMapping(controlId, action) {
    const next = { ...this._state.midiMappings, [controlId]: action };
    this._set('midiMappings', next);
  }

  removeMidiMapping(controlId) {
    const next = { ...this._state.midiMappings };
    delete next[controlId];
    this._set('midiMappings', next);
  }

  // ── event ───────────────────────────────────────────────

  on(event, listener) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
  }

  off(event, listener) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(l => l !== listener);
  }

  // ── internal ─────────────────────────────────────────────

  _set(key, value) {
    const prev = this._state[key];
    this._state[key] = value;
    this._emit(key, value, prev);
    this._emit('change', { key, value, prev });
  }

  _emit(event, ...args) {
    if (!this._listeners[event]) return;
    for (const listener of this._listeners[event]) {
      listener(...args);
    }
  }
}

module.exports = new AppStore();
