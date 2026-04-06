'use strict';

const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs   = require('fs');

const linkBridge = require('./link/linkBridge');
const midiMain   = require('./midi/midiMain');

// ── assets IPC ────────────────────────────────────────────────────────────

const AUDIO_DIR = path.join(__dirname, '..', 'assets', 'audio');
const JSON_DIR  = path.join(__dirname, '..', 'assets', 'json');

/**
 * audio と json の両方が揃っているベース名の一覧を返す。
 * FileSelector が 'get-asset-list' で呼び出す。
 * @returns {string[]}  例: ["001", "002"]
 */
ipcMain.handle('get-asset-list', () => {
  const readNames = (dir, ext) => {
    try {
      return fs.readdirSync(dir)
        .filter(f => f.endsWith(ext) && !f.startsWith('.'))
        .map(f => f.slice(0, -ext.length));
    } catch (_) { return []; }
  };

  const audioNames = new Set(readNames(AUDIO_DIR, '.wav'));
  const jsonNames  = new Set(readNames(JSON_DIR,  '.json'));

  return [...audioNames].filter(n => jsonNames.has(n)).sort();
});

/**
 * ベース名からオーディオ・JSON の絶対パスを返す。
 * SliceManager が 'get-asset-paths' で呼び出す。
 * @param {string} name  例: "001"
 * @returns {{ audioPath: string, jsonPath: string }}
 */
ipcMain.handle('get-asset-paths', (_, name) => ({
  audioPath: path.join(AUDIO_DIR, `${name}.wav`),
  jsonPath:  path.join(JSON_DIR,  `${name}.json`),
}));

// ── ウィンドウ生成 ─────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration:  true,
      contextIsolation: false,
    },
  });

  const test = process.env.OTOMORA_TEST;
  const entryFile = test === 'visualizer'
    ? path.join(__dirname, '..', 'testsrc', 'visualizer_test', 'index.html')
    : path.join(__dirname, '..', 'renderer', 'index.html');
  win.loadFile(entryFile);

  linkBridge.start(win);
  midiMain.start(win);

  win.on('closed', () => {
    linkBridge.stop();
    midiMain.stop();
  });
}

// ── アプリライフサイクル ───────────────────────────────────────────────────

app.whenReady().then(() => {
  // MIDI 権限を許可
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'midi' || permission === 'midiSysex' ? true : false);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
