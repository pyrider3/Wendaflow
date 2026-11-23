// Server side of optional plugins: every plugin starts disabled, the browser reports
// which ones the user turned on (POST /plugins), and a plugin's routes answer 403 until then.
const KNOWN = new Set(['comic']);

export function createPluginGate(routes) {
  const enabled = new Set();
  return {
    isEnabled: (id) => enabled.has(id),
    // Returns { status, body, run? } for requests it owns, or null to let server.mjs continue.
    route(method, url) {
      if (method === 'POST' && url === '/plugins') return { status: 200, apply: (body) => {
        enabled.clear();
        for (const id of Array.isArray(body?.enabled) ? body.enabled : []) if (KNOWN.has(id)) enabled.add(id);
        return { enabled: [...enabled] };
      } };
      for (const [plugin, table] of Object.entries(routes)) {
        if (method !== 'POST' || !Object.hasOwn(table, url)) continue;
        if (!enabled.has(plugin)) return { status: 403, body: { error: '插件未启用：请在 设置 → 插件 里打开「AI 漫剧工作台」。', code: 'plugin_disabled', plugin } };
        return { status: 200, apply: table[url] };
      }
      return null;
    },
  };
}
