import test from 'node:test';
import assert from 'node:assert/strict';
import wendaflowModels, { piProvidersFromProfiles, fallbackPiModel, modelFacts } from './pi-models.mjs';

test('Wendaflow model connections become Pi providers with the matching API', () => {
  const providers = piProvidersFromProfiles([
    { id: 'cloud-default', name: 'OpenAI', format: 'responses', endpoint: 'https://api.openai.com/v1/', model: 'gpt-5.4', apiKey: 'sk-1' },
    { id: 'ds', name: 'DeepSeek', format: 'openai-compatible', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'sk-2' },
    { id: 'claude', name: 'Claude', format: 'anthropic', endpoint: 'https://api.anthropic.com', model: 'claude-opus-5-5', apiKey: 'sk-3' },
    { id: 'local-default', name: 'Qwen', endpoint: 'http://127.0.0.1:11434', model: 'qwen2.5:7b', local: true },
  ]);
  assert.deepEqual(providers.map((item) => [item.id, item.api, item.baseUrl]), [
    ['wendaflow-cloud-default', 'openai-responses', 'https://api.openai.com/v1'],
    ['wendaflow-ds', 'openai-completions', 'https://api.deepseek.com/v1'],
    ['wendaflow-claude', 'anthropic-messages', 'https://api.anthropic.com'],
    ['wendaflow-local-default', 'openai-completions', 'http://127.0.0.1:11434/v1'],
  ]);
  assert.equal(providers[3].apiKey, 'ollama');
});

test('profiles Pi could not use are skipped, and ids stay unique', () => {
  const providers = piProvidersFromProfiles([
    { id: 'a', format: 'responses', endpoint: 'https://x/v1', model: 'm', apiKey: '' },
    { id: 'b', format: 'unknown', endpoint: 'https://x/v1', model: 'm', apiKey: 'k' },
    { id: 'c', format: 'responses', endpoint: '', model: 'm', apiKey: 'k' },
    { id: 'same', format: 'responses', endpoint: 'https://x/v1', model: 'm', apiKey: 'k' },
    { id: 'same', format: 'responses', endpoint: 'https://y/v1', model: 'n', apiKey: 'k' },
    null,
  ]);
  assert.deepEqual(providers.map((item) => item.id), ['wendaflow-same', 'wendaflow-same-2']);
});

test('the fallback prefers the connection selected in Wendaflow, else the first one', () => {
  const providers = piProvidersFromProfiles([
    { id: 'one', format: 'responses', endpoint: 'https://x/v1', model: 'm1', apiKey: 'k' },
    { id: 'two', format: 'responses', endpoint: 'https://x/v1', model: 'm2', apiKey: 'k' },
  ]);
  assert.deepEqual(fallbackPiModel(providers, 'two'), { provider: 'wendaflow-two', model: 'm2' });
  assert.deepEqual(fallbackPiModel(providers, 'missing'), { provider: 'wendaflow-one', model: 'm1' });
  assert.equal(fallbackPiModel([], 'two'), null);
});

test('the Pi extension registers each provider it receives through the environment', () => {
  const registered = [];
  const previous = process.env.WENDAFLOW_PI_PROVIDERS;
  process.env.WENDAFLOW_PI_PROVIDERS = JSON.stringify(piProvidersFromProfiles([{ id: 'x', name: 'X', format: 'openai-compatible', endpoint: 'https://x/v1', model: 'm', apiKey: 'k' }]));
  try { wendaflowModels({ registerProvider: (id, config) => registered.push([id, config]) }); }
  finally { if (previous === undefined) delete process.env.WENDAFLOW_PI_PROVIDERS; else process.env.WENDAFLOW_PI_PROVIDERS = previous; }
  assert.equal(registered.length, 1);
  assert.equal(registered[0][0], 'wendaflow-x');
  assert.equal(registered[0][1].apiKey, 'k');
  assert.equal(registered[0][1].models[0].id, 'm');
});

test('model facts come from the Pi catalog when it knows the model, else from the model family', () => {
  const catalog = [{ id: 'deepseek-flash', contextWindow: 1000000, maxTokens: 384000, reasoning: true, input: ['text', 'image'], cost: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0 } }];
  const known = modelFacts('DeepSeek-Flash', 'openai-compatible', catalog);
  assert.equal(known.contextWindow, 1000000);
  assert.equal(known.cost.output, 1.2);
  assert.equal(modelFacts('gemini-2.5-pro', 'gemini').reasoning, true);
  assert.equal(modelFacts('qwen3-32b', 'openai-compatible').reasoning, true);
  assert.equal(modelFacts('deepseek-chat', 'openai-compatible').reasoning, false);
  assert.deepEqual(modelFacts('qwen2.5:7b', 'ollama').input, ['text']);
  assert.equal(modelFacts('claude-opus-5-5', 'anthropic').contextWindow, 200000);
  const [provider] = piProvidersFromProfiles([{ id: 'ds', format: 'openai-compatible', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-flash', apiKey: 'k' }], catalog);
  assert.equal(provider.maxTokens, 384000);
  assert.equal(provider.reasoning, true);
});
