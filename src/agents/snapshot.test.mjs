import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { diffSnapshot, fileDiff, rollbackFiles, takeSnapshot } from './snapshot.mjs';

const exists = (file) => stat(file).then(() => true, () => false);

test('snapshot diff lists added, modified and deleted files and rolls them back', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wf-snap-ws-')), dir = await mkdtemp(path.join(os.tmpdir(), 'wf-snap-'));
  try {
    await mkdir(path.join(root, 'src')); await mkdir(path.join(root, 'node_modules'));
    await writeFile(path.join(root, 'keep.txt'), 'same\n'); await writeFile(path.join(root, 'src/a.js'), 'one\ntwo\n'); await writeFile(path.join(root, 'gone.txt'), 'bye\n');
    await writeFile(path.join(root, 'node_modules/x.js'), 'ignored\n');
    const snap = await takeSnapshot(root, dir);
    assert.equal(snap.ok, true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeFile(path.join(root, 'src/a.js'), 'one\nTWO\nthree\n'); await writeFile(path.join(root, 'new.txt'), 'hello\n'); await rm(path.join(root, 'gone.txt'));
    await writeFile(path.join(root, 'node_modules/x.js'), 'changed but ignored\n');
    const { files } = await diffSnapshot(snap);
    assert.deepEqual(files.map((f) => [f.path, f.status]), [['gone.txt', 'deleted'], ['new.txt', 'added'], ['src/a.js', 'modified']]);
    assert.deepEqual([files[2].additions, files[2].deletions], [2, 1]);
    assert.match((await fileDiff(snap, 'src/a.js')).diff, /\+TWO/);
    assert.match((await fileDiff(snap, 'gone.txt')).diff, /-bye/);
    const result = await rollbackFiles(snap, files);
    assert.equal(result.restored.length, 3);
    assert.equal(await readFile(path.join(root, 'src/a.js'), 'utf8'), 'one\ntwo\n');
    assert.equal(await readFile(path.join(root, 'gone.txt'), 'utf8'), 'bye\n');
    assert.equal(await exists(path.join(root, 'new.txt')), false);
    assert.equal((await diffSnapshot(snap)).files.length, 0);
  } finally { await rm(root, { recursive: true, force: true }); await rm(dir, { recursive: true, force: true }); }
});

test('rollback leaves files that changed again after the run', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wf-snap-ws-')), dir = await mkdtemp(path.join(os.tmpdir(), 'wf-snap-'));
  try {
    await writeFile(path.join(root, 'a.txt'), 'one\n');
    const snap = await takeSnapshot(root, dir);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeFile(path.join(root, 'a.txt'), 'agent\n');
    const { files } = await diffSnapshot(snap);
    await writeFile(path.join(root, 'a.txt'), 'human edit after the run\n');
    const result = await rollbackFiles(snap, files);
    assert.deepEqual(result.skipped.map((s) => s.reason), ['changed-since']);
    assert.equal(await readFile(path.join(root, 'a.txt'), 'utf8'), 'human edit after the run\n');
    assert.equal((await rollbackFiles(snap, files, null, { force: true })).restored.length, 1);
    assert.equal(await readFile(path.join(root, 'a.txt'), 'utf8'), 'one\n');
  } finally { await rm(root, { recursive: true, force: true }); await rm(dir, { recursive: true, force: true }); }
});

test('oversized trees and escaping paths are refused', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wf-snap-ws-')), dir = await mkdtemp(path.join(os.tmpdir(), 'wf-snap-'));
  try {
    for (const name of ['a', 'b', 'c']) await writeFile(path.join(root, name), 'x');
    assert.equal((await takeSnapshot(root, dir, { files: 2, fileBytes: 1000, totalBytes: 1e6, listedFiles: 10 })).ok, false);
    const snap = await takeSnapshot(root, dir);
    await assert.rejects(() => fileDiff(snap, '../outside'), /超出/);
  } finally { await rm(root, { recursive: true, force: true }); await rm(dir, { recursive: true, force: true }); }
});

test('isolated run: the real folder only changes when the result is applied, and later edits are protected', async () => {
  const { copyWorkspace, applyChanges } = await import('./snapshot.mjs');
  const real = await mkdtemp(path.join(os.tmpdir(), 'wf-real-')), copy = path.join(await mkdtemp(path.join(os.tmpdir(), 'wf-copy-')), 'ws'), dir = await mkdtemp(path.join(os.tmpdir(), 'wf-snap-'));
  try {
    await writeFile(path.join(real, 'a.txt'), 'one\n'); await writeFile(path.join(real, 'b.txt'), 'bee\n');
    assert.equal((await copyWorkspace(real, copy)).ok, true);
    const snap = await takeSnapshot(copy, dir);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeFile(path.join(copy, 'a.txt'), 'agent\n'); await writeFile(path.join(copy, 'c.txt'), 'new\n'); await rm(path.join(copy, 'b.txt'));
    const { files } = await diffSnapshot(snap);
    assert.equal(await readFile(path.join(real, 'a.txt'), 'utf8'), 'one\n');            // untouched until applied
    await writeFile(path.join(real, 'b.txt'), 'human\n');                               // the user edits b.txt meanwhile
    const result = await applyChanges(snap, real, files);
    assert.deepEqual(result.applied.sort(), ['a.txt', 'c.txt']);
    assert.deepEqual(result.skipped, [{ path: 'b.txt', reason: 'changed-since' }]);
    assert.equal(await readFile(path.join(real, 'a.txt'), 'utf8'), 'agent\n');
    assert.equal(await readFile(path.join(real, 'c.txt'), 'utf8'), 'new\n');
    assert.equal(await readFile(path.join(real, 'b.txt'), 'utf8'), 'human\n');
    assert.equal((await applyChanges(snap, real, files, ['b.txt'], { force: true })).applied.length, 1);
    assert.equal(await exists(path.join(real, 'b.txt')), false);
  } finally { for (const d of [real, path.dirname(copy), dir]) await rm(d, { recursive: true, force: true }); }
});
