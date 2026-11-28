import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("src/components/ParallelModelPicker.jsx");
const polishPath = path.resolve("src/components/polish.css");
const mainPath = path.resolve("src/main.jsx");

// Load the pure helper functions without needing Vite SVG asset loaders.
const rawSource = fs.readFileSync(sourcePath, "utf8");
const pureModuleCode = rawSource
  .replace(/^import\s+.*$/gm, "")
  .replace(/export function ParallelModelPicker[\s\S]*$/, "");
const helpersUrl = `data:text/javascript;base64,${Buffer.from(pureModuleCode).toString("base64")}`;
const {
  buildParallelModelItems,
  shouldShowParallelModelId,
  pruneParallelSelection,
  selectAllParallelValues,
} = await import(helpersUrl);

test("buildParallelModelItems normalizes cloud and local profiles with readiness flags", () => {
  const items = buildParallelModelItems(
    [
      { id: "ds", name: "deepseek-flash", model: "deepseek-flash", apiKey: "sk-1" },
      { id: "gem", name: "Gemini", model: "gemini-4-hydrogen", apiKey: "" },
    ],
    [{ id: "qw", name: "Qwen", model: "qwen2.5:7b" }],
    (zh) => zh,
  );
  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map(({ value, name, model, kind, ready, missingReason }) => ({
      value, name, model, kind, ready, missingReason,
    })),
    [
      { value: "cloud:ds", name: "deepseek-flash", model: "deepseek-flash", kind: "cloud", ready: true, missingReason: "" },
      { value: "cloud:gem", name: "Gemini", model: "gemini-4-hydrogen", kind: "cloud", ready: false, missingReason: "缺少密钥" },
      { value: "local:qw", name: "Qwen", model: "qwen2.5:7b", kind: "local", ready: true, missingReason: "" },
    ],
  );
});

test("shouldShowParallelModelId suppresses duplicate name and model labels", () => {
  assert.equal(shouldShowParallelModelId({ name: "deepseek-flash", model: "deepseek-flash" }), false);
  assert.equal(shouldShowParallelModelId({ name: "DeepSeek-Flash", model: "deepseek-flash" }), false);
  assert.equal(shouldShowParallelModelId({ name: "Gemini", model: "gemini-4-hydrogen" }), true);
  assert.equal(shouldShowParallelModelId({ name: "Qwen", model: "" }), false);
});

test("pruneParallelSelection drops deleted models and selectAllParallelValues prefers ready models", () => {
  const items = [
    { value: "cloud:ds", ready: true },
    { value: "cloud:gem", ready: false },
    { value: "local:qw", ready: true },
  ];
  assert.deepEqual([...pruneParallelSelection(new Set(["cloud:ds", "cloud:deleted"]), items)], ["cloud:ds"]);
  assert.deepEqual([...selectAllParallelValues(items)], ["cloud:ds", "local:qw"]);
  assert.deepEqual([...selectAllParallelValues([{ value: "cloud:gem", ready: false }])], ["cloud:gem"]);
});

test("parallel popover CSS prevents horizontal scrollbar and uses modern checkbox + scrollbar rules", () => {
  const css = fs.readFileSync(polishPath, "utf8");
  const main = fs.readFileSync(mainPath, "utf8");
  assert.match(css, /\.parallel-list\s*\{[^}]*overflow-y:\s*auto;\s*overflow-x:\s*hidden;/s);
  assert.match(css, /\.parallel-list\s*\{[^}]*scrollbar-width:\s*thin;[^}]*scrollbar-color:/s);
  assert.match(css, /@supports not \(scrollbar-color:\s*auto\)\s*\{[^}]*\.parallel-list\s*\{\s*scrollbar-width:\s*auto;\s*\}/s);
  assert.match(css, /\.parallel-row\s*\{[^}]*min-block-size:\s*44px;/s);
  assert.match(css, /\.parallel-check\s*\{[^}]*appearance:\s*none;/s);
  assert.match(css, /\.parallel-check:focus-visible\s*\{[^}]*outline:/s);
  assert.match(main, /closest\?\.\('\.parallel-anchor'\)/);
  assert.match(main, /if \(event\.key !== 'Escape'\) return;\s*event\.stopPropagation\(\);\s*setParallelMenuOpen\(false\);/s);
});
