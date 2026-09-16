const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('wonderfulWindow', {
  minimize: () => ipcRenderer.send('wonderful:window-control', 'minimize'),
  maximize: () => ipcRenderer.send('wonderful:window-control', 'maximize'),
  close: () => ipcRenderer.send('wonderful:window-control', 'close'),
  beginDrag: (x, y) => ipcRenderer.send('wonderful:window-drag-start', { x, y }),
  moveDrag: (x, y) => ipcRenderer.send('wonderful:window-drag-move', { x, y }),
  endDrag: () => ipcRenderer.send('wonderful:window-drag-end'),
  pickDirectory: () => ipcRenderer.invoke('wonderful:pick-directory'),
  openDataFile: (name, dataUrl) => ipcRenderer.invoke('wonderful:open-data-file', { name, dataUrl }),
  openPath: (target) => ipcRenderer.invoke('wonderful:open-path', target),
  openExternal: (target) => ipcRenderer.invoke('wonderful:open-external', target),
  savePath: (source, name) => ipcRenderer.invoke('wonderful:save-path', { source, name }),
  saveDataFile: (name, dataUrl) => ipcRenderer.invoke('wonderful:save-data-file', { name, dataUrl }),
  filePath: (file) => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
});
