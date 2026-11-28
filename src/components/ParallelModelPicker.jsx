import React, { useMemo, useState } from "react";
import { ProviderMark } from "./ModelMenu.jsx";

export function buildParallelModelItems(cloudProfiles = [], localProfiles = [], tr = (zh) => zh) {
  const cloud = cloudProfiles.map((profile) => {
    const name = String(profile?.name || "").trim();
    const model = String(profile?.model || "").trim();
    const hasKey = Boolean(String(profile?.apiKey || "").trim());
    const hasModel = Boolean(model);
    return {
      value: `cloud:${profile.id}`,
      name: name || model || tr("未命名", "Untitled"),
      model,
      kind: "cloud",
      ready: hasKey && hasModel,
      missingReason: !hasModel
        ? tr("缺少模型名", "Model missing")
        : !hasKey
          ? tr("缺少密钥", "Key missing")
          : "",
    };
  });
  const local = localProfiles.map((profile) => {
    const name = String(profile?.name || "").trim();
    const model = String(profile?.model || "").trim();
    const hasModel = Boolean(model);
    return {
      value: `local:${profile.id}`,
      name: name || model || tr("本机", "Local"),
      model,
      kind: "local",
      ready: hasModel,
      missingReason: !hasModel ? tr("缺少模型名", "Model missing") : "",
    };
  });
  return [...cloud, ...local];
}

export function shouldShowParallelModelId(item) {
  const name = String(item?.name || "").trim().toLowerCase();
  const model = String(item?.model || "").trim().toLowerCase();
  return Boolean(model && model !== name);
}

export function pruneParallelSelection(selected, items) {
  const valid = new Set(items.map((item) => item.value));
  const next = new Set();
  for (const id of selected || []) {
    if (valid.has(id)) next.add(id);
  }
  return next;
}

export function selectAllParallelValues(items) {
  const ready = items.filter((item) => item.ready).map((item) => item.value);
  return new Set(ready.length ? ready : items.map((item) => item.value));
}

export function ParallelModelPicker({
  items,
  selected,
  currentModel = "",
  onToggle,
  onReplaceSelection,
  onTurnOff,
  onDone,
  tr,
}) {
  const [query, setQuery] = useState("");
  const validSelected = useMemo(() => pruneParallelSelection(selected, items), [selected, items]);
  const selectedCount = validSelected.size;
  const selectableTargets = useMemo(() => selectAllParallelValues(items), [items]);
  const allTargetsSelected = selectableTargets.size > 0 && [...selectableTargets].every((id) => validSelected.has(id));
  const searchable = items.length > 6;

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.name} ${item.model} ${item.kind}`.toLowerCase().includes(needle));
  }, [items, query]);

  const handleBulkToggle = () => {
    if (!onReplaceSelection) return;
    onReplaceSelection(allTargetsSelected ? new Set() : new Set(selectableTargets));
  };

  return (
    <div className="parallel-card">
      <header className="parallel-head">
        <div className="parallel-head-top">
          <strong>{tr("同时问几个模型", "Ask several models at once")}</strong>
          <span className={`parallel-badge ${selectedCount >= 2 ? "ready" : ""}`} aria-live="polite">
            {selectedCount}/{items.length}
          </span>
          {items.length > 1 && onReplaceSelection && (
            <button type="button" className="parallel-bulk" onClick={handleBulkToggle}>
              {allTargetsSelected ? tr("清空", "Clear") : tr("全选", "Select all")}
            </button>
          )}
        </div>
        <small>{tr("每个选中的模型各回答一张卡片，方便对比。", "Each chosen model answers on its own card, side by side.")}</small>
        {searchable && (
          <input
            type="search"
            className="parallel-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr("搜索模型…", "Search models…")}
            aria-label={tr("搜索模型…", "Search models…")}
            spellCheck={false}
          />
        )}
      </header>

      <div className="parallel-list" role="group" aria-label={tr("同时问几个模型", "Ask several models at once")}>
        {visibleItems.map((item, index) => {
          const on = validSelected.has(item.value);
          const showModelId = shouldShowParallelModelId(item);
          const isCurrent = Boolean(currentModel && item.value === currentModel);
          return (
            <label
              key={item.value}
              className={`parallel-row ${on ? "selected" : ""} ${!item.ready ? "unready" : ""}`}
              style={{ "--i": Math.min(index, 14) }}
            >
              <input
                type="checkbox"
                className="parallel-check"
                checked={on}
                onChange={() => onToggle(item.value)}
              />
              <ProviderMark provider={item.kind === "local" ? "local" : ""} label={`${item.name} ${item.model}`} />
              <span className="parallel-meta">
                <span className="parallel-title-row">
                  <span className="parallel-name" title={item.name}>{item.name}</span>
                  {isCurrent && <em className="parallel-tag current">{tr("当前", "Current")}</em>}
                  {item.kind === "local" && <em className="parallel-tag local">{tr("本机", "Local")}</em>}
                  {!item.ready && item.missingReason && <em className="parallel-tag warn">{item.missingReason}</em>}
                </span>
                {showModelId && <small className="parallel-model-id" title={item.model}>{item.model}</small>}
              </span>
            </label>
          );
        })}
        {!visibleItems.length && (
          <p className="parallel-empty">{tr("没有匹配的模型", "No matching models")}</p>
        )}
      </div>

      <footer className="parallel-foot">
        <button type="button" className="parallel-off" onClick={onTurnOff}>
          {tr("关闭并行", "Turn off parallel")}
        </button>
        <button type="button" className="primary parallel-done" onClick={onDone}>
          {tr("完成", "Done")}
        </button>
      </footer>
    </div>
  );
}
