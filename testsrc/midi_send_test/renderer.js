'use strict';

const NUM_BUTTONS = 4;

// --- State ---
// mappings[i] = { type, channel, number } | null
const mappings = Array(NUM_BUTTONS).fill(null);
let learningIndex = null; // which button is in MIDI learn mode

// --- UI refs ---
const devicesEl = document.getElementById('devices');
const statusEl  = document.getElementById('status');

const slots      = Array.from({ length: NUM_BUTTONS }, (_, i) => document.getElementById(`slot-${i}`));
const uiBtns     = Array.from({ length: NUM_BUTTONS }, (_, i) => document.getElementById(`ui-btn-${i}`));
const assignBtns = Array.from({ length: NUM_BUTTONS }, (_, i) => document.getElementById(`assign-${i}`));
const clearBtns  = Array.from({ length: NUM_BUTTONS }, (_, i) => document.getElementById(`clear-${i}`));
const labels     = Array.from({ length: NUM_BUTTONS }, (_, i) => document.getElementById(`label-${i}`));

// --- MIDI message key: unique string for a given MIDI event ---
function msgKey(type, channel, number) {
  return `${type}:${channel}:${number}`;
}

// --- Build a human-readable label ---
function msgLabel(type, channel, number) {
  const ch = channel + 1;
  if (type === 'note')    return `Note ${number} (ch${ch})`;
  if (type === 'cc')      return `CC ${number} (ch${ch})`;
  if (type === 'program') return `Program ${number} (ch${ch})`;
  return `${type} ${number} (ch${ch})`;
}

// --- Update label display ---
function refreshLabel(i) {
  const m = mappings[i];
  if (m) {
    labels[i].textContent  = msgLabel(m.type, m.channel, m.number);
    labels[i].className    = 'mapping-label assigned';
  } else {
    labels[i].textContent  = '未割り当て';
    labels[i].className    = 'mapping-label';
  }
}

// --- Enter / exit MIDI learn mode ---
function enterLearn(i) {
  if (learningIndex !== null) exitLearn(learningIndex);
  learningIndex = i;
  slots[i].classList.add('learning');
  assignBtns[i].classList.add('active');
  assignBtns[i].textContent = 'MIDIを押して...';
  statusEl.textContent = `Button ${i + 1}: MIDIコントローラーのボタンを押してください`;
}

function exitLearn(i) {
  slots[i].classList.remove('learning');
  assignBtns[i].classList.remove('active');
  assignBtns[i].textContent = '割り当て';
  learningIndex = null;
  statusEl.textContent = '';
}

// --- Fire a UI button (visual feedback) ---
function fireButton(i) {
  uiBtns[i].classList.add('fired');
  slots[i].classList.add('fired');
  setTimeout(() => {
    uiBtns[i].classList.remove('fired');
    slots[i].classList.remove('fired');
  }, 120);
  statusEl.textContent = `Button ${i + 1} 発火`;
}

// --- Handle incoming MIDI message ---
function onMidiMessage(event) {
  const [status, data1, data2] = event.data;
  const type    = status >> 4;
  const channel = status & 0x0f;

  let msgType, number;

  if (type === 0x9 && data2 > 0) {        // Note On (velocity > 0)
    msgType = 'note'; number = data1;
  } else if (type === 0xb) {               // Control Change
    if (data2 === 0) return;               // ignore CC=0 (release for some controllers)
    msgType = 'cc'; number = data1;
  } else if (type === 0xc) {               // Program Change
    msgType = 'program'; number = data1;
  } else {
    return; // ignore other messages
  }

  // MIDI learn mode: assign to current learning button
  if (learningIndex !== null) {
    const i = learningIndex;
    mappings[i] = { type: msgType, channel, number };
    refreshLabel(i);
    exitLearn(i);
    fireButton(i);
    return;
  }

  // Normal mode: find matching mapping and fire
  const key = msgKey(msgType, channel, number);
  for (let i = 0; i < NUM_BUTTONS; i++) {
    const m = mappings[i];
    if (m && msgKey(m.type, m.channel, m.number) === key) {
      fireButton(i);
    }
  }
}

// --- Connect all MIDI inputs ---
function connectInputs(midiAccess) {
  midiAccess.inputs.forEach(input => {
    input.onmidimessage = onMidiMessage;
  });

  const names = [...midiAccess.inputs.values()].map(i => i.name);
  if (names.length === 0) {
    devicesEl.textContent = 'MIDIデバイスが見つかりません';
  } else {
    devicesEl.textContent = `接続: ${names.join(', ')}`;
  }
}

// --- UI button click (manual fire) ---
uiBtns.forEach((btn, i) => {
  btn.addEventListener('click', () => fireButton(i));
});

// --- Assign button click ---
assignBtns.forEach((btn, i) => {
  btn.addEventListener('click', () => {
    if (learningIndex === i) {
      exitLearn(i);
    } else {
      enterLearn(i);
    }
  });
});

// --- Clear button click ---
clearBtns.forEach((btn, i) => {
  btn.addEventListener('click', () => {
    if (learningIndex === i) exitLearn(i);
    mappings[i] = null;
    refreshLabel(i);
  });
});

// --- Cancel learn on Escape ---
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && learningIndex !== null) exitLearn(learningIndex);
});

// --- Initialize Web MIDI ---
if (navigator.requestMIDIAccess) {
  navigator.requestMIDIAccess({ sysex: false })
    .then(midiAccess => {
      connectInputs(midiAccess);
      // Re-connect when devices change (plug/unplug)
      midiAccess.onstatechange = () => connectInputs(midiAccess);
    })
    .catch(err => {
      devicesEl.textContent = `MIDI初期化エラー: ${err.message}`;
    });
} else {
  devicesEl.textContent = 'Web MIDI API が使用できません';
}
