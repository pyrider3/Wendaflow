import { app, BrowserWindow, clipboard, ipcMain, shell } from 'electron';
import { fork } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const userRoot = path.join(app.getPath('documents'), 'Wendaflow Notification Server');
const configPath = path.join(userRoot, 'manager-settings.json');
const dataPath = path.join(userRoot, 'data', 'notifications.json');
let serverProcess = null;

const OFFICIAL_URL = 'https://api.qnjyxh.xyz';
const defaults = { port: 8788, publicUrl: OFFICIAL_URL, adminToken: '', licenseSecret: '', startedAt: '' };
async function getSettings() {
  try { return { ...defaults, ...JSON.parse(await readFile(configPath, 'utf8')) }; }
  catch { return defaults; }
}
async function saveSettings(next) {
  await mkdir(userRoot, { recursive: true });
  await writeFile(configPath, JSON.stringify(next, null, 2));
  return next;
}
function serverPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'app', 'server', 'server.mjs') : path.join(here, 'server', 'server.mjs');
}
async function status() {
  const config = await getSettings();
  try {
    const response = await fetch(`http://127.0.0.1:${config.port}/health`);
    const health = await response.json();
    return { running: Boolean(health.ok), ...health, port: config.port };
  } catch { return { running: false, onlineDevices: 0, port: config.port }; }
}
async function startServer() {
  const config = await getSettings();
  if (!config.adminToken) throw new Error('请先填写并保存管理密钥。');
  const current = await status();
  if (current.running) return current;
  serverProcess = fork(serverPath(), [], {
    cwd: userRoot,
    env: { ...process.env, PORT: String(config.port), WENDAFLOW_ADMIN_TOKEN: config.adminToken, WENDAFLOW_LICENSE_SECRET: config.licenseSecret, NOTIFICATION_DATA_FILE: dataPath, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'ignore',
    windowsHide: true,
  });
  serverProcess.on('exit', () => { serverProcess = null; });
  await new Promise((resolve) => setTimeout(resolve, 350));
  return status();
}
function stopServer() {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
  serverProcess = null;
  return { running: false };
}

app.whenReady().then(() => {
  const window = new BrowserWindow({ width: 880, height: 720, minWidth: 760, minHeight: 610, title: 'Wendaflow 通知服务', backgroundColor: '#f4f7f4', webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(here, 'preload.cjs') } });
  window.loadFile(path.join(here, 'renderer', 'index.html'));
});
app.on('window-all-closed', () => { stopServer(); if (process.platform !== 'darwin') app.quit(); });
ipcMain.handle('manager:settings', () => getSettings());
ipcMain.handle('manager:save-settings', async (_event, partial) => {
  const old = await getSettings();
  const next = { ...old, ...partial, publicUrl: OFFICIAL_URL, port: Math.max(1, Math.min(65535, Number(partial.port || old.port))), licenseSecret: String(partial.licenseSecret || old.licenseSecret || crypto.randomBytes(32).toString('hex')) };
  return saveSettings(next);
});
ipcMain.handle('manager:status', () => status());
ipcMain.handle('manager:start', () => startServer());
ipcMain.handle('manager:stop', () => stopServer());
ipcMain.handle('manager:send', async (_event, payload) => {
  const config = await getSettings();
  const response = await fetch(`http://127.0.0.1:${config.port}/v1/notifications`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-token': config.adminToken }, body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '发送失败');
  return result;
});
ipcMain.handle('manager:release', async () => {
  const config = await getSettings();
  const response = await fetch(`http://127.0.0.1:${config.port}/v1/client/latest`);
  if (!response.ok) throw new Error('无法读取版本发布信息');
  return response.json();
});
ipcMain.handle('manager:save-release', async (_event, payload) => {
  const config = await getSettings();
  const response = await fetch(`http://127.0.0.1:${config.port}/v1/client/latest`, {
    method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-token': config.adminToken }, body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '发布失败');
  return result;
});
ipcMain.handle('manager:devices', async (_event, search = '', offset = 0) => {
  const config = await getSettings();
  const response = await fetch(`http://127.0.0.1:${config.port}/v1/devices?limit=50&offset=${Number(offset) || 0}&search=${encodeURIComponent(search)}`, { headers: { 'x-admin-token': config.adminToken } });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '无法读取设备列表'); return result;
});
async function adminRequest(pathname, options = {}) {
  const config = await getSettings();
  const response = await fetch(`http://127.0.0.1:${config.port}${pathname}`, { ...options, headers: { 'content-type': 'application/json', 'x-admin-token': config.adminToken, ...(options.headers || {}) } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '授权服务请求失败');
  return result;
}
ipcMain.handle('manager:licenses', () => adminRequest('/v1/admin/licenses'));
ipcMain.handle('manager:create-license', (_event, payload) => adminRequest('/v1/admin/licenses', { method: 'POST', body: JSON.stringify(payload) }));
ipcMain.handle('manager:revoke-license', (_event, id) => adminRequest(`/v1/admin/licenses/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: '{}' }));
ipcMain.handle('manager:freeze-license', (_event, id) => adminRequest(`/v1/admin/licenses/${encodeURIComponent(id)}/freeze`, { method: 'POST', body: '{}' }));
ipcMain.handle('manager:remove-license-device', (_event, id, deviceId) => adminRequest(`/v1/admin/licenses/${encodeURIComponent(id)}/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }));
ipcMain.handle('manager:audit', () => adminRequest('/v1/admin/audit'));
ipcMain.handle('manager:notification-history', () => adminRequest('/v1/admin/notifications'));
ipcMain.handle('manager:revoke-notification', (_event, id) => adminRequest(`/v1/admin/notifications/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: '{}' }));
ipcMain.handle('manager:campaigns', () => adminRequest('/v1/admin/campaigns'));
ipcMain.handle('manager:create-campaign', (_event, payload) => adminRequest('/v1/admin/campaigns', { method: 'POST', body: JSON.stringify(payload) }));
ipcMain.handle('manager:send-campaign', (_event, id) => adminRequest(`/v1/admin/campaigns/${encodeURIComponent(id)}/send`, { method: 'POST', body: '{}' }));
ipcMain.handle('manager:revoke-campaign', (_event, id) => adminRequest(`/v1/admin/campaigns/${encodeURIComponent(id)}/revoke`, { method: 'POST', body: '{}' }));
ipcMain.handle('manager:backup', async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'); const folder = path.join(userRoot, 'backups', `export-${stamp}`); await mkdir(folder, { recursive: true });
  try { await copyFile(dataPath, path.join(folder, 'notifications.json')); } catch { await writeFile(path.join(folder, 'notifications.json'), JSON.stringify({ devices: {}, registry: {}, licenses: {}, audit: [] }, null, 2)); }
  const settings = await getSettings(); await writeFile(path.join(folder, 'manifest.json'), JSON.stringify({ exportedAt: new Date().toISOString(), format: 'wendaflow-notification-json-v1', publicUrl: OFFICIAL_URL, storage: 'json', restore: 'Copy notifications.json back into the server data folder while the service is stopped.' }, null, 2)); await writeFile(path.join(folder, 'config.public.json'), JSON.stringify({ port: settings.port, publicUrl: OFFICIAL_URL }, null, 2)); return folder;
});
ipcMain.handle('manager:open-folder', () => shell.openPath(userRoot));
ipcMain.handle('manager:copy', (_event, value) => clipboard.writeText(String(value || '')));
