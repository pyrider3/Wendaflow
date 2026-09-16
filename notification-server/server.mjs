import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';

const port = Number(process.env.PORT || 8788);
const adminToken = process.env.WENDAFLOW_ADMIN_TOKEN || '';
const dataFile = process.env.NOTIFICATION_DATA_FILE || path.join(process.cwd(), 'data', 'notifications.json');
const clients = new Map();
const defaultRelease = { latestVersion: '0.1.0', downloadUrl: '', releaseNotes: '', publishedAt: '' };
const emptyStore = () => ({ devices: {}, registry: {}, release: { ...defaultRelease } });
async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(dataFile, 'utf8'));
    return { ...emptyStore(), ...parsed, devices: parsed.devices || {}, registry: parsed.registry || {}, release: { ...defaultRelease, ...(parsed.release || {}) } };
  } catch { return emptyStore(); }
}
async function writeStore(store) { await fs.mkdir(path.dirname(dataFile), { recursive: true }); await fs.writeFile(dataFile, JSON.stringify(store, null, 2), 'utf8'); }
function secure(req, res, next) { if (!adminToken || req.get('x-admin-token') !== adminToken) return res.status(401).json({ error: 'Unauthorized' }); next(); }
function recipientsFor(store, audience, deviceId, targetVersion, targetLanguage) { if (audience === 'all') return Object.keys(store.registry); if (audience === 'version') return Object.entries(store.registry).filter(([, info]) => info.version === targetVersion).map(([id]) => id); if (audience === 'language') return Object.entries(store.registry).filter(([, info]) => info.language === targetLanguage).map(([id]) => id); return deviceId ? [deviceId] : []; }

const app = express();
app.disable('x-powered-by'); app.use(cors({ origin: true })); app.use(express.json({ limit: '64kb' }));
app.get('/health', async (_req, res) => { const store = await readStore(); res.json({ ok: true, onlineDevices: clients.size, registeredDevices: Object.keys(store.registry).length, latestVersion: store.release.latestVersion }); });
app.get('/v1/client/latest', async (_req, res) => { const store = await readStore(); res.json(store.release); });
app.put('/v1/client/latest', secure, async (req, res) => {
  const { latestVersion, downloadUrl = '', releaseNotes = '' } = req.body || {};
  if (!latestVersion) return res.status(400).json({ error: 'latestVersion is required' });
  const store = await readStore();
  store.release = { latestVersion: String(latestVersion).slice(0, 64), downloadUrl: String(downloadUrl).slice(0, 1000), releaseNotes: String(releaseNotes).slice(0, 3000), publishedAt: new Date().toISOString() };
  await writeStore(store); res.json(store.release);
});
app.post('/v1/notifications', secure, async (req, res) => {
  const { audience = 'device', deviceId = '', targetVersion = '', targetLanguage = '', title, body = '', kind = 'info', canvasId = '', nodeId = '', requiresAcknowledgement = false } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required' });
  if (!['device', 'all', 'version', 'language'].includes(audience)) return res.status(400).json({ error: 'Unknown audience' });
  if (audience === 'device' && !deviceId) return res.status(400).json({ error: 'deviceId is required for device audience' });
  if (audience === 'version' && !targetVersion) return res.status(400).json({ error: 'targetVersion is required for version audience' });
  if (audience === 'language' && !targetLanguage) return res.status(400).json({ error: 'targetLanguage is required for language audience' });
  const store = await readStore(); const recipients = recipientsFor(store, audience, deviceId, targetVersion, targetLanguage);
  if (!recipients.length) return res.status(404).json({ error: 'No matching registered devices' });
  const createdAt = new Date().toISOString(); const payload = { title: String(title).slice(0, 180), body: String(body).slice(0, 1000), kind, canvasId, nodeId, requiresAcknowledgement: !!requiresAcknowledgement, createdAt, read: false }; let delivered = 0;
  for (const recipientId of recipients) { const notification = { id: crypto.randomUUID(), deviceId: recipientId, ...payload }; store.devices[recipientId] = [notification, ...(store.devices[recipientId] || [])].slice(0, 200); const sockets = clients.get(recipientId) || new Set(); for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ type: 'notification', notification })); delivered += 1; } }
  await writeStore(store); res.status(201).json({ audience, recipientCount: recipients.length, delivered, createdAt });
});
app.get('/v1/devices/:deviceId/notifications', secure, async (req, res) => { const store = await readStore(); res.json({ notifications: store.devices[req.params.deviceId] || [] }); });
const server = http.createServer(app); const wss = new WebSocketServer({ noServer: true });
wss.on('connection', async (socket, deviceId, version, language) => { const bucket = clients.get(deviceId) || new Set(); bucket.add(socket); clients.set(deviceId, bucket); socket.send(JSON.stringify({ type: 'connected', deviceId })); try { const store = await readStore(); store.registry[deviceId] = { version: String(version || 'unknown').slice(0, 64), language: String(language || 'unknown').slice(0, 32), lastSeenAt: new Date().toISOString() }; await writeStore(store); if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'history', notifications: (store.devices[deviceId] || []).slice(0, 120) })); } catch (error) { console.error('Could not load notification history:', error.message); } socket.on('close', () => { bucket.delete(socket); if (!bucket.size) clients.delete(deviceId); }); });
server.on('upgrade', (request, socket, head) => { const url = new URL(request.url || '/', `http://${request.headers.host}`); const deviceId = url.searchParams.get('deviceId'); const version = url.searchParams.get('version'); const language = url.searchParams.get('language'); if (url.pathname !== '/v1/realtime' || !deviceId || deviceId.length > 160) return socket.destroy(); wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, deviceId, version, language)); });
server.listen(port, '127.0.0.1', () => console.log(`Wendaflow notification server listening on http://127.0.0.1:${port}`));
