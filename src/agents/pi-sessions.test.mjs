import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listPiSessions, readPiSession, unwrapPrompt } from './pi-sessions.mjs';

const line = (value) => JSON.stringify(value);
const session = (id, cwd, prompt, answer) => [
  line({ type: 'session', id, timestamp: '2026-11-04T01:00:00Z', cwd }),
  line({ type: 'message', message: { role: 'system', content: 'x'.repeat(3000) } }),
  line({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: prompt }] } }),
  line({ type: 'message', message: { role: 'assistant', content: [{ type: 'toolCall', name: 'bash', arguments: { command: 'ls' } }, { type: 'text', text: answer }] } }),
].join('\n') + '\n';

test('Wendaflow task wrappers are removed from the prompt', () => {
  assert.equal(unwrapPrompt('这是上下文\n\n---\n\n当前需要执行的任务：\n列出文件\n\n请在最终答复中说明你实际使用了哪些上下文节点'), '列出文件');
  assert.equal(unwrapPrompt('plain terminal prompt'), 'plain terminal prompt');
});

test('Pi sessions are listed newest first, filtered by folder and text, and read back as card events', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wf-pi-'));
  try {
    await mkdir(path.join(root, '--a--')); await mkdir(path.join(root, '--b--'));
    await writeFile(path.join(root, '--a--', '2026_11111111-aaaa.jsonl'), session('11111111-aaaa', '/work/a', '当前需要执行的任务：\n修复登录\n\n请在最终答复中说明你实际使用了哪些上下文节点', '已修复'));
    await new Promise((resolve) => setTimeout(resolve, 15));
    await writeFile(path.join(root, '--b--', '2026_22222222-bbbb.jsonl'), session('22222222-bbbb', '/work/b', 'refactor the parser', 'done'));
    const all = await listPiSessions({ root });
    assert.deepEqual(all.map((item) => item.id), ['22222222-bbbb', '11111111-aaaa']);
    assert.equal(all[1].title, '修复登录'); assert.equal(all[1].preview, '已修复');
    assert.deepEqual((await listPiSessions({ root, cwd: '/work/a' })).map((item) => item.id), ['11111111-aaaa']);
    assert.deepEqual((await listPiSessions({ root, query: 'PARSER' })).map((item) => item.id), ['22222222-bbbb']);
    const detail = await readPiSession('11111111-aaaa', { root });
    assert.deepEqual(detail.events.map((event) => event.type), ['user', 'command', 'message']);
    assert.equal(detail.output, '已修复'); assert.equal(detail.prompt, '修复登录');
    await assert.rejects(() => readPiSession('../etc/passwd', { root }), /无效/);
    assert.deepEqual(await listPiSessions({ root: path.join(root, 'missing') }), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Pi usage adds up cost and tokens per day and per model, skipping old sessions', async () => {
  const { piUsage } = await import('./pi-sessions.mjs');
  const { mkdtemp, mkdir, writeFile, utimes } = await import('node:fs/promises');
  const root = await mkdtemp(path.join(os.tmpdir(), 'wf-pi-usage-'));
  await mkdir(path.join(root, '--project--'));
  const now = Date.parse('2026-11-20T12:00:00Z');
  const line = (at, provider, model, cost, input, output) => JSON.stringify({ type: 'message', timestamp: at, message: { role: 'assistant', provider, model, usage: { input, output, cacheRead: 0, cacheWrite: 0, cost: { total: cost } } } });
  await writeFile(path.join(root, '--project--', 'a.jsonl'), [JSON.stringify({ type: 'message', message: { role: 'user', content: 'hi' } }), line('2026-11-19T10:00:00Z', 'anthropic', 'claude', 0.5, 100, 20), line('2026-11-20T10:00:00Z', 'openai', 'gpt', 0.25, 50, 10), line('2026-11-20T11:00:00Z', 'anthropic', 'claude', 0.25, 10, 5)].join('\n'));
  await writeFile(path.join(root, '--project--', 'old.jsonl'), line('2026-09-01T10:00:00Z', 'openai', 'gpt', 9, 1, 1));
  await utimes(path.join(root, '--project--', 'old.jsonl'), new Date('2026-09-01'), new Date('2026-09-01'));
  const usage = await piUsage({ root, days: 7, now });
  assert.equal(usage.totals.cost, 1);
  assert.equal(usage.totals.turns, 3);
  assert.equal(usage.totals.sessions, 1);
  assert.deepEqual(usage.models.map((item) => [item.model, item.cost]), [['anthropic/claude', 0.75], ['openai/gpt', 0.25]]);
  assert.equal(usage.days.find((item) => item.date === '2026-11-20').cost, 0.5);
  assert.equal(usage.days.length, 8);
});

test('a Pi session file is found by id across folders, and the cached catalog is flattened', async () => {
  const { findPiSessionFile, piModelCatalog } = await import('./pi-sessions.mjs');
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const agent = await mkdtemp(path.join(os.tmpdir(), 'wf-pi-agent-'));
  const root = path.join(agent, 'sessions');
  await mkdir(path.join(root, '--copy--'), { recursive: true });
  await writeFile(path.join(root, '--copy--', '2026-11-20T10-00-00_abc123-def.jsonl'), '');
  assert.equal(await findPiSessionFile('abc123-def', root), path.join(root, '--copy--', '2026-11-20T10-00-00_abc123-def.jsonl'));
  assert.equal(await findPiSessionFile('missing-id', root), '');
  assert.equal(await findPiSessionFile('../etc', root), '');
  await writeFile(path.join(agent, 'models-store.json'), JSON.stringify({ openai: { models: [{ id: 'gpt-x', contextWindow: 400000 }] }, deepseek: { models: [{ id: 'ds', contextWindow: 1000000 }] } }));
  assert.deepEqual((await piModelCatalog(agent)).map((item) => item.id), ['gpt-x', 'ds']);
});

test('the Pi session tree keeps user turns, answers, compactions and branches, and skips tool noise', async () => {
  const { summarizePiTree } = await import('./pi-sessions.mjs');
  const msg = (id, role, text, children = [], label) => ({ entry: { type: 'message', id, message: { role, content: [{ type: 'text', text }] } }, children, ...(label ? { label } : {}) });
  const tool = (id, children) => ({ entry: { type: 'message', id, message: { role: 'toolResult', content: [] } }, children });
  const tree = [msg('u1', 'user', 'hello', [msg('a1', 'assistant', 'hi there', [
    tool('t1', [msg('u2', 'user', 'branch one', [], 'try-1')]),
    { entry: { type: 'compaction', id: 'c1', summary: 'earlier talk', tokensBefore: 9000 }, children: [msg('u3', 'user', 'branch two')] },
  ])])];
  const [root] = summarizePiTree(tree, 'u3', ['u1', 'u3']);
  assert.equal(root.kind, 'user'); assert.equal(root.forkable, true); assert.equal(root.active, true);
  const answer = root.children[0];
  assert.equal(answer.kind, 'assistant');
  assert.deepEqual(answer.children.map((node) => [node.id, node.kind]), [['u2', 'user'], ['c1', 'compaction']]);
  assert.equal(answer.children[0].label, 'try-1'); assert.equal(answer.children[0].active, false); assert.equal(answer.children[0].forkable, false);
  assert.equal(answer.children[1].tokensBefore, 9000);
  assert.equal(answer.children[1].children[0].active, true);
});
