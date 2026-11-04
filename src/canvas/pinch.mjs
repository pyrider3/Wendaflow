export const ZOOM_MIN = 0.02;
export const ZOOM_MAX = 2.4;

const clamp = (value) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
const midpoint = ({ a, b }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const gap = ({ a, b }) => Math.hypot(b.x - a.x, b.y - a.y);

// Two fingers on the canvas (points are canvas-relative). The world point that sat under the
// fingers' midpoint when they landed stays under the midpoint as it moves and as the fingers
// spread or close, so one gesture both zooms and pans.
export function pinchViewport(base, start, now) {
  const zoom = clamp(base.zoom * (gap(now) / Math.max(1, gap(start))));
  const from = midpoint(start);
  const to = midpoint(now);
  const worldX = (from.x - base.x) / base.zoom;
  const worldY = (from.y - base.y) / base.zoom;
  return { x: to.x - worldX * zoom, y: to.y - worldY * zoom, zoom };
}
