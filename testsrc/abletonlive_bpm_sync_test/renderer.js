'use strict';

const { ipcRenderer } = require('electron');

// --- UI elements ---
const btnStart   = document.getElementById('btn-start');
const btnStop    = document.getElementById('btn-stop');
const bpmDisplay = document.getElementById('bpm-display');
const statusEl   = document.getElementById('status');
const peersEl    = document.getElementById('peers');
const phaseBar   = document.getElementById('phase-bar');
const dots       = [0, 1, 2, 3].map(i => document.getElementById(`dot-${i}`));

// --- Audio state ---
let audioCtx     = null;
let isRunning    = false;
let schedulerTimer = null;

// --- Metronome scheduler state ---
const LOOK_AHEAD       = 0.1;  // seconds: how far ahead to schedule
const SCHEDULE_INTERVAL = 25;  // ms: how often to run the scheduler
const QUANTUM          = 4;    // beats per bar

let nextBeatTime  = 0;         // AudioContext time of the next scheduled beat
let currentBpm    = 120;
let scheduledBeatCount = 0;    // total beats scheduled (for beat-dot sync)

// --- Link sync state ---
let linkCalibrated = false;
// Offset: audioCtx.currentTime = linkReceiveAudioTime, link beat = linkReceiveBeat
// timeToNextBeat at that moment: used for calibration
const DRIFT_THRESHOLD = 0.025; // 25ms: only correct if drift exceeds this

// --- Lookahead scheduler ---
function schedule() {
  if (!isRunning) return;

  const secondsPerBeat = 60 / currentBpm;

  while (nextBeatTime < audioCtx.currentTime + LOOK_AHEAD) {
    const beatIndex = scheduledBeatCount % QUANTUM;
    scheduleClick(nextBeatTime, beatIndex === 0);
    scheduledBeatCount++;
    nextBeatTime += secondsPerBeat;
  }

  schedulerTimer = setTimeout(schedule, SCHEDULE_INTERVAL);
}

// --- Click sound generator ---
function scheduleClick(time, isDownbeat) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.frequency.value = isDownbeat ? 1000 : 800;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.7, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

  osc.start(time);
  osc.stop(time + 0.06);

  // Schedule UI beat flash slightly before the click for visual feedback
  const flashDelay = (time - audioCtx.currentTime) * 1000;
  const beatIndex  = (scheduledBeatCount) % QUANTUM;
  setTimeout(() => flashDot(beatIndex, isDownbeat), Math.max(0, flashDelay));
}

// --- Link IPC update handler ---
ipcRenderer.on('link:update', (event, { beat, phase, bpm }) => {
  currentBpm = bpm;

  // Update BPM display
  bpmDisplay.textContent = `${bpm.toFixed(1)} BPM`;

  // Update phase progress bar (phase: 0..QUANTUM)
  const phaseFraction = (phase % 1); // position within current beat (0..1)
  const barFraction   = phase / QUANTUM; // position within bar (0..1)
  phaseBar.style.width = `${barFraction * 100}%`;

  if (!isRunning || !audioCtx) return;

  // Phase-based correction of nextBeatTime
  // beat is ever-increasing float; beat%1 gives fraction within current beat
  const beatFraction    = beat % 1;
  const secondsPerBeat  = 60 / bpm;
  // Time (from now) until the next beat according to Link
  const timeToNextBeat  = (1 - beatFraction) * secondsPerBeat;
  const linkNextBeat    = audioCtx.currentTime + timeToNextBeat;

  if (!linkCalibrated) {
    // First update: initialize scheduler to Link's beat grid
    nextBeatTime = linkNextBeat;
    // Align scheduledBeatCount to the bar phase so beat dots are correct
    scheduledBeatCount = Math.round(phase) % QUANTUM;
    linkCalibrated = true;
    statusEl.textContent = 'Link同期完了 — メトロノーム動作中';
    return;
  }

  // Ongoing drift correction
  // Find the nearest upcoming beat on Link's grid relative to nextBeatTime
  const diff = linkNextBeat - nextBeatTime;
  // Wrap diff to [-0.5*spb, +0.5*spb] to find minimum distance to a beat
  const wrappedDiff = diff - Math.round(diff / secondsPerBeat) * secondsPerBeat;

  if (Math.abs(wrappedDiff) > DRIFT_THRESHOLD) {
    nextBeatTime += wrappedDiff * 0.5; // smooth correction (half-step)
  }
});

// --- Beat dot flash ---
function flashDot(index, isDownbeat) {
  dots.forEach(d => d.className = 'beat-dot');
  if (isDownbeat) {
    dots[0].className = 'beat-dot downbeat';
  } else {
    dots[index].className = 'beat-dot active';
  }
}

// --- Start / Stop ---
async function start() {
  audioCtx = new AudioContext();

  statusEl.textContent = 'Ableton Linkに接続中...';
  const result = await ipcRenderer.invoke('link:start', { bpm: 120, quantum: QUANTUM });

  if (!result.ok) {
    statusEl.textContent = `エラー: ${result.error}`;
    audioCtx.close();
    audioCtx = null;
    return;
  }

  isRunning       = true;
  linkCalibrated  = false;
  nextBeatTime    = audioCtx.currentTime + 0.1;
  scheduledBeatCount = 0;

  btnStart.disabled = true;
  btnStop.disabled  = false;
  btnStart.classList.remove('active');

  statusEl.textContent = 'Linkセッション待機中...';
  schedule();
}

async function stop() {
  isRunning = false;
  clearTimeout(schedulerTimer);

  await ipcRenderer.invoke('link:stop');

  audioCtx.close();
  audioCtx = null;

  btnStart.disabled = false;
  btnStop.disabled  = true;
  bpmDisplay.textContent = '-- BPM';
  statusEl.textContent   = '停止';
  peersEl.textContent    = 'Linkピア: --';
  phaseBar.style.width   = '0%';
  dots.forEach(d => d.className = 'beat-dot');
}

btnStart.addEventListener('click', start);
btnStop.addEventListener('click', stop);
