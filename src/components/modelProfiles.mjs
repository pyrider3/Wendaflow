// Model profile persistence and lookup helpers.
// Kept separate from main.jsx so storage edge cases can be unit-tested directly.

export const DEFAULT_OLLAMA = {
  id: 'local-default',
  name: 'Qwen',
  endpoint: 'http://127.0.0.1:11434',
  model: 'qwen2.5:7b',
};

export const DEFAULT_CLOUD = {
  id: 'cloud-default',
  name: 'OpenAI',
  format: 'responses',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-5.4',
  apiKey: '',
  useLocalProxy: true,
  chatOptions: { thinking: false, reasoning: 'none', temperature: 0.7 },
};

function readJson(storage, key) {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Load saved local (Ollama) model profiles.
 * - Any saved Array (including `[]` after the user deletes the last local model)
 *   is honored verbatim so deleted models never reappear on reload.
 * - On first run (no `branchspace-local-profiles` key), only migrate legacy
 *   `branchspace-ollama` if it actually exists; never inject a phantom
 *   unconfigured `Qwen / qwen2.5:7b` tile.
 */
export function loadLocalProfiles(storage) {
  const saved = readJson(storage, 'branchspace-local-profiles');
  if (Array.isArray(saved)) return saved;
  const legacy = readJson(storage, 'branchspace-ollama');
  if (isPlainObject(legacy)) return [{ ...DEFAULT_OLLAMA, ...legacy }];
  return [];
}

/**
 * Load saved cloud model profiles.
 * - Any saved Array (including `[]` after the user deletes the last cloud model)
 *   is honored verbatim so deleted models never reappear on reload.
 * - Falls back to legacy `sessionStorage` and `branchspace-cloud` only as a
 *   one-time migration before `branchspace-cloud-profiles` has ever been saved.
 */
export function loadCloudProfiles(storage, legacySessionStorage = null) {
  const saved = readJson(storage, 'branchspace-cloud-profiles')
    ?? readJson(legacySessionStorage, 'branchspace-cloud-profiles');
  if (Array.isArray(saved)) return saved;
  const legacy = readJson(storage, 'branchspace-cloud')
    ?? readJson(legacySessionStorage, 'branchspace-cloud');
  if (isPlainObject(legacy)) return [{ ...DEFAULT_CLOUD, ...legacy }];
  return [DEFAULT_CLOUD];
}

/**
 * Pick the initial chat model key from the saved default and available profiles.
 * Returns `''` safely when both profile lists are empty.
 */
export function resolveInitialChatModel(savedDefault, cloudProfiles = [], localProfiles = []) {
  const saved = String(savedDefault || '');
  const known = saved.startsWith('cloud:')
    ? cloudProfiles.some((profile) => `cloud:${profile.id}` === saved)
    : saved.startsWith('local:')
      ? localProfiles.some((profile) => `local:${profile.id}` === saved)
      : false;
  if (known) return saved;
  if (cloudProfiles[0]) return `cloud:${cloudProfiles[0].id}`;
  if (localProfiles[0]) return `local:${localProfiles[0].id}`;
  return '';
}

/**
 * Resolve a `cloud:<id>` or `local:<id>` selector to its profile without
 * silently falling back to an unconfigured default Ollama profile.
 */
export function resolveModelProfile(modelValue, cloudProfiles = [], localProfiles = []) {
  const value = String(modelValue || '');
  if (value.startsWith('cloud:')) {
    return { cloud: cloudProfiles.find((item) => item.id === value.slice(6)) || null, local: null };
  }
  if (value.startsWith('local:')) {
    return { cloud: null, local: localProfiles.find((item) => item.id === value.slice(6)) || null };
  }
  return { cloud: null, local: null };
}
