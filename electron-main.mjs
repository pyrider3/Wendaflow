import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { fork } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let backend = null;
let mainWindow = null;
let windowDrag = null;

const MIME_EXTENSIONS = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
  'application/pdf': '.pdf', 'application/json': '.json', 'text/plain': '.txt',
  'text/markdown': '.md', 'application/zip': '.zip',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

function usableExtension(...values) {
  for (const value of values) {
    const extension = path.extname(path.basename(String(value || '')));
    if (/^\.[a-zA-Z0-9]{1,12}$/.test(extension)) return extension.toLowerCase();
  }
  return '';
}

function saveDialogOptions(name, extension) {
  const safeName = path.basename(String(name || 'wonderful-file')).replace(/[<>:"/\\|?*]/g, '_');
  const defaultPath = extension && !path.extname(safeName) ? `${safeName}${extension}` : safeName;
  return {
    defaultPath,
    filters: extension
      ? [{ name: `${extension.slice(1).toUpperCase()} 文件`, extensions: [extension.slice(1)] }, { name: '所有文件', extensions: ['*'] }]
      : [{ name: '所有文件', extensions: ['*'] }],
  };
}

function ensureSaveExtension(filePath, extension) {
  return extension && !path.extname(filePath) ? `${filePath}${extension}` : filePath;
}

// Keep the packaged renderer on the same accelerated compositor path as the
// browser version. This must run before Electron finishes initialising.
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-zero-copy');

// Keep portable WDF archives and the default Agent workspace in Documents,
// rather than inside Codex's project directory or AppData.
app.setPath('userData', process.env.WENDAFLOW_USER_DATA_DIR || path.join(app.getPath('documents'), 'Wonderful'));

function backendEntry() {
  return app.isPackaged ? path.join(process.resourcesPath, 'server.mjs') : path.join(here, 'server.mjs');
}

function startBackend() {
  if (backend?.connected) return;
  backend = fork(backendEntry(), [], {
    cwd: app.getPath('userData'),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WONDERFUL_DATA_DIR: app.getPath('userData') },
    stdio: 'ignore',
    windowsHide: true,
  });
  backend.unref();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 980, minHeight: 680,
    backgroundColor: '#f3f6f3', title: 'Wendaflow', frame: false,
    icon: path.join(here, 'build', process.platform === 'darwin' ? 'icon.icns' : 'icon.ico'),
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(here, 'electron-preload.cjs') },
  });
  if (app.isPackaged) mainWindow.loadFile(path.join(here, 'dist', 'index.html'));
  else mainWindow.loadURL('http://127.0.0.1:5173');
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!/^https?:\/\//i.test(url) || url === mainWindow.webContents.getURL()) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
}

app.whenReady().then(async () => {
  await mkdir(app.getPath('userData'), { recursive: true });
  startBackend();
  ipcMain.handle('wonderful:pick-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? '' : result.filePaths[0];
  });
  ipcMain.handle('wonderful:open-data-file', async (_event, { name, dataUrl }) => {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
    if (!match) throw new Error('附件数据无效');
    const safeName = path.basename(String(name || 'wonderful-file')).replace(/[<>:"/\\|?*]/g, '_');
    const directory = await mkdtemp(path.join(os.tmpdir(), 'wonderful-view-'));
    const target = path.join(directory, safeName);
    const isBase64 = String(dataUrl).includes(';base64,');
    await writeFile(target, isBase64 ? Buffer.from(match[2], 'base64') : decodeURIComponent(match[2]));
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return target;
  });
  ipcMain.handle('wonderful:open-path', async (_event, target) => {
    const resolved = path.resolve(String(target || ''));
    const error = await shell.openPath(resolved);
    if (error) throw new Error(error);
    return resolved;
  });
  ipcMain.handle('wonderful:open-external', async (_event, target) => {
    const url = String(target || '');
    if (!/^https?:\/\//i.test(url)) throw new Error('Only HTTP(S) URLs can be opened externally');
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle('wonderful:save-path', async (_event, { source, name }) => {
    const sourcePath = path.resolve(String(source || ''));
    const extension = usableExtension(name, sourcePath);
    const result = await dialog.showSaveDialog(mainWindow, saveDialogOptions(name || sourcePath, extension));
    if (result.canceled || !result.filePath) return '';
    const targetPath = ensureSaveExtension(result.filePath, extension);
    await copyFile(sourcePath, targetPath);
    return targetPath;
  });
  ipcMain.handle('wonderful:save-data-file', async (_event, { name, dataUrl }) => {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
    if (!match) throw new Error('产物数据无效');
    const extension = usableExtension(name) || MIME_EXTENSIONS[String(match[1] || '').toLowerCase()] || '';
    const result = await dialog.showSaveDialog(mainWindow, saveDialogOptions(name, extension));
    if (result.canceled || !result.filePath) return '';
    const targetPath = ensureSaveExtension(result.filePath, extension);
    const isBase64 = String(dataUrl).includes(';base64,');
    await writeFile(targetPath, isBase64 ? Buffer.from(match[2], 'base64') : decodeURIComponent(match[2]));
    return targetPath;
  });
  ipcMain.on('wonderful:window-control', (_event, command) => {
    if (!mainWindow) return;
    if (command === 'minimize') mainWindow.minimize();
    if (command === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    if (command === 'close') mainWindow.close();
  });
  ipcMain.on('wonderful:window-drag-start', (event, point) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || !point) return;
    const [x, y] = window.getPosition();
    windowDrag = { window, screenX: point.x, screenY: point.y, windowX: x, windowY: y };
  });
  ipcMain.on('wonderful:window-drag-move', (event, point) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!windowDrag || windowDrag.window !== window || !point) return;
    window.setPosition(Math.round(windowDrag.windowX + point.x - windowDrag.screenX), Math.round(windowDrag.windowY + point.y - windowDrag.screenY));
  });
  ipcMain.on('wonderful:window-drag-end', () => { windowDrag = null; });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (backend && !backend.killed) backend.kill(); });
