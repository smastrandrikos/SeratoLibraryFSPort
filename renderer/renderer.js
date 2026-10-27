const musicInput  = document.getElementById('music-path');
const seratoInput = document.getElementById('serato-path');
const clearCheck  = document.getElementById('clear-before-sync');
const parentCheck = document.getElementById('include-parent-crate');
const btnSync     = document.getElementById('btn-sync');
const btnClear    = document.getElementById('btn-clear-log');
const logEl       = document.getElementById('log');
const statusBar   = document.getElementById('status-bar');

// ── Path pickers ─────────────────────────────────────────────────────────────
document.getElementById('browse-music').addEventListener('click', async () => {
  const dir = await window.api.chooseDirectory();
  if (dir) musicInput.value = dir;
});

document.getElementById('browse-serato').addEventListener('click', async () => {
  const dir = await window.api.chooseDirectory();
  if (dir) seratoInput.value = dir;
});

// ── Log helpers ───────────────────────────────────────────────────────────────
function appendLog(type, message) {
  const now = new Date();
  const ts = now.toTimeString().slice(0, 8);

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML =
    `<span class="ts">${ts}</span><span class="msg">${escapeHtml(message)}</span>`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

btnClear.addEventListener('click', () => {
  logEl.innerHTML = '';
});

// ── Receive streamed log messages from main process ───────────────────────────
window.api.onLog(({ type, message }) => {
  appendLog(type, message);
});

// ── Sync button ───────────────────────────────────────────────────────────────
btnSync.addEventListener('click', async () => {
  const musicPath  = musicInput.value.trim();
  const seratoPath = seratoInput.value.trim();

  if (!musicPath) {
    appendLog('error', 'Please set the Music Library path.');
    return;
  }
  if (!seratoPath) {
    appendLog('error', 'Please set the Serato Library path.');
    return;
  }

  // Lock UI during sync
  btnSync.disabled = true;
  setStatus('running', 'Syncing…');
  appendLog('info', '─── Starting sync ───');

  const result = await window.api.runSync({
    musicPath,
    seratoPath,
    clearBeforeSync: clearCheck.checked,
    includeParentCrate: parentCheck.checked,
  });

  btnSync.disabled = false;

  if (result.success) {
    setStatus('success', 'Sync completed successfully.');
  } else {
    setStatus('error', 'Sync finished with errors — see log above.');
  }
});

function setStatus(state, text) {
  statusBar.textContent = text;
  statusBar.className = state;
}
