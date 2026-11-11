import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expandMentions, listWorkspaceFiles } from './mentions.mjs';

test('file suggestions rank name matches first and skip build folders', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wf-men-'));
  try {
    await mkdir(path.join(root, 'src')); await mkdir(path.join(root, 'node_modules'));
    for (const file of ['src/server.js', 'src/app.js', 'readme.md', 'node_modules/server.js', 'src/deep/my-server-notes.txt']) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), 'x'); }
    assert.deepEqual((await listWorkspaceFiles(root, 'server')).slice(0, 2), ['src/server.js', 'src/deep/my-server-notes.txt']);
    assert.equal((await listWorkspaceFiles(root, '')).includes('node_modules/server.js'), false);
    assert.deepEqual(await listWorkspaceFiles(root, 'zzz'), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('mentioned files are attached; emails, missing files and paths outside the folder are ignored', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wf-men-'));
  try {
    await writeFile(path.join(root, 'a.txt'), 'hello A'); await writeFile(path.join(root, 'bin.dat'), Buffer.from([1, 0, 2]));
    const task = '当前需要执行的任务：\n看看 @a.txt, 发给 bob@example.com，参考 @missing.txt 和 @../secret 以及 @bin.dat\n\n请在最终答复中说明';
    const out = await expandMentions(`旧上下文里有 @ignored.txt\n\n---\n\n${task}`, root);
    assert.match(out, /@a\.txt\n```\nhello A\n```/);
    for (const bad of ['missing.txt', 'secret', 'bin.dat', 'ignored.txt', 'example.com']) assert.equal(out.includes('@' + bad + '\n' + '`'.repeat(3)), false, bad);
    assert.equal(await expandMentions('no mentions here', root), 'no mentions here');
  } finally { await rm(root, { recursive: true, force: true }); }
});
