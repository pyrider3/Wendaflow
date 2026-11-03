import test from 'node:test';
import assert from 'node:assert/strict';
import * as gateway from '../modelGateway.js';

const msgs = [{ role: 'user', content: 'hi' }];
async function body(fn, base, chatOptions) {
  let sent = {};
  const real = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { sent = JSON.parse(init.body); return new Response(new ReadableStream({ start(c) { c.close(); } }), { status: 200 }); };
  try { await fn({ ...base, apiKey: 'k', messages: msgs, chatOptions, onToken() {}, onThinking() {} }); } catch { /* empty stream */ } finally { globalThis.fetch = real; }
  return JSON.stringify(sent);
}
const on = (reasoning) => ({ reasoning, thinking: reasoning !== 'none', temperature: 0.7 });

const cases = [
  ['responses', gateway.streamOpenAIResponses, { endpoint: 'https://x/v1', model: 'gpt-5.4' }, { format: 'responses', model: 'gpt-5.4' }],
  ['openai-compatible', gateway.streamOpenAICompatible, { endpoint: 'https://x/v1', model: 'some-model' }, { format: 'openai-compatible', model: 'some-model', endpoint: 'https://x/v1' }],
  ['doubao', gateway.streamOpenAICompatible, { endpoint: 'https://ark.volces.com/v3', model: 'doubao-x' }, { format: 'openai-compatible', model: 'doubao-x', endpoint: 'https://ark.volces.com/v3' }],
  ['anthropic', gateway.streamAnthropic, { endpoint: 'https://x/v1', model: 'claude' }, { format: 'anthropic', model: 'claude' }],
  ['gemini', gateway.streamGemini, { model: 'gemini-x' }, { format: 'gemini', model: 'gemini-x' }],
];

for (const [name, fn, base, profile] of cases) {
  test(`chatOptionSupport.levels matches what ${name} requests send`, async () => {
    const low = await body(fn, base, on('low'));
    const high = await body(fn, base, on('high'));
    assert.equal(gateway.chatOptionSupport(profile).levels, low !== high);
  });
  test(`chatOptionSupport.toggle matches what ${name} requests send`, async () => {
    const off = await body(fn, base, on('none'));
    const low = await body(fn, base, on('low'));
    assert.equal(gateway.chatOptionSupport(profile).toggle, off !== low);
  });
}
