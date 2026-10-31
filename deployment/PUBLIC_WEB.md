# Public web deployment

Build with `VITE_WENDAFLOW_PUBLIC=1 VITE_WENDAFLOW_PROXY_URL=/api npm run build`.
Run the Node backend with `WENDAFLOW_PUBLIC=1 WENDAFLOW_PUBLIC_ORIGIN=https://your-host WONDERFUL_PORT=4318 node server.mjs`, bound to loopback behind HTTPS nginx.

Public mode exposes only POST /stream and GET /health. It does not expose server archives, directory access, agent tasks or artifact access. Cloud providers are explicitly listed in public-policy.mjs; only HTTPS port 443 without embedded credentials/query parameters is accepted. Upstream redirects are rejected. Each visitor provides their own API key, forwarded to the selected provider per request; no operator key is configured.

Canvas content, library groups, favorites, recovery metadata and open-tab state are stored in the visitor's browser. Each canvas starts with autosave disabled. Its first successful manual Save enables autosave for that canvas, remembered in this browser. Before that, switching canvases keeps session-only drafts; closing an unsaved new canvas discards it without adding it to All Canvases or Trash. Reloading also discards unsaved new canvases. Imported and duplicated canvases are retained as explicit documents. Save updates browser storage; the separate Export WDF action downloads a portable backup. This is not cross-device synchronization or an account system. Export WDF backups before clearing site data. Local Ollama requires a compatible, reachable HTTPS endpoint and is not supplied by this deployment.

The production frontend links to /source.tar.gz containing the corresponding buildable source and AGPL license. nginx must limit requests and concurrency and deny all other /api routes. Run the backend as a dedicated unprivileged user. Never serve personal data, .env, keys or SSH credentials in the source archive.
