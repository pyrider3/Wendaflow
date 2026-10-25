// Feedback never delays a data change or participates in hit testing.
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function pulseThought(world, id) {
  if (!world || reducedMotion()) return;
  requestAnimationFrame(() => {
    const node = [...world.querySelectorAll('.node')].find(el => el.dataset.nodeId === id);
    if (!node) return;
    node.querySelector('.thought-feedback')?.remove();
    const ring = document.createElement('i');
    ring.className = 'thought-feedback';
    ring.setAttribute('aria-hidden', 'true');
    node.appendChild(ring);
    ring.animate([{ opacity: .65, scale: '.98' }, { opacity: 0, scale: '1.16' }],
      { duration: 240, easing: 'cubic-bezier(.16,1,.3,1)' }).finished.then(() => ring.remove(), () => ring.remove());
  });
}
export function animateSlice(world, connections, ids, links) {
  if (!world || reducedMotion()) return;
  // Bound the visual work even for a large batch; the removal itself is immediate.
  const cards = [...world.querySelectorAll('.node')].filter(el => ids.has(el.dataset.nodeId));
  const linkKeys = new Set(links.map(link => link.key));
  const paths = [...(connections?.querySelectorAll('.connection') || [])].filter(el =>
    linkKeys.has(el.dataset.connectionKey) || ids.has(el.dataset.childId) || ids.has(el.dataset.parentId) || ids.has(el.dataset.sourceId) || ids.has(el.dataset.targetId));
  for (const el of [...cards.slice(0, 20), ...paths.slice(0, 24)]) {
    const ghost = el.cloneNode(true);
    ghost.removeAttribute('data-node-id');
    ghost.removeAttribute('data-connection-key');
    ghost.classList.remove('node', 'connection', 'selected', 'dragging', 'newborn');
    ghost.classList.add('slice-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    if (el.matches('path')) {
      ghost.setAttribute('class', 'slice-line-ghost');
      ghost.style.stroke = '#e34e56';
      ghost.style.fill = 'none';
      ghost.style.strokeWidth = '2';
    } else {
      const style = getComputedStyle(el);
      for (const prop of ['background', 'border', 'borderRadius', 'padding', 'color', 'boxShadow', 'font']) ghost.style[prop] = style[prop];
      for (const heading of ghost.querySelectorAll('h2')) { heading.style.margin = '0'; heading.style.font = '500 16px/1.5 system-ui'; heading.style.whiteSpace = 'pre-wrap'; }
      ghost.style.width = `${el.offsetWidth}px`;
      ghost.style.height = `${el.offsetHeight}px`;
      ghost.style.position = 'absolute';
      ghost.style.overflow = 'hidden';
      ghost.style.boxSizing = 'border-box';
      ghost.querySelectorAll('button,.thought-feedback').forEach(child => child.remove());
    }
    el.parentNode.appendChild(ghost);
    ghost.animate([{ opacity: .8, scale: '1' }, { opacity: 0, scale: '.94' }],
      { duration: 160, easing: 'cubic-bezier(.4,0,1,1)' }).finished.then(() => ghost.remove(), () => ghost.remove());
  }
}
