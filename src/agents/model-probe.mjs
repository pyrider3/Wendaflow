// One-click probe for a model connection (cloud or local Ollama): normalizes pasted URLs,
// detects the working endpoint and API format, lists available models, and verifies the chosen model.

const DEFAULT_GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const PATH_SUFFIX_RE = /\/(?:chat\/completions|responses|messages|models|api\/chat|api\/tags|api\/generate)\/?$/i;

function trimSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function normalizeEndpointInput(rawEndpoint, { format = '', local = false } = {}) {
  let value = trimSlash(rawEndpoint);
  if (!value) {
    if (local) return 'http://127.0.0.1:11434';
    if (format === 'gemini') return DEFAULT_GEMINI_BASE;
    return '';
  }
  if (!/^https?:\/\//i.test(value)) {
    const isLocalHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(value);
    value = `${local || isLocalHost ? 'http' : 'https'}://${value}`;
  }
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(PATH_SUFFIX_RE, '').replace(/\/+$/, '');
  return url.toString().replace(/\/+$/, '');
}

export function buildEndpointCandidates(rawEndpoint, { format = '', local = false } = {}) {
  const normalized = normalizeEndpointInput(rawEndpoint, { format, local });
  if (!normalized) return [];
  const url = new URL(normalized);
  const path = url.pathname.replace(/\/+$/, '');
  const list = [];
  const add = (candidate) => {
    const clean = trimSlash(candidate);
    if (clean && !list.includes(clean)) list.push(clean);
  };

  if (local) {
    add(normalized);
    if (/\/v1$/i.test(path)) add(normalized.replace(/\/v1$/i, ''));
    return list;
  }

  if (format === 'gemini' || /generativelanguage\.googleapis\.com/i.test(url.hostname)) {
    if (!path || path === '/') {
      add(`${normalized}/v1beta`);
      add(normalized);
    } else {
      add(normalized);
      if (!/\/v\d+(?:beta)?$/i.test(path)) add(`${normalized}/v1beta`);
    }
    return list;
  }

  if (!path || path === '/') {
    // Prefer /v1 for bare origins (e.g. https://api.deepseek.com -> https://api.deepseek.com/v1),
    // then fall back to the bare origin for custom gateways without /v1.
    add(`${normalized}/v1`);
    add(normalized);
  } else {
    add(normalized);
    if (!/\/v\d+(?:beta)?$/i.test(path) && !/\/api\/v\d+/i.test(path)) add(`${normalized}/v1`);
  }
  return list;
}

