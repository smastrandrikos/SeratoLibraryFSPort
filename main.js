const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { MediaLibrary } = require('./src/mediaLibrary');
const { ItchLibrary } = require('./src/itchLibrary');
const { execFileSync } = require('child_process');

function isSeratoRunning() {
  try {
    if (process.platform === 'darwin') {
      execFileSync('pgrep', ['-x', 'Serato DJ Pro']); // exits non-zero when not found
      return true;
    }
    if (process.platform === 'win32') {
      const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq Serato DJ Pro.exe', '/NH']).toString();
      return out.includes('Serato DJ Pro.exe');
    }
  } catch {
    // not running
  }
  return false;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 760,
    height: 860,
    minWidth: 600,
    minHeight: 760,
    useContentSize: true, // sizes exclude the title bar, so the layout fits exactly
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Serato Library Sync',
    backgroundColor: '#12121f',
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC: open a native folder picker ─────────────────────────────────────────
ipcMain.handle('choose-directory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ── IPC: run the sync ────────────────────────────────────────────────────────
ipcMain.handle('run-sync', async (event, { musicPath, seratoPath, clearBeforeSync, includeParentCrate }) => {
  const log = (type, message) => event.sender.send('log', { type, message });

  try {
    // Validate music library path
    if (!fs.existsSync(musicPath) || !fs.statSync(musicPath).isDirectory()) {
      log('error', `Music library path does not exist: ${musicPath}`);
      return { success: false };
    }

    // Validate Serato library path
    if (!fs.existsSync(seratoPath) || !fs.statSync(seratoPath).isDirectory()) {
      log('error', `Serato library path does not exist: ${seratoPath}`);
      return { success: false };
    }

    // Serato DJ 4+/5 exports its own library back into _Serato_ while running,
    // which would overwrite the crates written here
    if (isSeratoRunning()) {
      log('error', 'Serato DJ is running. Quit Serato before syncing, then start it again afterwards.');
      return { success: false };
    }

    log('info', `Scanning media library: ${musicPath}`);
    const fsLibrary = MediaLibrary.readFrom(musicPath);

    if (fsLibrary.getTotalNumberOfTracks() <= 0) {
      log('error', 'No supported media files found in the music library path.');
      log('error', 'Supported formats: mp3 wav ogg aif aiff flac aac alac mov mp4 m4a avi flv mpg mpeg dv qtz');
      return { success: false };
    }

    log('info', `Found ${fsLibrary.getTotalNumberOfTracks()} tracks in ${fsLibrary.getTotalNumberOfDirectories()} directories`);
    log('info', `Writing crates to: ${seratoPath}`);

    const parentCrateName = includeParentCrate ? path.basename(musicPath) : null;
    if (parentCrateName) log('info', `Using "${parentCrateName}" as the parent crate`);

    const itchLibrary = ItchLibrary.createFrom(fsLibrary, parentCrateName);
    const { addedTracks, untaggedTracks } = await itchLibrary.writeTo(seratoPath, clearBeforeSync);

    log('info', `Done — wrote ${itchLibrary.getTotalNumberOfCrates()} crates and ${itchLibrary.getTotalNumberOfSubCrates()} subcrates`);
    if (addedTracks > 0) {
      log('info', `Added ${addedTracks} new tracks to database V2 — Serato DJ 4+/5 will import the crates on next launch`);
      if (untaggedTracks > 0) {
        log('warning', `${untaggedTracks} tracks have no readable title tag and will show their filename in Serato`);
      }
    } else {
      log('warning', 'No new tracks to add to database V2 — Serato DJ 4+/5 may not notice crate changes until new tracks are synced');
    }
    log('success', 'Sync completed successfully. Enjoy your set!');

    return { success: true };
  } catch (err) {
    log('error', `Unexpected error: ${err.message}`);
    if (err.stack) log('error', err.stack);
    return { success: false };
  }
});
