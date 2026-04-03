const { app, BrowserWindow } = require('electron');
const path = require('path');

function resolveEntryFile() {
  const pageMap = {
    timestretch:  '../../testsrc/timestretch_test/index.html',
    audio_point:  '../../testsrc/audiosync_test/index.html',
    pitchdrop:    '../../testsrc/pitchdrop_test/index.html',
    granular:     '../../testsrc/granular_test/index.html'
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
