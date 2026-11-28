import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openJobStream } from './job-stream.js';

function fakeEventSourceClass() {
  const instances = [];
  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.closed = false;
      instances.push(this);
    }
    emit(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
    fail() { this.onerror?.(new Event('error')); }
    close() { this.closed = true; }
  }
  return { FakeEventSource, instances };
}

test('openJobStream delivers SSE states and coalesces queued bursts to the latest state', async () => {
  const { FakeEventSource, instances } = fakeEventSourceClass();
  const stream = openJobStream('http://127.0.0.1:43123', 'job-1', {
    EventSource: FakeEventSource,
    fetch: async () => { throw new Error('should not poll while SSE works'); },
    quietMs: 500,
  });
  assert.equal(instances.length, 1);
  assert.equal(instances[0].url, 'http://127.0.0.1:43123/agent/stream?id=job-1');

  const pending = stream.next();
  instances[0].emit({ id: 'job-1', rev: 2, status: 'running' });
  assert.deepEqual(await pending, { id: 'job-1', rev: 2, status: 'running' });

  instances[0].emit({ id: 'job-1', rev: 3, status: 'running' });
  instances[0].emit({ id: 'job-1', rev: 4, status: 'done' });
  assert.deepEqual(await stream.next(), { id: 'job-1', rev: 4, status: 'done' });

  stream.close();
  assert.equal(instances[0].closed, true);
});

test('openJobStream resolves a waiting next() immediately on SSE error via fallback poll', async () => {
  const { FakeEventSource, instances } = fakeEventSourceClass();
  let calls = 0;
  const fetchMock = async (url) => {
    calls += 1;
    assert.equal(url, 'http://127.0.0.1:43123/agent/status?id=job-2');
    return { ok: true, json: async () => ({ id: 'job-2', rev: 5 + calls, status: calls === 1 ? 'running' : 'done' }) };
  };
  const stream = openJobStream('http://127.0.0.1:43123', 'job-2', {
    EventSource: FakeEventSource,
    fetch: fetchMock,
    pollMs: 10,
    quietMs: 5000,
  });

  const started = Date.now();
  const pending = stream.next();
  instances[0].fail();
  const first = await pending;
  assert.equal(Date.now() - started < 500, true, 'should recover immediately instead of waiting for quietMs');
  assert.deepEqual(first, { id: 'job-2', rev: 6, status: 'running' });
  assert.equal(calls, 1);
  assert.equal(instances[0].closed, true);

  const second = await stream.next();
  assert.deepEqual(second, { id: 'job-2', rev: 7, status: 'done' });
  assert.equal(calls, 2);
  stream.close();
});

test('openJobStream propagates fallback poll HTTP errors to a waiting next()', async () => {
  const { FakeEventSource, instances } = fakeEventSourceClass();
  const stream = openJobStream('http://127.0.0.1:43123', 'job-missing', {
    EventSource: FakeEventSource,
    fetch: async () => ({ ok: false, json: async () => ({ error: '找不到任务' }) }),
    pollMs: 10,
    quietMs: 5000,
  });

  const pending = stream.next();
  instances[0].fail();
  await assert.rejects(pending, /找不到任务/);
  stream.close();
});

test('openJobStream checks status after quietMs when SSE stays silent and polls when EventSource is absent', async () => {
  const { FakeEventSource } = fakeEventSourceClass();
  let quietCalls = 0;
  const quietStream = openJobStream('http://127.0.0.1:43123', 'job-3', {
    EventSource: FakeEventSource,
    fetch: async () => ({ ok: true, json: async () => ({ id: 'job-3', rev: ++quietCalls, status: 'running' }) }),
    pollMs: 10,
    quietMs: 25,
  });
  assert.deepEqual(await quietStream.next(), { id: 'job-3', rev: 1, status: 'running' });
  quietStream.close();

  const pollOnly = openJobStream('http://127.0.0.1:43123', 'job-4', {
    EventSource: undefined,
    fetch: async () => ({ ok: true, json: async () => ({ id: 'job-4', rev: 1, status: 'done' }) }),
    pollMs: 10,
  });
  assert.deepEqual(await pollOnly.next(), { id: 'job-4', rev: 1, status: 'done' });
  pollOnly.close();
});

test('piModelChoices travels as cardRenderData data, not wrapped inside liveCardActions', async () => {
  const [mainSrc, cardSrc, contentSrc] = await Promise.all([
    readFile(new URL('../main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../cards/CanvasCard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../cards/CardContent.jsx', import.meta.url), 'utf8'),
  ]);
  const actionsBlock = mainSrc.match(/const cardActions=\{[\s\S]*?\};/)?.[0] || '';
  assert.equal(actionsBlock.includes('piModelChoices'), false, 'piModelChoices must not be in cardActions because liveCardActions wraps every entry as a function');
  assert.match(mainSrc, /cardRenderData=useMemo\([\s\S]*piModelChoices[\s\S]*\[uiLanguage,piModelChoices\]/);
  assert.match(cardSrc, /piModelChoices=\{renderData\.piModelChoices\}/);
  assert.match(contentSrc, /piModelChoices\s*=\s*EMPTY_ARRAY/);
});

test('server SSE tracks monotonic job.rev and caches Pi thinking levels with invalidation', async () => {
  const serverSrc = await readFile(new URL('../../server.mjs', import.meta.url), 'utf8');
  assert.match(serverSrc, /function touchJob\(job\)/);
  assert.match(serverSrc, /return \{ id: job\.id, rev: job\.rev \|\| 0,/);
  assert.match(serverSrc, /const now = `\$\{job\.rev \|\| 0\}:\$\{job\.status\}`;/);
  assert.match(serverSrc, /const piThinkingCache = new Map\(\);/);
  assert.match(serverSrc, /function clearPiCaches\(\)[\s\S]*piThinkingCache\.clear\(\)/);
});
