import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CLOUD,
  DEFAULT_OLLAMA,
  loadCloudProfiles,
  loadLocalProfiles,
  resolveInitialChatModel,
  resolveModelProfile,
} from './modelProfiles.mjs';

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
  };
}

test('loadLocalProfiles keeps an explicitly saved empty list instead of resurrecting Qwen', () => {
  const storage = makeStorage({ 'branchspace-local-profiles': '[]' });
  assert.deepEqual(loadLocalProfiles(storage), []);
});

test('loadLocalProfiles starts empty on a fresh install without spawning a phantom Qwen tile', () => {
  const storage = makeStorage();
  assert.deepEqual(loadLocalProfiles(storage), []);
});

test('loadLocalProfiles migrates legacy branchspace-ollama when present', () => {
  const storage = makeStorage({
    'branchspace-ollama': JSON.stringify({ endpoint: 'http://127.0.0.1:11434', model: 'llama3.2' }),
  });
  assert.deepEqual(loadLocalProfiles(storage), [{ ...DEFAULT_OLLAMA, model: 'llama3.2' }]);
});

test('loadLocalProfiles ignores legacy branchspace-ollama once profiles have been explicitly cleared', () => {
  const storage = makeStorage({
    'branchspace-local-profiles': '[]',
    'branchspace-ollama': JSON.stringify({ model: 'llama3.2' }),
  });
  assert.deepEqual(loadLocalProfiles(storage), []);
});

test('loadLocalProfiles handles invalid JSON without resurrecting default Qwen', () => {
  const storage = makeStorage({ 'branchspace-local-profiles': '{broken' });
  assert.deepEqual(loadLocalProfiles(storage), []);
});

test('loadCloudProfiles keeps an explicitly saved empty list instead of resurrecting OpenAI', () => {
  const storage = makeStorage({ 'branchspace-cloud-profiles': '[]' });
  assert.deepEqual(loadCloudProfiles(storage), []);
});

test('loadCloudProfiles respects empty list migrated from legacy sessionStorage', () => {
  const local = makeStorage();
  const session = makeStorage({ 'branchspace-cloud-profiles': '[]' });
  assert.deepEqual(loadCloudProfiles(local, session), []);
});

test('loadCloudProfiles falls back to DEFAULT_CLOUD on a brand-new install', () => {
  assert.deepEqual(loadCloudProfiles(makeStorage()), [DEFAULT_CLOUD]);
});

test('resolveInitialChatModel handles empty cloud/local lists without crashing', () => {
  assert.equal(resolveInitialChatModel('', [], []), '');
  assert.equal(resolveInitialChatModel('cloud:missing', [], []), '');
  assert.equal(
    resolveInitialChatModel('cloud:missing', [], [{ id: 'loc-1', name: 'Ollama', model: 'llama3.2' }]),
    'local:loc-1',
  );
  assert.equal(
    resolveInitialChatModel('local:loc-1', [{ id: 'cld-1' }], [{ id: 'loc-1' }]),
    'local:loc-1',
  );
  assert.equal(
    resolveInitialChatModel('local:deleted', [{ id: 'cld-1' }], []),
    'cloud:cld-1',
  );
});

test('resolveModelProfile never silently falls back to an unconfigured local profile', () => {
  const cloud = [{ id: 'c1', name: 'Gemini', model: 'gemini-2.5-flash' }];
  const local = [{ id: 'l1', name: 'Ollama', model: 'llama3.2' }];
  assert.deepEqual(resolveModelProfile('cloud:c1', cloud, local), { cloud: cloud[0], local: null });
  assert.deepEqual(resolveModelProfile('local:l1', cloud, local), { cloud: null, local: local[0] });
  assert.deepEqual(resolveModelProfile('cloud:gone', cloud, local), { cloud: null, local: null });
  assert.deepEqual(resolveModelProfile('local:gone', cloud, local), { cloud: null, local: null });
  assert.deepEqual(resolveModelProfile('', cloud, local), { cloud: null, local: null });
});
