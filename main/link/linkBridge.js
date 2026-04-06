const AbletonLink = require('abletonlink');
const { ipcMain } = require('electron');

let link = null;

/**
 * Ableton Link を起動し、BPM / ビート位置を 10ms ごとに renderer へ送信する。
 * main.js の BrowserWindow 生成後に呼ぶこと。
 * @param {Electron.BrowserWindow} win
 */
function start(win) {
  link = new AbletonLink(120, 4, true);
  link.enable();

  // 10ms ごとにビート位置を送信
  link.startUpdate(10, (beat, phase, bpm, isPlaying) => {
    if (win.isDestroyed()) return;
    win.webContents.send('link-beat', { beat, phase, bpm, isPlaying });
  });

  // renderer からの操作
  ipcMain.handle('link-set-bpm', (_, bpm) => { if (link) link.bpm = bpm; });
  ipcMain.handle('link-play',    ()       => { if (link) link.play(); });
  ipcMain.handle('link-stop',    ()       => { if (link) link.stop(); });
}

/**
 * Link を停止してリソースを解放する。
 * ウィンドウを閉じるときに呼ぶこと。
 */
function stop() {
  if (!link) return;
  link.stopUpdate();
  link.disable();
  link = null;

  ipcMain.removeHandler('link-set-bpm');
  ipcMain.removeHandler('link-play');
  ipcMain.removeHandler('link-stop');
}

module.exports = { start, stop };
