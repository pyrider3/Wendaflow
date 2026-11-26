// Model connections configured in Wendaflow, turned into Pi providers so a new user's first action card
// works with the keys they already entered in Settings, without touching their own ~/.pi files.
//
// Two halves share this module:
// - piProvidersFromProfiles() runs in the Wendaflow server and turns the browser's model profiles into
//   provider definitions (pure, so it is unit-tested);
// - the default export is a Pi extension loaded with `-e`; it reads those definitions from the
//   WENDAFLOW_PI_PROVIDERS environment variable and registers them. Keys travel only in that variable,
//   never on the command line where other local users could see them.

const API_BY_FORMAT = {
  responses: 'openai-responses',
  'openai-compatible': 'openai-completions',
  anthropic: 'anthropic-messages',
  gemini: 'google-generative-ai',
};

// What Pi needs to know about a model it did not ship with: context window, output limit, whether it can
// think, image input and price. Exact matches come from Pi's own cached catalog (models-store.json, passed
// in as `catalog`); otherwise the model family decides. Cost stays 0 only when nothing better is known.
const FAMILIES = [
  [/claude.*(opus|sonnet|fable)/i, { contextWindow: 200000, maxTokens: 64000, reasoning: true, image: true }],
  [/claude.*haiku/i, { contextWindow: 200000, maxTokens: 64000, reasoning: true, image: true }],
  [/\b(gpt-[5-9]|o[134](-mini)?\b)/i, { contextWindow: 400000, maxTokens: 128000, reasoning: true, image: true }],
  [/gpt-4\.1/i, { contextWindow: 1047576, maxTokens: 32768, reasoning: false, image: true }],
  [/gpt-4o/i, { contextWindow: 128000, maxTokens: 16384, reasoning: false, image: true }],
  [/gemini/i, { contextWindow: 1048576, maxTokens: 65536, reasoning: true, image: true }],
  [/deepseek.*(reasoner|r1|v3\.[1-9]|v4|flash|pro)/i, { contextWindow: 128000, maxTokens: 64000, reasoning: true, image: false }],
  [/deepseek/i, { contextWindow: 128000, maxTokens: 8192, reasoning: false, image: false }],
  [/qwen3|qwq/i, { contextWindow: 131072, maxTokens: 32768, reasoning: true, image: false }],
  [/qwen.*vl|llava|vision/i, { contextWindow: 32768, maxTokens: 8192, reasoning: false, image: true }],
  [/qwen2|llama|mistral|gemma|phi/i, { contextWindow: 32768, maxTokens: 8192, reasoning: false, image: false }],
  [/kimi|k2/i, { contextWindow: 262144, maxTokens: 32768, reasoning: true, image: false }],
  [/glm/i, { contextWindow: 131072, maxTokens: 32768, reasoning: true, image: false }],
];

export function modelFacts(modelId, format, catalog = []) {
  const id = String(modelId || '').toLowerCase();
  const known = (Array.isArray(catalog) ? catalog : []).find((item) => String(item?.id || '').toLowerCase() === id);
  if (known && Number(known.contextWindow) > 0) {
    return {
      contextWindow: Number(known.contextWindow), maxTokens: Number(known.maxTokens) || 16384, reasoning: !!known.reasoning,
      input: Array.isArray(known.input) && known.input.length ? known.input : ['text'],
      cost: { input: Number(known.cost?.input) || 0, output: Number(known.cost?.output) || 0, cacheRead: Number(known.cost?.cacheRead) || 0, cacheWrite: Number(known.cost?.cacheWrite) || 0 },
    };
  }
  const family = FAMILIES.find(([pattern]) => pattern.test(id))?.[1];
  return {
    contextWindow: family?.contextWindow || 128000,
    maxTokens: family?.maxTokens || 16384,
    reasoning: family ? family.reasoning : format === 'responses' || format === 'anthropic' || format === 'gemini',
    input: family?.image === false ? ['text'] : ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'model';
const trimSlash = (value) => String(value || '').trim().replace(/\/+$/, '');

// profiles: [{ id, name, format, endpoint, model, apiKey, local? }]. Profiles without a usable model or
// endpoint (or a cloud profile without a key) are skipped: Pi would only fail on them later.
export function piProvidersFromProfiles(profiles = [], catalog = []) {
  const providers = [], seen = new Set();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (!profile || typeof profile !== 'object') continue;
    const model = String(profile.model || '').trim(), endpoint = trimSlash(profile.endpoint);
    if (!model || !endpoint || model.length > 200 || endpoint.length > 500) continue;
    const local = profile.local === true || profile.format === 'ollama';
    const api = local ? 'openai-completions' : API_BY_FORMAT[profile.format];
    if (!api) continue;
    const apiKey = local ? 'ollama' : String(profile.apiKey || '').trim();
    if (!apiKey) continue;
    let id = `wendaflow-${slug(profile.id || profile.name)}`;
    while (seen.has(id)) id += '-2';
    seen.add(id);
    providers.push({
      id,
      name: `Wendaflow · ${String(profile.name || model).slice(0, 60)}`,
      // Ollama speaks the OpenAI chat API under /v1.
      baseUrl: local && !/\/v1$/.test(endpoint) ? `${endpoint}/v1` : endpoint,
      api,
      apiKey,
      model,
      ...modelFacts(model, local ? 'ollama' : profile.format, catalog),
    });
  }
  return providers;
}

// Which provider/model Pi should start with when the card names none and Pi has no setup of its own.
export function fallbackPiModel(providers, preferredProfileId = '') {
  if (!providers.length) return null;
  const wanted = preferredProfileId ? `wendaflow-${slug(preferredProfileId)}` : '';
  const chosen = providers.find((item) => item.id === wanted) || providers[0];
  return { provider: chosen.id, model: chosen.model };
}

export default function wendaflowModels(pi) {
  let providers = [];
  try { providers = JSON.parse(process.env.WENDAFLOW_PI_PROVIDERS || '[]'); } catch { providers = []; }
  for (const item of Array.isArray(providers) ? providers : []) {
    if (!item?.id || !item.baseUrl || !item.api || !item.model) continue;
    pi.registerProvider(item.id, {
      name: item.name,
      baseUrl: item.baseUrl,
      apiKey: item.apiKey,
      api: item.api,
      authHeader: item.api === 'openai-completions' || item.api === 'openai-responses',
      models: [{ type: 'chat', id: item.model, name: item.model, reasoning: !!item.reasoning, input: Array.isArray(item.input) ? item.input : ['text', 'image'], contextWindow: Number(item.contextWindow) || 128000, maxTokens: Number(item.maxTokens) || 16384, cost: item.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    });
  }
}
