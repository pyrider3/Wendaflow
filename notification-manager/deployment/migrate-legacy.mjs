import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import pg from 'pg';

const [sourceFile] = process.argv.slice(2);
if (!sourceFile || !process.env.DATABASE_URL) {
  console.error('Usage: DATABASE_URL=... node migrate-legacy.mjs <notifications.json>');
  process.exit(1);
}
const store = JSON.parse(await fs.readFile(sourceFile, 'utf8'));
const { Pool } = pg; const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (text, params = []) => pool.query(text, params);
function asDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }
try {
  for (const [id, info] of Object.entries(store.registry || {})) await q(`INSERT INTO devices(id,app_version,language,last_seen_at) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET app_version=EXCLUDED.app_version,language=EXCLUDED.language,last_seen_at=EXCLUDED.last_seen_at`, [id, info.version || 'unknown', info.language || 'unknown', asDate(info.lastSeenAt) || new Date()]);
  if (store.release) await q(`UPDATE app_settings SET value=$1 WHERE key='release'`, [JSON.stringify(store.release)]);
  for (const [deviceId, notices] of Object.entries(store.devices || {})) {
    await q(`INSERT INTO devices(id) VALUES($1) ON CONFLICT DO NOTHING`, [deviceId]);
    for (const notice of notices) {
      const id = /^[0-9a-f-]{36}$/i.test(notice.id || '') ? notice.id : crypto.randomUUID();
      await q(`INSERT INTO notifications(id,title,body,kind,canvas_id,node_id,requires_ack,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING`, [id, notice.title || 'Notification', notice.body || '', notice.kind || 'info', notice.canvasId || '', notice.nodeId || '', !!notice.requiresAcknowledgement, asDate(notice.createdAt) || new Date()]);
      await q(`INSERT INTO notification_deliveries(notification_id,device_id,read_at,acknowledged_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [id, deviceId, notice.read ? new Date() : null, notice.read && notice.requiresAcknowledgement ? new Date() : null]);
    }
  }
  console.log('Legacy data migration complete.');
} finally { await pool.end(); }
