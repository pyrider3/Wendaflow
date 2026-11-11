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
const startedAt = new Date().toISOString();
const rateBuckets = new Map();
const defaultRelease = { latestVersion: '0.1.0', downloadUrl: '', releaseNotes: '', publishedAt: '' };
const emptyStore = () => ({ devices: {}, registry: {}, campaigns: {}, templates: {}, audit: [], release: { ...defaultRelease } });
async function readStore() { try { const parsed = JSON.parse(await fs.readFile(dataFile, 'utf8')); return { ...emptyStore(), ...parsed, devices: parsed.devices || {}, registry: parsed.registry || {}, campaigns: parsed.campaigns || {}, templates: parsed.templates || {}, audit: parsed.audit || [], release: { ...defaultRelease, ...(parsed.release || {}) } }; } catch { return emptyStore(); } }
async function writeStore(store) { await fs.mkdir(path.dirname(dataFile), { recursive: true }); await fs.writeFile(dataFile, JSON.stringify(store, null, 2), 'utf8'); }
function secure(req, res, next) { if (!adminToken || req.get('x-admin-token') !== adminToken) return res.status(401).json({ error: 'Unauthorized' }); next(); }
function rateLimit(limit, windowMs) { return (req,res,next) => { const key = `${req.ip}:${req.path}`; const now = Date.now(); const bucket = (rateBuckets.get(key) || []).filter((time) => now - time < windowMs); if (bucket.length >= limit) return res.status(429).json({ error: 'Too many requests. Try again later.' }); bucket.push(now); rateBuckets.set(key, bucket); next(); }; }
function audit(store, action, detail = {}) { store.audit.unshift({ id: crypto.randomUUID(), action, detail, createdAt: new Date().toISOString() }); store.audit = store.audit.slice(0, 5000); }
function recipientsFor(store, target = {}) {
  const { audience = 'all', deviceId = '', targetVersion = '', targetLanguage = '', activeWithinDays = 0 } = target;
  if (audience === 'device') return deviceId ? [deviceId] : [];
  const cutoff = Number(activeWithinDays) > 0 ? Date.now() - Number(activeWithinDays) * 86400000 : 0;
  return Object.entries(store.registry).filter(([id, info]) => {
    if (audience === 'version' && info.version !== targetVersion) return false;
    if (audience === 'language' && info.language !== targetLanguage) return false;
    if (cutoff && new Date(info.lastSeenAt || 0).getTime() < cutoff) return false;
    return true;
  }).map(([id]) => id);
}
function pickLocale(locales, language) { const normalized = String(language || '').toLowerCase(); return locales?.[language] || locales?.[normalized] || locales?.[normalized.split('-')[0]] || locales?.['zh-CN'] || locales?.en || Object.values(locales || {})[0] || { title: '', body: '' }; }
function campaignView(campaign, store) { const deliveries = Object.values(store.devices).flat().filter((notice) => notice.campaignId === campaign.id); return { ...campaign, stats: { targeted: campaign.recipientCount || 0, delivered: deliveries.length, online: deliveries.filter((item) => item.deliveredRealtime).length, read: deliveries.filter((item) => item.read).length, acknowledged: deliveries.filter((item) => item.acknowledged).length, dismissed: deliveries.filter((item) => item.dismissed).length } }; }
async function dispatchCampaign(store, campaign) {
  const recipients = recipientsFor(store, campaign.target || {}); const createdAt = new Date().toISOString(); let realtime = 0;
  for (const recipientId of recipients) {
    const locale = pickLocale(campaign.locales, store.registry[recipientId]?.language);
    const notification = { id: crypto.randomUUID(), campaignId: campaign.id, deviceId: recipientId, title: String(locale.title || '').slice(0, 180), body: String(locale.body || '').slice(0, 3000), kind: campaign.kind || 'info', requiresAcknowledgement: !!campaign.requiresAcknowledgement, createdAt, read: false, deliveredRealtime: false };
    store.devices[recipientId] = [notification, ...(store.devices[recipientId] || [])].slice(0, 300);
    for (const socket of clients.get(recipientId) || []) if (socket.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ type: 'notification', notification })); notification.deliveredRealtime = true; realtime += 1; }
  }
  campaign.status = 'sent'; campaign.sentAt = createdAt; campaign.recipientCount = recipients.length; campaign.realtimeCount = realtime; audit(store, 'campaign.sent', { campaignId: campaign.id, recipients: recipients.length, realtime });
}
const app = express();
app.disable('x-powered-by'); app.use(cors({ origin: true })); app.use(express.json({ limit: '64kb' }));
app.get('/health', async (_req, res) => { const store = await readStore(); res.json({ ok: true, onlineDevices: clients.size, registeredDevices: Object.keys(store.registry).length, latestVersion: store.release.latestVersion, startedAt, uptimeSeconds: Math.round(process.uptime()), memoryBytes: process.memoryUsage().rss, storage: 'json' }); });
app.get('/v1/client/latest', async (_req, res) => { const store = await readStore(); res.json(store.release); });
app.put('/v1/client/latest', secure, async (req, res) => { const { latestVersion, downloadUrl = '', releaseNotes = '' } = req.body || {}; if (!latestVersion) return res.status(400).json({ error: 'latestVersion is required' }); const store = await readStore(); store.release = { latestVersion: String(latestVersion).slice(0, 64), downloadUrl: String(downloadUrl).slice(0, 1000), releaseNotes: String(releaseNotes).slice(0, 3000), publishedAt: new Date().toISOString() }; audit(store, 'release.published', { latestVersion: store.release.latestVersion }); await writeStore(store); res.json(store.release); });
app.get('/v1/admin/audit', secure, async (_req, res) => { const store = await readStore(); res.json({ entries: store.audit.slice(0, 300) }); });
app.get('/v1/admin/campaigns', secure, async (_req, res) => { const store = await readStore(); res.json({ campaigns: Object.values(store.campaigns).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((item) => campaignView(item, store)), templates: Object.values(store.templates).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))) }); });
app.post('/v1/admin/campaigns', secure, async (req, res) => {
  const { title = '', locales = {}, kind = 'info', target = {}, requiresAcknowledgement = false, scheduledAt = '', status = 'send', templateName = '' } = req.body || {};
  const validLocales = Object.fromEntries(Object.entries(locales).map(([language, value]) => [language, { title: String(value?.title || title).slice(0, 180), body: String(value?.body || '').slice(0, 3000) }]).filter(([, value]) => value.title));
  if (!Object.keys(validLocales).length) return res.status(400).json({ error: '至少需要填写一种语言的标题' });
  const store = await readStore(); const targetCount = recipientsFor(store, target).length;
  if (status === 'send' && !targetCount) return res.status(404).json({ error: '没有匹配的设备' });
  const campaign = { id: crypto.randomUUID(), title: String(title || validLocales['zh-CN']?.title || Object.values(validLocales)[0].title).slice(0, 180), locales: validLocales, kind: ['info','update','warning'].includes(kind) ? kind : 'info', target, requiresAcknowledgement: !!requiresAcknowledgement, status: status === 'draft' ? 'draft' : scheduledAt && new Date(scheduledAt) > new Date() ? 'scheduled' : 'sending', scheduledAt: scheduledAt || '', recipientCount: targetCount, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  store.campaigns[campaign.id] = campaign;
  if (templateName) { const templateId = crypto.randomUUID(); store.templates[templateId] = { ...campaign, id: templateId, name: String(templateName).slice(0, 80), status: 'template', updatedAt: new Date().toISOString() }; }
  if (campaign.status === 'sending') await dispatchCampaign(store, campaign); else audit(store, campaign.status === 'draft' ? 'campaign.drafted' : 'campaign.scheduled', { campaignId: campaign.id, targetCount });
  await writeStore(store); res.status(201).json({ campaign: campaignView(campaign, store) });
});
app.post('/v1/admin/campaigns/:id/send', secure, async (req, res) => { const store = await readStore(); const campaign = store.campaigns[req.params.id]; if (!campaign || campaign.status === 'revoked') return res.status(404).json({ error: '通知批次不存在或已作废' }); if (campaign.status === 'sent') return res.status(400).json({ error: '该通知已经发送' }); await dispatchCampaign(store, campaign); await writeStore(store); res.json({ campaign: campaignView(campaign, store) }); });
app.post('/v1/admin/campaigns/:id/revoke', secure, async (req, res) => { const store = await readStore(); const campaign = store.campaigns[req.params.id]; if (!campaign || campaign.status === 'revoked') return res.status(404).json({ error: '通知批次不存在或已作废' }); let changed = 0; for (const [deviceId, items] of Object.entries(store.devices)) for (const notice of items || []) if (notice.campaignId === campaign.id && !notice.revoked) { notice.revoked = true; notice.dismissed = true; changed += 1; for (const socket of clients.get(deviceId) || []) if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'notification-revoked', id: notice.id })); } campaign.status = 'revoked'; campaign.revokedAt = new Date().toISOString(); audit(store, 'campaign.revoked', { campaignId: campaign.id, deliveryCount: changed }); await writeStore(store); res.json({ campaign: campaignView(campaign, store), changed }); });
// Legacy endpoints are retained for installed manager builds that have not upgraded yet.
app.get('/v1/admin/notifications', secure, async (_req, res) => { const store = await readStore(); res.json({ notifications: Object.entries(store.devices).flatMap(([deviceId, items]) => (items || []).map((item) => ({ ...item, deviceId }))).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 500) }); });
app.post('/v1/notifications', secure, async (req, res) => { const body = req.body || {}; const campaign = { title: body.title, locales: { 'zh-CN': { title: body.title, body: body.body || '' } }, kind: body.kind || 'info', target: body, requiresAcknowledgement: !!body.requiresAcknowledgement, status: 'send' }; req.body = campaign; return app.handle(Object.assign(req, { url: '/v1/admin/campaigns', method: 'POST' }), res); });
app.post('/v1/client/notifications/state', async (req, res) => { const { deviceId, deviceKey, ids = [], action = 'read' } = req.body || {}; const store = await readStore(); if (!deviceId || !deviceKey || store.registry[deviceId]?.deviceKey !== deviceKey) return res.status(401).json({ error: 'Invalid device key' }); const wanted = new Set(Array.isArray(ids) ? ids : []); for (const notice of store.devices[deviceId] || []) if (!wanted.size || wanted.has(notice.id)) { if (action === 'dismiss') notice.dismissed = true; else if (action === 'acknowledge') { notice.read = true; notice.acknowledged = true; } else notice.read = true; } audit(store, `notification.${action}`, { deviceId, count: wanted.size || 'all' }); await writeStore(store); res.json({ ok: true }); });
app.get('/v1/devices/:deviceId/notifications', secure, async (req, res) => { const store = await readStore(); res.json({ notifications: store.devices[req.params.deviceId] || [] }); });
app.get('/v1/devices', secure, async (req, res) => { const store = await readStore(); const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50)); const offset = Math.max(0, Number(req.query.offset) || 0); const search = String(req.query.search || '').toLowerCase(); const all = Object.entries(store.registry).map(([id, info]) => ({ id, appVersion: info.version || 'unknown', language: info.language || 'unknown', deviceKey: info.deviceKey || '', createdAt: info.createdAt || info.lastSeenAt || '', lastSeenAt: info.lastSeenAt || '' })).filter((item) => !search || `${item.id} ${item.appVersion} ${item.language}`.toLowerCase().includes(search)).sort((a,b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt))); res.json({ devices: all.slice(offset, offset + limit), total: all.length, limit, offset }); });
const server = http.createServer(app); const wss = new WebSocketServer({ noServer: true });
// Scheduled notifications remain in the durable store; a restart therefore never loses a pending send.
setInterval(async () => { try { const store = await readStore(); let changed = false; for (const campaign of Object.values(store.campaigns)) if (campaign.status === 'scheduled' && new Date(campaign.scheduledAt) <= new Date()) { await dispatchCampaign(store, campaign); changed = true; } if (changed) await writeStore(store); } catch (error) { console.error('Could not dispatch scheduled campaigns:', error.message); } }, 15000).unref();
wss.on('connection', async (socket, deviceId, version, language) => { const bucket = clients.get(deviceId) || new Set(); bucket.add(socket); clients.set(deviceId, bucket); try { const store = await readStore(); const previous = store.registry[deviceId] || {}; const deviceKey = previous.deviceKey || crypto.randomBytes(24).toString('base64url'); store.registry[deviceId] = { ...previous, version: String(version || 'unknown').slice(0, 64), language: String(language || 'unknown').slice(0, 32), deviceKey, lastSeenAt: new Date().toISOString() }; await writeStore(store); socket.send(JSON.stringify({ type: 'connected', deviceId, deviceKey })); if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'history', notifications: (store.devices[deviceId] || []).filter((notice) => !notice.dismissed && !notice.revoked).slice(0, 120) })); } catch (error) { console.error('Could not load notification history:', error.message); } socket.on('close', () => { bucket.delete(socket); if (!bucket.size) clients.delete(deviceId); }); });
server.on('upgrade', (request, socket, head) => { const url = new URL(request.url || '/', `http://${request.headers.host}`); const deviceId = url.searchParams.get('deviceId'); const version = url.searchParams.get('version'); const language = url.searchParams.get('language'); if (url.pathname !== '/v1/realtime' || !deviceId || deviceId.length > 160) return socket.destroy(); wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, deviceId, version, language)); });
server.listen(port, '127.0.0.1', () => console.log(`Wendaflow notification server listening on http://127.0.0.1:${port}`));
