import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEndpointInput,
  buildEndpointCandidates,
  extractModelIds,
  probeModelConnection,
} from './model-probe.mjs';

function mockFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const handler = routes[url];
    if (!handler) return { ok: false, status: 404, text: async () => JSON.stringify({ error: { message: 'Not found' } }) };
    const res = typeof handler === 'function' ? handler(init) : handler;
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      text: async () => (typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? {})),
    };
  };
  return { fetchImpl, calls };
}

test('normalizeEndpointInput strips pasted API suffixes and fills schemes', () => {
  assert.equal(normalizeEndpointInput('https://api.openai.com/v1/chat/completions'), 'https://api.openai.com/v1');
  assert.equal(normalizeEndpointInput('https://api.openai.com/v1/responses/'), 'https://api.openai.com/v1');
  assert.equal(normalizeEndpointInput('https://api.anthropic.com/v1/messages'), 'https://api.anthropic.com/v1');
  assert.equal(normalizeEndpointInput('api.deepseek.com'), 'https://api.deepseek.com');
  assert.equal(normalizeEndpointInput('127.0.0.1:11434/api/tags', { local: true }), 'http://127.0.0.1:11434');
});

test('buildEndpointCandidates prefers /v1 for bare origins and keeps existing version paths', () => {
  assert.deepEqual(buildEndpointCandidates('https://api.deepseek.com', { format: 'responses' }), [
    'https://api.deepseek.com/v1',
    'https://api.deepseek.com',
  ]);
  assert.deepEqual(buildEndpointCandidates('https://ark.cn-beijing.volces.com/api/v3', { format: 'openai-compatible' }), [
    'https://ark.cn-beijing.volces.com/api/v3',
  ]);
  assert.deepEqual(buildEndpointCandidates('https://generativelanguage.googleapis.com', { format: 'gemini' }), [
    'https://generativelanguage.googleapis.com/v1beta',
    'https://generativelanguage.googleapis.com',
  ]);
});

test('extractModelIds handles OpenAI, Anthropic, Gemini and Ollama payloads', () => {
  assert.deepEqual(extractModelIds({ data: [{ id: 'gpt-5.4' }, { id: 'gpt-4.1' }, { id: 'gpt-5.4' }] }), ['gpt-5.4', 'gpt-4.1']);
  assert.deepEqual(extractModelIds({
    models: [
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    ],
  }, 'gemini'), ['gemini-2.5-flash']);
  assert.deepEqual(extractModelIds({ models: [{ name: 'qwen2.5:7b' }, { name: 'llama3.2' }] }, 'ollama'), ['qwen2.5:7b', 'llama3.2']);
});

test('probeModelConnection auto-adds /v1 and switches responses to openai-compatible when /responses is 404', async () => {
  const { fetchImpl } = mockFetch({
    'https://api.deepseek.com/v1/models': { status: 200, body: { data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] } },
    'https://api.deepseek.com/v1/responses': { status: 404, body: { error: { message: 'Route not found' } } },
    'https://api.deepseek.com/v1/chat/completions': { status: 200, body: { choices: [{ message: { content: 'hi' } }] } },
  });
  const result = await probeModelConnection({
    endpoint: 'https://api.deepseek.com',
    format: 'responses',
    apiKey: 'sk-test',
    model: 'deepseek-chat',
  }, { fetchImpl });

  assert.equal(result.ok, true);
  assert.equal(result.endpoint, 'https://api.deepseek.com/v1');
  assert.equal(result.endpointAdjusted, true);
  assert.equal(result.format, 'openai-compatible');
  assert.equal(result.formatAdjusted, true);
  assert.deepEqual(result.models, ['deepseek-chat', 'deepseek-reasoner']);
  assert.equal(result.modelInList, true);
  assert.equal(result.modelVerified, true);
});

