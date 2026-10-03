import { useEffect, useRef } from "react";
import { flattenCubic, createSliceIndex } from "./slice.js";

// Cached hit testing and ephemeral drawing live outside the application state.
export function useQuickSlice({ canvasRef, worldRef, connectionsRef, nodes }) {
  const quickBlankClick = useRef(null);
  const quickSliceTrailRef = useRef(null);
  const quickSliceFrameRef = useRef(null);
  useEffect(() => () => clearQuickSlicePreview(), []);
  function beginQuickSlice(event) {
    clearQuickSlicePreview();
    quickBlankClick.current = {
      geometry: null,
      previewIds: new Set(),
      previewKeys: new Set(),
      x: event.clientX,
      y: event.clientY,
      last: { x: event.clientX, y: event.clientY },
      points: [{ x: event.clientX, y: event.clientY }],
      pendingChunks: [],
      ids: new Set(),
      connections: new Map(),
      moved: false,
    };
  }
  function clearQuickSlicePreview() {
    quickBlankClick.current = null;
    if (quickSliceFrameRef.current)
      cancelAnimationFrame(quickSliceFrameRef.current);
    quickSliceFrameRef.current = null;
    if (quickSliceTrailRef.current) {
      quickSliceTrailRef.current.style.display = "none";
      quickSliceTrailRef.current.firstChild?.setAttribute("points", "");
      if (quickSliceTrailRef.current.firstChild)
        quickSliceTrailRef.current.replaceChildren(
          quickSliceTrailRef.current.firstChild,
        );
    }
    for (const el of canvasRef.current?.querySelectorAll(
      "[data-slice-target]",
    ) || [])
      el.removeAttribute("data-slice-target");
    for (const el of connectionsRef.current?.querySelectorAll(
      ".slice-target",
    ) || [])
      el.classList.remove("slice-target");
  }
  function buildQuickSliceGeometry() {
    const cards = [
      ...(worldRef.current?.querySelectorAll(".node.thought") || []),
    ].map((el) => ({
      id: el.dataset.nodeId,
      element: el,
      rect: el.getBoundingClientRect(),
    }));
    const thoughtSet = new Set(
        nodes.filter((n) => n.type === "thought").map((n) => n.id),
      ),
      links = [];
    const matrix = connectionsRef.current?.getScreenCTM();
    if (matrix)
      for (const path of connectionsRef.current.querySelectorAll(
        ".connection[data-connection-key]",
      )) {
        const data = path.dataset,
          sourceId = data.sourceId || data.parentId,
          targetId = data.targetId || data.childId;
        if (!thoughtSet.has(sourceId) || !thoughtSet.has(targetId)) continue;
        const values = path
          .getAttribute("d")
          .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
          ?.map(Number);
        if (values?.length !== 8) continue;
        const points = Array.from({ length: 4 }, (_, i) => ({
          x: matrix.a * values[i * 2] + matrix.c * values[i * 2 + 1] + matrix.e,
          y: matrix.b * values[i * 2] + matrix.d * values[i * 2 + 1] + matrix.f,
        }));
        links.push({
          element: path,
          points: flattenCubic(points),
          connection: {
            key: data.connectionKey,
            kind: data.connectionKind,
            sourceId,
            targetId,
            childId: data.childId,
            type: data.connectionType,
          },
        });
      }
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      index: createSliceIndex(cards, links, 128, rect),
      cards: new Map(cards.map((c) => [c.id, c.element])),
      links: new Map(links.map((l) => [l.connection.key, l.element])),
      rect,
    };
  }
  function updateQuickSlice(event) {
    const stroke = quickBlankClick.current;
    if (!stroke) return;
    const end = { x: event.clientX, y: event.clientY };
    stroke.moved ||= Math.hypot(end.x - stroke.x, end.y - stroke.y) > 5;
    if (!stroke.moved) return;
    if (!stroke.geometry) stroke.geometry = buildQuickSliceGeometry();
    const samples = event.nativeEvent?.getCoalescedEvents?.() || [];
    for (const sample of [...samples, event]) {
      const b = { x: sample.clientX, y: sample.clientY };
      stroke.geometry.index.query(
        stroke.last,
        b,
        stroke.ids,
        stroke.connections,
      );
      if (Math.hypot(b.x - stroke.last.x, b.y - stroke.last.y) > 1) {
        stroke.points.push(b);
        if (stroke.points.length > 80) {
          stroke.pendingChunks.push(stroke.points.slice(0, 80));
          stroke.points = stroke.points.slice(79);
        }
      }
      stroke.last = b;
    }
    // Preserve completed segments; only redraw the live chunk, at most 80 points per frame.
    if (!quickSliceFrameRef.current)
      quickSliceFrameRef.current = requestAnimationFrame(() => {
        quickSliceFrameRef.current = null;
        if (quickBlankClick.current !== stroke) return;
        const trail = quickSliceTrailRef.current,
          rect = stroke.geometry.rect;
        if (trail) {
          trail.style.display = "block";
          const coords = (points) =>
            points.map((p) => `${p.x - rect.left},${p.y - rect.top}`).join(" ");
          for (const points of stroke.pendingChunks.splice(0)) {
            const chunk = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "polyline",
            );
            chunk.setAttribute("data-slice-chunk", "");
            chunk.setAttribute("points", coords(points));
            trail.appendChild(chunk);
          }
          trail.firstChild.setAttribute("points", coords(stroke.points));
        }
        for (const id of stroke.ids)
          if (!stroke.previewIds.has(id)) {
            stroke.geometry.cards
              .get(id)
              ?.setAttribute("data-slice-target", "true");
            stroke.previewIds.add(id);
          }
        for (const key of stroke.connections.keys())
          if (!stroke.previewKeys.has(key)) {
            stroke.geometry.links.get(key)?.classList.add("slice-target");
            stroke.previewKeys.add(key);
          }
      });
  }
  return {
    quickBlankClick,
    quickSliceTrailRef,
    beginQuickSlice,
    updateQuickSlice,
    clearQuickSlicePreview,
  };
}
