import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { parse } from "@babel/parser";
import { completeThoughtMarquee } from "./ideas.js";

const source = fs.readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
const ast = parse(source, { sourceType: "module", plugins: ["jsx"] });
const app = ast.program.body.find(
  (n) => n.type === "FunctionDeclaration" && n.id.name === "App",
);
const handlers = app.body.body
  .filter(
    (n) =>
      n.type === "FunctionDeclaration" &&
      ["endPointer", "clearSelection"].includes(n.id.name),
  )
  .map((n) => source.slice(n.start, n.end))
  .join("\n");

function finish(box, event, initialId = "a") {
  const state = {
    selectedId: initialId,
    selectedIds: new Set(["a", "b"]),
    inspectorOpen: true,
  };
  const nodes = [
    { id: "a", type: "thought", x: 20, y: 20 },
    { id: "b", type: "thought", x: 300, y: 20 },
    { id: "chat", type: "conversation", x: 50, y: 50 },
  ];
  const noop = () => {};
  const context = {
    quickThought: true,
    marquee: box,
    panning: null,
    relationDragRef: { current: null },
    quickBlankClick: { current: null },
    canvasRef: {
      current: { getBoundingClientRect: () => ({ left: 0, top: 80 }) },
    },
    visibleNodes: nodes,
    nodeSizes: new Map(),
    viewport: { x: 0, y: 0, zoom: 1 },
    viewportRef: { current: { x: 0, y: 0, zoom: 1 } },
    completeThoughtMarquee,
    selectedId: initialId,
    inspectorClosing: false,
    inspectorTimerRef: { current: 42 },
    suppressContextMenuUntilRef: { current: 0 },
    resizingRef: { current: null },
    window: { clearTimeout: noop },
    closeBranch: noop,
  };
  for (const name of [
    "SelectedId",
    "SelectedIds",
    "InspectorOpen",
    "InspectorClosing",
    "DeleteConfirm",
    "SelectedConnections",
    "LineSelectionMenu",
    "LinkingFrom",
    "Dragging",
    "Panning",
    "Marquee",
    "Resizing",
  ])
    context["set" + name] = (value) => {
      state[name[0].toLowerCase() + name.slice(1)] = value;
    };
  vm.runInNewContext(handlers + "\nendPointer(event)", { ...context, event });
  return state;
}

test("actual pointer release clears previous box selection on a blank click or tiny jitter", () => {
  for (const delta of [0, 2, 4]) {
    const state = finish(
      { startX: 900, startY: 400, x: 900, y: 400 },
      { type: "pointerup", clientX: 900 + delta, clientY: 480 },
    );
    assert.equal(state.selectedId, null);
    assert.equal(state.selectedIds.size, 0);
    assert.equal(state.inspectorOpen, false);
    assert.equal(state.marquee, null);
  }
});
test("actual release uses final coordinates and only selects ideas; empty drag and cancellation clear selection", () => {
  const state = finish(
    { startX: 0, startY: 0, x: 5, y: 5 },
    { type: "pointerup", clientX: 600, clientY: 300 },
  );
  assert.deepEqual([...state.selectedIds], ["a", "b"]);
  assert.equal(state.inspectorOpen, false);
  const partial = finish(
    { startX: 0, startY: 0, x: 5, y: 5 },
    { type: "pointerup", clientX: 50, clientY: 130 },
  );
  assert.deepEqual([...partial.selectedIds], ["a"]);
  for (const event of [
    { type: "pointerup", clientX: 1000, clientY: 600 },
    { type: "pointercancel", clientX: 600, clientY: 300 },
  ]) {
    const result = finish({ startX: 900, startY: 400, x: 900, y: 400 }, event);
    assert.equal(result.selectedIds.size, 0);
  }
});
