const { app, BrowserWindow } = require('electron');
const path = require('path');

const pageMap = {
  timestretch:  { file: '../../testsrc/timestretch_test/index.html',   width: 500, height: 260 },
  audio_point:  { file: '../../testsrc/audiosync_test/index.html',     width: 500, height: 400 },
  pitchdrop:    { file: '../../testsrc/pitchdrop_test/index.html',     width: 500, height: 260 },
  granular:     { file: '../../testsrc/granular_test/index.html',      width: 500, height: 260 },
  granular_plus: { file: '../../testsrc/granular_plus_test/index.html', width: 500, height: 260 },
  visualizer:   { file: '../../testsrc/visualizer_test/index.html',    width: 900, height: 680 },
};

function createWindow() {
  const cfg = pageMap[process.env.OTOMORA_TEST] || pageMap.granular_plus;
  const win = new BrowserWindow({
    width: cfg.width,
    height: cfg.height,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, cfg.file));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
