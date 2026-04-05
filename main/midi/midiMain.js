'use strict';

// midi (npm パッケージ名は "midi") は Native Addon のため、electron-rebuild が必要。
// npm install midi && npx electron-rebuild -w midi を実行すること。
const midi = require('midi');

let inputs = [];  // 開いているポートの midi.Input インスタンス群

// ── メッセージのパース ────────────────────────────────────────────────────

/**
 * MIDI ステータスバイトと data バイトを人間が扱いやすい形に変換する。
 * @param {number[]} message  node-midi から届く [status, data1, data2]
 * @returns {{ type: string, channel: number, number: number, value: number, raw: number[] }}
 */
function parseMessage(message) {
  const [status, data1 = 0, data2 = 0] = message;
  const nibble  = (status >> 4) & 0x0f;
  const channel = status & 0x0f;

  let type;
  switch (nibble) {
    case 0x8: type = 'note_off';        break;
    case 0x9: type = data2 > 0 ? 'note_on' : 'note_off'; break;
    case 0xa: type = 'aftertouch';      break;
    case 0xb: type = 'cc';              break;
    case 0xc: type = 'program_change';  break;
    case 0xd: type = 'channel_pressure'; break;
    case 0xe: type = 'pitch_bend';      break;
    default:  type = 'sysex';           break;
  }

  return { type, channel, number: data1, value: data2, raw: message };
}

// ── ポート管理 ────────────────────────────────────────────────────────────

/**
 * 全 MIDI 入力ポートを開いてリスナーを登録する。
 * @param {Electron.BrowserWindow} win
 */
function openAllPorts(win) {
  const probe     = new midi.Input();
  const portCount = probe.getPortCount();
  const portNames = [];

  for (let i = 0; i < portCount; i++) {
    portNames.push(probe.getPortName(i));

    const input = new midi.Input();
    input.ignoreTypes(false, false, false); // sysex, timing, active-sensing を受信
    input.openPort(i);
    input.on('message', (_deltaTime, message) => {
      if (!win.isDestroyed()) {
        win.webContents.send('midi-message', parseMessage(message));
      }
    });
    inputs.push(input);
  }

  probe.closePort();

  // デバイス一覧を renderer へ通知
  if (!win.isDestroyed()) {
    win.webContents.send('midi-devices', portNames);
  }
}

/**
 * 全ポートを閉じてリソースを解放する。
 */
function closeAllPorts() {
  for (const input of inputs) {
    try { input.closePort(); } catch (_) {}
  }
  inputs = [];
}

// ── 公開 API ─────────────────────────────────────────────────────────────

/**
 * MIDI 監視を開始する。
 * main.js の BrowserWindow 生成後に呼ぶこと。
 * @param {Electron.BrowserWindow} win
 */
function start(win) {
  openAllPorts(win);
}

/**
 * MIDI 監視を停止してリソースを解放する。
 * ウィンドウを閉じるときに呼ぶこと。
 */
function stop() {
  closeAllPorts();
}

module.exports = { start, stop };