export function extractModelIds(payload, format = '') {
  if (!payload || typeof payload !== 'object') return [];
  const raw = [];
  if (Array.isArray(payload.data)) {
    for (const item of payload.data) {
      const id = typeof item === 'string' ? item : item?.id || item?.name;
      if (id) raw.push(String(id).trim());
    }
  } else if (Array.isArray(payload.models)) {
    for (const item of payload.models) {
      if (typeof item === 'string') { raw.push(item.trim()); continue; }
      if (format === 'gemini' && Array.isArray(item?.supportedGenerationMethods) && !item.supportedGenerationMethods.includes('generateContent')) continue;
      const id = item?.name || item?.id || item?.model;
      if (!id) continue;
      const cleaned = format === 'gemini' ? String(id).replace(/^models\//, '') : String(id);
      if (cleaned.trim()) raw.push(cleaned.trim());
    }
  } else if (Array.isArray(payload)) {
    for (const item of payload) {
      const id = typeof item === 'string' ? item : item?.id || item?.name;
      if (id) raw.push(String(id).trim());
    }
  }
  return [...new Set(raw.filter(Boolean))];
}

function errorMessageFromBody(text, status) {
  try {
    const parsed = JSON.parse(text);
    const msg = parsed?.error?.message || parsed?.message || parsed?.error;
    if (typeof msg === 'string' && msg.trim()) return msg.trim().slice(0, 220);
  } catch {}
  const plain = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain ? `${plain.slice(0, 160)} (HTTP ${status})` : `HTTP ${status}`;
}

async function fetchJson(fetchImpl, url, init, timeoutMs) {
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { ok: response.ok, status: response.status, json, text };
}

function inferFormatOrder(requestedFormat, endpoint) {
  const host = (() => { try { return new URL(endpoint).hostname.toLowerCase(); } catch { return ''; } })();
  const order = [];
  const add = (fmt) => { if (fmt && !order.includes(fmt)) order.push(fmt); };
  if (['responses', 'openai-compatible', 'anthropic', 'gemini'].includes(requestedFormat)) add(requestedFormat);
  if (/anthropic\.com$/i.test(host)) add('anthropic');
  if (/generativelanguage\.googleapis\.com$/i.test(host)) add('gemini');
  add('openai-compatible');
  add('anthropic');
  add('gemini');
  return order;
}

async function probeListForFormat(fetchImpl, base, format, apiKey, timeoutMs) {
  if (format === 'gemini') {
    const res = await fetchJson(fetchImpl, `${base}/models?key=${encodeURIComponent(apiKey)}`, { method: 'GET' }, timeoutMs);
    const models = res.ok ? extractModelIds(res.json, 'gemini') : [];
    return { ...res, models };
  }
  if (format === 'anthropic') {
    const res = await fetchJson(fetchImpl, `${base}/models`, {
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    }, timeoutMs);
    const models = res.ok ? extractModelIds(res.json, 'anthropic') : [];
    return { ...res, models };
  }
  const res = await fetchJson(fetchImpl, `${base}/models`, {
    method: 'GET',
    headers: { authorization: `Bearer ${apiKey}` },
  }, timeoutMs);
  const models = res.ok ? extractModelIds(res.json, format) : [];
  return { ...res, models };
}

async function verifyCallForFormat(fetchImpl, base, format, apiKey, model, timeoutMs) {
  if (format === 'gemini') {
    return fetchJson(fetchImpl, `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
    }, timeoutMs);
  }
  if (format === 'anthropic') {
    return fetchJson(fetchImpl, `${base}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'hi' }] }),
    }, timeoutMs);
  }
  if (format === 'responses') {
    return fetchJson(fetchImpl, `${base}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: [{ role: 'user', content: 'hi' }], max_output_tokens: 16, store: false }),
    }, timeoutMs);
  }
  const chatRes = await fetchJson(fetchImpl, `${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 16 }),
  }, timeoutMs);
  if (!chatRes.ok && chatRes.status === 400 && /max_completion_tokens|max_tokens/i.test(chatRes.text)) {
    return fetchJson(fetchImpl, `${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_completion_tokens: 16 }),
    }, timeoutMs);
  }
  return chatRes;
}

export async function probeModelConnection(
  { endpoint = '', format = 'openai-compatible', apiKey = '', model = '', local = false } = {},
  { fetchImpl = globalThis.fetch, validateUrl = null, timeoutMs = 12_000 } = {},
) {
  const started = Date.now();
  const rawEndpoint = trimSlash(endpoint);
  const cleanKey = String(apiKey || '').trim();
  const cleanModel = String(model || '').trim();

  if (local) {
    const candidates = buildEndpointCandidates(rawEndpoint, { local: true });
    if (!candidates.length) throw new Error('请先填写服务地址');
    if (validateUrl) for (const candidate of candidates) validateUrl(candidate);
    let lastError = '无法连接本机模型服务';
    for (const base of candidates) {
      try {
        const tags = await fetchJson(fetchImpl, `${base}/api/tags`, { method: 'GET' }, timeoutMs);
        if (tags.ok) {
          const models = extractModelIds(tags.json, 'ollama');
          return {
            ok: true,
            endpoint: base,
            endpointAdjusted: rawEndpoint !== '' && base !== rawEndpoint,
            format: 'ollama',
            formatAdjusted: false,
            models,
            model: cleanModel,
            modelInList: cleanModel ? models.includes(cleanModel) : null,
            modelVerified: cleanModel ? models.includes(cleanModel) : null,
            latencyMs: Date.now() - started,
          };
        }
        lastError = errorMessageFromBody(tags.text, tags.status);
      } catch (error) {
        lastError = error?.name === 'TimeoutError' ? '连接超时' : error.message || String(error);
      }
      // Fallback: local OpenAI-compatible servers (LM Studio, vLLM, llama.cpp).
      const v1Base = /\/v1$/i.test(base) ? base : `${base}/v1`;
      try {
        const res = await fetchJson(fetchImpl, `${v1Base}/models`, { method: 'GET' }, timeoutMs);
        if (res.ok) {
          const models = extractModelIds(res.json, 'openai-compatible');
          return {
            ok: true,
            endpoint: base,
            endpointAdjusted: rawEndpoint !== '' && base !== rawEndpoint,
            format: 'ollama',
            formatAdjusted: false,
            models,
            model: cleanModel,
            modelInList: cleanModel ? models.includes(cleanModel) : null,
            modelVerified: cleanModel ? models.includes(cleanModel) : null,
            latencyMs: Date.now() - started,
          };
        }
      } catch {}
    }
    throw new Error(lastError);
  }

  if (!rawEndpoint && format !== 'gemini') throw new Error('请先填写接口地址');
  if (!cleanKey) throw new Error('请先填写 API 密钥');

  const initialCandidates = buildEndpointCandidates(rawEndpoint, { format, local: false });
  if (!initialCandidates.length) throw new Error('请先填写接口地址');
  if (validateUrl) for (const candidate of initialCandidates) validateUrl(candidate);

  const formats = inferFormatOrder(format, initialCandidates[0]);
  let foundEndpoint = '';
  let foundFormat = format;
  let foundModels = [];
  let listSucceeded = false;
  let authFailure = '';
  let lastError = '无法连接到该接口地址';
  const triedList = new Set();

  for (const candidateFormat of formats) {
    const candidates = buildEndpointCandidates(rawEndpoint, { format: candidateFormat, local: false });
    if (validateUrl) for (const candidate of candidates) validateUrl(candidate);
    const listKind = candidateFormat === 'responses' ? 'openai-compatible' : candidateFormat;
    for (const base of candidates) {
      const key = `${listKind}|${base}`;
      if (triedList.has(key)) continue;
      triedList.add(key);
      try {
        const res = await probeListForFormat(fetchImpl, base, candidateFormat, cleanKey, timeoutMs);
        if (res.ok && res.json && typeof res.json === 'object') {
          foundEndpoint = base;
          foundFormat = candidateFormat;
          foundModels = res.models;
          listSucceeded = true;
          break;
        }
        if (res.status === 401 || res.status === 403) {
          authFailure ||= errorMessageFromBody(res.text, res.status);
          break;
        }
        lastError = errorMessageFromBody(res.text, res.status);
      } catch (error) {
        lastError = error?.name === 'TimeoutError' ? '连接超时' : error.message || String(error);
      }
    }
    if (listSucceeded) break;
  }

  let modelVerified = null;
  let modelError = '';
  let resolvedEndpoint = foundEndpoint || initialCandidates[0];
  let resolvedFormat = listSucceeded ? foundFormat : format;

  // Verify the typed model (and confirm Responses vs Chat Completions, or probe providers without /models).
  if (cleanModel) {
    const callFormats = [];
    const addCallFormat = (fmt) => { if (fmt && !callFormats.includes(fmt)) callFormats.push(fmt); };
    addCallFormat(resolvedFormat);
    if (resolvedFormat === 'responses') addCallFormat('openai-compatible');
    else if (resolvedFormat === 'openai-compatible') addCallFormat('responses');
    if (!listSucceeded) {
      for (const fmt of formats) addCallFormat(fmt);
    }

    const callEndpoints = listSucceeded ? [resolvedEndpoint] : initialCandidates;
    let verified = false;
    let callAuthFailure = '';
    for (const fmt of callFormats) {
      for (const base of callEndpoints) {
        try {
          const res = await verifyCallForFormat(fetchImpl, base, fmt, cleanKey, cleanModel, timeoutMs);
          if (res.ok) {
            resolvedEndpoint = base;
            resolvedFormat = fmt;
            verified = true;
            modelVerified = true;
            break;
          }
          if (res.status === 401 || res.status === 403) {
            callAuthFailure = errorMessageFromBody(res.text, res.status);
            modelError = callAuthFailure;
            continue;
          }
          modelError = errorMessageFromBody(res.text, res.status);
          // Only try switching between Responses and Chat Completions when the route itself is unsupported (404/405/501)
          // or when /models was unavailable.
          if (listSucceeded && ![404, 405, 501].includes(res.status)) break;
        } catch (error) {
          modelError = error?.name === 'TimeoutError' ? '连接超时' : error.message || String(error);
        }
      }
      if (verified) break;
    }
    if (!verified) {
      if (!listSucceeded) throw new Error(callAuthFailure || authFailure || modelError || lastError);
      modelVerified = false;
    }
  } else if (!listSucceeded) {
    throw new Error(authFailure || lastError);
  }

  return {
    ok: true,
    endpoint: resolvedEndpoint,
    endpointAdjusted: rawEndpoint !== '' && resolvedEndpoint !== rawEndpoint,
    format: resolvedFormat,
    formatAdjusted: resolvedFormat !== format,
    models: foundModels,
    model: cleanModel,
    modelInList: cleanModel && foundModels.length ? foundModels.includes(cleanModel) : null,
    modelVerified,
    modelError: modelVerified === false ? modelError : '',
    latencyMs: Date.now() - started,
  };
}
