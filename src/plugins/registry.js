// Optional features ("plugins"). Each one is off until the user turns it on in
// Settings → Plugins. The switch lives in this browser and is mirrored to the
// local server.mjs, which refuses a plugin's routes while it is off.
import { useEffect, useState } from 'react';
import { LOCAL_PROXY_URL, PUBLIC_WEB } from '../localProxy.js';

export const PLUGIN_STORAGE_KEY = 'wendaflow-plugins-v1';

export const PLUGINS = [
  { id: 'comic', localOnly: true },
];

export function readPluginState(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(PLUGIN_STORAGE_KEY) || '{}');
    return Object.fromEntries(PLUGINS.map(({ id }) => [id, saved?.[id] === true]));
  } catch { return Object.fromEntries(PLUGINS.map(({ id }) => [id, false])); }
}

export function enabledPluginIds(state) {
  return PLUGINS.filter(({ id, localOnly }) => state?.[id] === true && !(localOnly && PUBLIC_WEB)).map(({ id }) => id);
}

export async function syncPluginsToServer(state) {
  if (PUBLIC_WEB) return false;
  try {
    const response = await fetch(`${LOCAL_PROXY_URL}/plugins`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: enabledPluginIds(state) }) });
    return response.ok;
  } catch { return false; } // server not running: the plugin's own calls report that clearly
}

export function usePlugins() {
  const [state, setState] = useState(() => readPluginState());
  useEffect(() => {
    try { localStorage.setItem(PLUGIN_STORAGE_KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
    void syncPluginsToServer(state);
  }, [state]);
  const isEnabled = (id) => enabledPluginIds(state).includes(id);
  return { state, isEnabled, setEnabled: (id, value) => setState((current) => ({ ...current, [id]: value === true })) };
}
