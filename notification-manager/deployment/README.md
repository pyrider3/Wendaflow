# Wendaflow scalable service

This deployment replaces the desktop JSON store with PostgreSQL while keeping the same `api.qnjyxh.xyz` client API.

1. Install Docker Desktop with WSL2 on the Windows server.
2. Copy `.env.example` to `.env` and replace every password with a long random value. Keep `WENDAFLOW_LICENSE_SECRET` forever; changing it invalidates existing license tokens.
3. From this directory run `docker compose up -d --build`.
4. Point the existing Cloudflare Tunnel hostname `api.qnjyxh.xyz` to `http://127.0.0.1:8788`.
5. Check `http://127.0.0.1:8788/health` locally.

## Move existing desktop-manager data

Before the first switch, copy the old `notifications.json` somewhere safe. After the new stack is healthy, run the migration from the project root:

```powershell
$env:DATABASE_URL = 'postgresql://wendaflow:<POSTGRES_PASSWORD>@127.0.0.1:5432/wendaflow'
node .\deployment\migrate-legacy.mjs 'C:\Users\<you>\Documents\Wendaflow Notification Server\data\notifications.json'
```

Run it before redirecting the Cloudflare Tunnel. It imports device records, notifications, release information, activation-code hashes and device bindings. Keep the same `WENDAFLOW_LICENSE_SECRET` as the old service, otherwise issued license tokens will need a fresh online activation.

Run `./backup.ps1` daily through Windows Task Scheduler. Copy the resulting `backups/*.sql` and the `.env` file to separate storage. On a new server, start the same stack, preserve the same `.env`, then run `./restore.ps1 -BackupFile <file>`.

The database keeps device registrations, notification delivery records, release data, activation-code hashes and device bindings. Activation codes themselves are never stored. When a code reaches its device-seat limit, activating it on another device automatically removes the oldest activation seat; that device loses authorization at its next online verification.
