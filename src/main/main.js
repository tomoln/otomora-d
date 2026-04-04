const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

let linkInstance = null;

ipcMain.handle('link:start', (event, { bpm, quantum } = {}) => {
  try {
    const AbletonLink = require('abletonlink');
    linkInstance = new AbletonLink(bpm || 120);
    linkInstance.isEnabled = true;
    linkInstance.quantum = quantum || 4;
    linkInstance.startUpdate(10, (beat, phase, currentBpm) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('link:update', { beat, phase, bpm: currentBpm });
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('link:stop', () => {
  if (linkInstance) {
    try {
      linkInstance.stopUpdate();
      linkInstance.isEnabled = false;
    } catch (_) {}
    linkInstance = null;
  }
  return { ok: true };
});

function resolveEntryFile() {
  const pageMap = {
    timestretch:  '../../testsrc/timestretch_test/index.html',
    audio_point:  '../../testsrc/audiosync_test/index.html',
    pitchdrop:    '../../testsrc/pitchdrop_test/index.html',
    granular:     '../../testsrc/granular_test/index.html',
    bpm_sync:     '../../testsrc/abletonlive_bpm_sync_test/index.html',
    midi_send:    '../../testsrc/midi_send_test/index.html'
  };

  return pageMap[process.env.OTOMORA_TEST] || pageMap.granular;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 500,
    height: 260,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, resolveEntryFile()));
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'midi' || permission === 'midiSysex') {
      callback(true);
    } else {
      callback(true);
    }
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
