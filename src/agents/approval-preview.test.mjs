import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalPreview } from './approval-preview.mjs';

test('approval previews show the real command, edit pairs and file content', () => {
  assert.deepEqual(approvalPreview('bash', { command: 'rm -rf build' }), { kind: 'command', command: 'rm -rf build' });
  assert.deepEqual(approvalPreview('edit', { path: 'a.js', edits: [{ oldText: 'x', newText: 'y' }] }), { kind: 'edit', path: 'a.js', edits: [{ from: 'x', to: 'y' }] });
  assert.deepEqual(approvalPreview('write', { path: 'n.txt', content: 'hi' }), { kind: 'write', path: 'n.txt', content: 'hi', bytes: 2 });
  assert.equal(approvalPreview('custom', { a: 1 }).kind, 'text');
  assert.equal(approvalPreview('x', null), null);
  assert.ok(approvalPreview('write', { path: 'big', content: 'a'.repeat(9000) }).content.length < 6100);
});

test('diffStat counts lines a file-editing tool call adds and removes', async () => {
  const { diffStat } = await import('./approval-preview.mjs');
  assert.deepEqual(diffStat({ path: 'a.js', edits: [{ oldText: 'a\nb', newText: 'a\nb\nc' }, { oldText: 'x', newText: '' }] }), { added: 3, removed: 3 });
  assert.deepEqual(diffStat({ path: 'a.js', oldText: 'one', newText: 'two\nthree' }), { added: 2, removed: 1 });
  assert.deepEqual(diffStat({ path: 'new.md', content: 'l1\nl2\n' }), { added: 2, removed: 0 });
  assert.equal(diffStat({ command: 'ls' }), null);
  assert.equal(diffStat(null), null);
});
