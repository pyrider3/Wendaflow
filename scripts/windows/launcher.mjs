// Entry point of the Windows one-click build. Starts the local backend (server.mjs) and a small
// web server for the built interface (dist/ next to the exe), then opens the browser.
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { readFile, stat, mkdir } from 'node:fs/promises';

const WEB_PORT = Number(process.env.WENDAFLOW_WEB_PORT || 5173);
const API_PORT = Number(process.env.WONDERFUL_PORT || 4318);
const baseDir = path.dirname(process.execPath);
const distDir = process.env.WENDAFLOW_DIST || path.join(baseDir, 'dist');
const dataDir = process.env.WONDERFUL_DATA_DIR || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Wendaflow');
const url = `http://127.0.0.1:${WEB_PORT}/`;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json' };

function openBrowser() {
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

function portInUse(port) {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(port, '127.0.0.1');
  });
}

async function serveFile(res, file) {
  const body = await readFile(file);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' });
  res.end(body);
}

function proxy(req, res) {
  const upstream = http.request({ host: '127.0.0.1', port: API_PORT, method: req.method, path: req.url.replace(/^\/api/, '') || '/', headers: req.headers }, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{"error":"Wendaflow backend is not running"}'); });
  req.pipe(upstream);
}

async function main() {
  if (await portInUse(WEB_PORT)) { console.log(`Wendaflow is already running at ${url}`); openBrowser(); return; }
  await mkdir(dataDir, { recursive: true });
  process.env.WONDERFUL_DATA_DIR = dataDir;
  try { await stat(path.join(distDir, 'index.html')); } catch {
    console.error(`Cannot find the interface files at ${distDir}\nKeep the "dist" folder next to Wendaflow.exe.`);
    process.exitCode = 1; await new Promise((r) => setTimeout(r, 8000)); return;
  }
  await import('../../server.mjs');
  const web = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) return proxy(req, res);
      const pathname = decodeURIComponent(new URL(req.url, url).pathname);
      const file = path.normalize(path.join(distDir, pathname === '/' ? 'index.html' : pathname));
      if (!file.startsWith(distDir)) { res.writeHead(403); res.end(); return; }
      try { if ((await stat(file)).isFile()) return await serveFile(res, file); } catch {}
      await serveFile(res, path.join(distDir, 'index.html'));
    } catch (error) { res.writeHead(500); res.end(String(error?.message || error)); }
  });
  web.listen(WEB_PORT, '127.0.0.1', () => {
    console.log(`Wendaflow is running at ${url}\nYour canvases are saved in ${dataDir}\nClose this window to quit.`);
    openBrowser();
  });
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