test('probeModelConnection keeps discovered models list even when the typed model fails verification', async () => {
  const { fetchImpl } = mockFetch({
    'https://api.openai.com/v1/models': { status: 200, body: { data: [{ id: 'gpt-5.4' }, { id: 'gpt-4.1-mini' }] } },
    'https://api.openai.com/v1/responses': { status: 404, body: { error: { message: 'Model does not exist' } } },
    'https://api.openai.com/v1/chat/completions': { status: 404, body: { error: { message: 'Model does not exist' } } },
  });
  const result = await probeModelConnection({
    endpoint: 'https://api.openai.com/v1',
    format: 'responses',
    apiKey: 'sk-test',
    model: 'nonexistent-model',
  }, { fetchImpl });

  assert.equal(result.ok, true);
  assert.deepEqual(result.models, ['gpt-5.4', 'gpt-4.1-mini']);
  assert.equal(result.modelInList, false);
  assert.equal(result.modelVerified, false);
  assert.match(result.modelError, /Model does not exist/);
});

test('probeModelConnection verifies providers that disable /models via direct model call', async () => {
  const { fetchImpl } = mockFetch({
    'https://custom.example.com/v1/models': { status: 404, body: { error: 'disabled' } },
    'https://custom.example.com/v1/messages': (init) => {
      assert.equal(init.headers['x-api-key'], 'ant-key');
      return { status: 200, body: { content: [{ type: 'text', text: 'ok' }] } };
    },
  });
  const result = await probeModelConnection({
    endpoint: 'https://custom.example.com/v1',
    format: 'anthropic',
    apiKey: 'ant-key',
    model: 'claude-sonnet-4-5',
  }, { fetchImpl });

  assert.equal(result.ok, true);
  assert.deepEqual(result.models, []);
  assert.equal(result.modelVerified, true);
  assert.equal(result.format, 'anthropic');
});

test('probeModelConnection supports Gemini listing and rejects invalid API keys clearly', async () => {
  const { fetchImpl } = mockFetch({
    'https://generativelanguage.googleapis.com/v1beta/models?key=good-key': {
      status: 200,
      body: { models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] },
    },
    'https://api.openai.com/v1/models': { status: 401, body: { error: { message: 'Invalid API key' } } },
  });
  const ok = await probeModelConnection({
    endpoint: '',
    format: 'gemini',
    apiKey: 'good-key',
    model: '',
  }, { fetchImpl });
  assert.equal(ok.endpoint, 'https://generativelanguage.googleapis.com/v1beta');
  assert.deepEqual(ok.models, ['gemini-2.5-flash']);

  await assert.rejects(
    probeModelConnection({ endpoint: 'https://api.openai.com/v1', format: 'openai-compatible', apiKey: 'bad-key' }, { fetchImpl }),
    /Invalid API key/,
  );
});

test('probeModelConnection probes Ollama /api/tags and falls back to local /v1/models', async () => {
  const { fetchImpl: ollamaFetch } = mockFetch({
    'http://127.0.0.1:11434/api/tags': { status: 200, body: { models: [{ name: 'qwen2.5:7b' }] } },
  });
  const ollama = await probeModelConnection({ endpoint: '127.0.0.1:11434', local: true, model: 'qwen2.5:7b' }, { fetchImpl: ollamaFetch });
  assert.equal(ollama.ok, true);
  assert.equal(ollama.endpoint, 'http://127.0.0.1:11434');
  assert.deepEqual(ollama.models, ['qwen2.5:7b']);
  assert.equal(ollama.modelVerified, true);

  const { fetchImpl: lmStudioFetch } = mockFetch({
    'http://127.0.0.1:1234/v1/models': { status: 200, body: { data: [{ id: 'local-qwen3' }] } },
  });
  const lmStudio = await probeModelConnection({ endpoint: 'http://127.0.0.1:1234', local: true }, { fetchImpl: lmStudioFetch });
  assert.equal(lmStudio.ok, true);
  assert.deepEqual(lmStudio.models, ['local-qwen3']);
});
