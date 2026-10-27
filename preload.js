const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  chooseDirectory: () => ipcRenderer.invoke('choose-directory'),
  runSync: (options) => ipcRenderer.invoke('run-sync', options),
  onLog: (callback) => {
    ipcRenderer.on('log', (_event, data) => callback(data));
  },
});
