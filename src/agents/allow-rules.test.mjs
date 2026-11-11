import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesRule, suggestRule } from './allow-rules.mjs';

const dir = '/work/proj';

test('safe commands are remembered by prefix, open-ended ones only exactly', () => {
  assert.deepEqual(suggestRule('bash', { command: 'git status --short' }, dir).rule, { tool: 'bash', prefix: 'git status' });
  assert.deepEqual(suggestRule('bash', { command: 'ls -la' }, dir).rule, { tool: 'bash', prefix: 'ls' });
  assert.deepEqual(suggestRule('bash', { command: 'rm -rf build' }, dir).rule, { tool: 'bash', exact: 'rm -rf build' });
  assert.deepEqual(suggestRule('bash', { command: 'node -e "x"' }, dir).rule, { tool: 'bash', exact: 'node -e "x"' });
  assert.equal(suggestRule('bash', { command: 'ls; rm -rf /' }, dir), null);
});

test('rules never match chained commands or other programs', () => {
  const rules = [{ tool: 'bash', prefix: 'git status' }, { tool: 'bash', exact: 'rm -rf build' }];
  assert.equal(matchesRule(rules, 'bash', { command: 'git status' }, dir), true);
  assert.equal(matchesRule(rules, 'bash', { command: 'git status --short' }, dir), true);
  assert.equal(matchesRule(rules, 'bash', { command: 'git statusx' }, dir), false);
  assert.equal(matchesRule(rules, 'bash', { command: 'git status && rm -rf /' }, dir), false);
  assert.equal(matchesRule(rules, 'bash', { command: 'git status $(whoami)' }, dir), false);
  assert.equal(matchesRule(rules, 'bash', { command: 'git push' }, dir), false);
  assert.equal(matchesRule(rules, 'bash', { command: 'rm -rf build' }, dir), true);
  assert.equal(matchesRule(rules, 'bash', { command: 'rm -rf build2' }, dir), false);
});

test('file rules only cover edits and writes inside the folder', () => {
  const rules = [{ tool: 'files' }];
  assert.equal(matchesRule(rules, 'write', { path: 'src/a.js' }, dir), true);
  assert.equal(matchesRule(rules, 'edit', { path: '/work/proj/src/a.js' }, dir), true);
  assert.equal(matchesRule(rules, 'write', { path: '../other/a.js' }, dir), false);
  assert.equal(matchesRule(rules, 'write', { path: '/etc/passwd' }, dir), false);
  assert.equal(matchesRule(rules, 'bash', { command: 'ls' }, dir), false);
  assert.equal(suggestRule('write', { path: '/etc/passwd' }, dir), null);
});
