# Personal cloud (first release)

Personal accounts are optional. Existing browser canvases remain local until the user chooses Upload current canvas. Uploaded/opened cloud documents sync automatically, including inline attachments; local settings and model credentials are never included in the sync payload. The self-hostable code remains AGPL-3.0. No billing is implemented.

Accounts use a 3–32-character ASCII username, a 12–256-character password hashed with salted scrypt, hashed random session tokens and HttpOnly/Secure/SameSite=Strict cookies. Registration and password recovery provide a one-time recovery key. Recovery rotates the key and revokes all previous sessions. There is no email account recovery in this release. Keep the recovery key outside the browser.

All document/history/restore/backup operations require authentication and scope queries by the authenticated user id. Requests pin the expected user id to prevent uploads into an account switched in another tab. Mutations additionally require an exact trusted Origin and JSON. Login endpoints have per-IP throttling and bounded concurrent scrypt operations; account operations also have per-user throttling.

Cloud documents use compare-and-swap revisions. A stale write returns 409 and leaves the local outbox intact. The UI offers Save local edits as a cloud copy. A clean, idle current canvas receives remote updates during the 15-second poll; active editing and unsynced changes block replacement. The user may refresh/open explicitly. Offline edits use an IndexedDB outbox and retry after reconnect or login. Switching canvases queues the outgoing cloud document. Logout waits for syncing, blocks while an outbox remains and removes cloud document caches from the app; local guest documents remain. Deleting through the cloud panel creates a tombstone recoverable through history. Browser canvas management remains a local cache manager; use the cloud panel to manage cloud deletion.

A user can download a full JSON backup and restore it as new cloud documents. Restoring does not overwrite existing ids. If the import exceeds quota, documents already imported remain, and the user must clear space before retrying the remaining entries. WDF remains the individual portable canvas format. Limits: 200 documents and 100 MB live content per user, 12 MB per document including attachments, latest 30 revisions/24 MB history per document, 200 MB aggregate user history. Registration is initially capped at 1,000 accounts, database size at 2 GB. This is a single-server personal deployment, not realtime collaborative editing.

## Run

Requires Node.js 24 LTS (node:sqlite). Set `WENDAFLOW_CLOUD_DIR` to an independent persistent writable directory and `WENDAFLOW_PUBLIC_ORIGIN` to the exact HTTPS origin. Existing public mode still blocks server-local actions and archives. Only `/cloud/*` is added. Do not use `WENDAFLOW_CLOUD_INSECURE=1` in production (this exists only for isolated HTTP localhost testing). Nginx maps `/api/cloud/` to loopback `/cloud/`, forwards X-Real-IP, and limits bodies to 13 MB.

The database uses SQLite WAL and transactions. Keep data outside versioned release directories. Backend service runs as a dedicated unprivileged user with UMask=0077 and an explicit writable data directory. Source tarballs must include cloud/ but never data or backup keys.

## Server backups

Generate a 32-byte random key once, save it in root-readable `/etc/wendaflow-backup.env` as `WENDAFLOW_BACKUP_KEY=<64 hex characters>`, and keep a second copy outside this server. Do not commit it. Use a systemd oneshot/timer, running as the data owner, to run:

```
node /opt/wendaflow/current/cloud/backup.mjs backup /var/lib/wendaflow/cloud /var/backups/wendaflow
```

The script uses SQLite's online backup API, AES-256-GCM authenticated encryption, atomic publication and retains the most recent 14 snapshots. The daily timer is persistent and performs one immediate initial backup. These are same-server backups; protection against complete server loss requires copying encrypted snapshots and retaining the key in a separate location. No external storage provider has been configured.

To restore, first decrypt into a NEW EMPTY staging directory:

```
node cloud/backup.mjs restore /path/to/snapshot.wdfbak /path/to/empty-staging
```

The tool checks SQLite integrity and revokes restored sessions. Stop the service before changing its data directory. Preserve the previous directory, move the verified database into the writable data location, set its ownership, start the service and verify health/login/history. Never replace an open SQLite database or leave old WAL/SHM files alongside a restored file.

## Verification

`npm run test:cloud` covers password/recovery rotation, session revocation, tenant isolation, stale concurrent writes, restore revisions, tombstones, encrypted backup restoration and HTTP Origin/cookie/owner requirements. Existing 104 canvas tests and 6 public policy tests remain applicable. `scripts/check-personal-cloud.playwright.js` uses two isolated browser contexts for registration, second-device login/open, autosync, durable offline edits, conflict copy, backup download, history restore, logout cleanup and password recovery (three consecutive passes; extended checks also cover idle remote updates and JSON backup re-import). No paid model calls are used.


Deployed on 2026-11-01 at https://api.qnjyxh.xyz/ using /opt/wendaflow/releases/20261101-personal-cloud. Daily backup timer enabled; the initial encrypted snapshot was decrypted into a separate staging directory and passed integrity checks. An independent review of light/dark/mobile screenshots prompted a content-sized panel, a clear New local canvas action when no canvas is open, and removal of redundant labels. Motion uses short panel/list entrances and button feedback, with reduced-motion support.
