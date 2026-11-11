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
