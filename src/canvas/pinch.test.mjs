import test from 'node:test';
import assert from 'node:assert/strict';
import { pinchViewport, ZOOM_MAX, ZOOM_MIN } from './pinch.mjs';

const base = { x: 40, y: 20, zoom: 0.5 };
const fingers = (ax, ay, bx, by) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
const worldAt = (viewport, point) => ({ x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom });

test('spreading the fingers zooms in around their midpoint', () => {
  const start = fingers(100, 200, 200, 200);
  const next = pinchViewport(base, start, fingers(50, 200, 250, 200));
  assert.equal(next.zoom, 1);
  const before = worldAt(base, { x: 150, y: 200 });
  const after = worldAt(next, { x: 150, y: 200 });
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
});

test('moving both fingers together pans without changing the zoom', () => {
  const start = fingers(100, 200, 200, 200);
  const next = pinchViewport(base, start, fingers(130, 170, 230, 170));
  assert.equal(next.zoom, base.zoom);
  assert.equal(next.x, base.x + 30);
  assert.equal(next.y, base.y - 30);
});

test('closing the fingers zooms out and the world point under the midpoint follows it', () => {
  const start = fingers(100, 200, 300, 200);
  const now = fingers(160, 220, 240, 220);
  const next = pinchViewport(base, start, now);
  assert.ok(next.zoom < base.zoom);
  const midStart = { x: 200, y: 200 }, midNow = { x: 200, y: 220 };
  const before = worldAt(base, midStart), after = worldAt(next, midNow);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
});

test('zoom stays inside the canvas limits', () => {
  const start = fingers(100, 100, 110, 100);
  assert.equal(pinchViewport(base, start, fingers(0, 100, 400, 100)).zoom, ZOOM_MAX);
  assert.equal(pinchViewport({ ...base, zoom: 0.03 }, fingers(0, 100, 400, 100), fingers(199, 100, 201, 100)).zoom, ZOOM_MIN);
});

test('two fingers on the same spot do not divide by zero', () => {
  const next = pinchViewport(base, fingers(100, 100, 100, 100), fingers(100, 100, 160, 100));
  assert.ok(Number.isFinite(next.zoom) && Number.isFinite(next.x) && Number.isFinite(next.y));
});
