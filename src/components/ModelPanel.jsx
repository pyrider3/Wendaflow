import React, { useState } from "react";
import { piLevelLabel } from "./PiOptions.jsx";

// A rail of stops (like ChatGPT's effort slider): the selected stop carries the thumb, the rail fills up to it.
export function EffortSlider({ levels, value, onChange, label, defaultLabel, disabledNote, tr }) {
  const index = levels.findIndex((item) => item.value === value);
  const only = levels.length <= 1;
  return (
    <div className={`effort ${only ? "disabled" : ""}`}>
      <div className="effort-head"><small>{label}</small><strong>{index >= 0 ? levels[index].label : defaultLabel}</strong></div>
      {only ? <p className="option-note">{disabledNote}</p> : (
        <div className="effort-track" role="radiogroup" aria-label={label} style={{ "--fill": index >= 0 ? `${((index + 0.5) / levels.length) * 100}%` : "0%" }}>
          {levels.map((item, at) => (
            <button key={item.value} role="radio" aria-checked={at === index} title={item.label} aria-label={item.label} className={at === index ? "selected" : at < index ? "passed" : ""} onClick={() => onChange(item.value)}><i /></button>
          ))}
        </div>
      )}
      {!only && <div className="effort-ends"><span>{levels[0].label}</span><span>{levels[levels.length - 1].label}</span></div>}
    </div>
  );
}

// Models grouped by provider; picking one applies immediately. `groups` = [{ title, items: [{ value, label, hint }] }].
export function ModelList({ groups, value, onChange, searchable, tr }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = groups.map((group) => ({ ...group, items: group.items.filter((item) => !needle || `${item.label} ${item.hint || ""}`.toLowerCase().includes(needle)) })).filter((group) => group.items.length);
  return (
    <div className="model-list">
      {searchable && <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("搜索模型…", "Search models…")} aria-label={tr("搜索模型…", "Search models…")} spellCheck={false} />}
      <div className="model-list-scroll" role="radiogroup" aria-label={tr("模型", "Model")}>
        {shown.map((group) => (
          <div key={group.title || "-"}>
            {group.title && <small>{group.title}</small>}
            {group.items.map((item) => (
              <button key={item.value} role="radio" aria-checked={item.value === value} className={item.value === value ? "selected" : ""} onClick={() => onChange(item.value)}>
                <span>{item.label}{item.hint && <em>{item.hint}</em>}</span><i aria-hidden="true">✓</i>
              </button>
            ))}
          </div>
        ))}
        {!shown.length && <p className="option-note">{tr("没有匹配的模型", "No matching models")}</p>}
      </div>
    </div>
  );
}

export function piModelGroups(info, selection, tr) {
  const models = info?.models || [];
  const current = info?.current;
  const groups = [{ title: "", items: [{ value: "", label: current ? tr("默认 · {0}", "Default · {0}").replace("{0}", `${current.provider} / ${current.id}`) : tr("使用 Pi 的默认设置", "Use Pi's default") }] }];
  if (selection && !models.some((model) => `${model.provider}::${model.id}` === selection)) groups[0].items.push({ value: selection, label: selection.replace("::", " / ") });
  for (const model of models) {
    let group = groups.find((item) => item.title === model.provider);
    if (!group) groups.push((group = { title: model.provider, items: [] }));
    group.items.push({ value: `${model.provider}::${model.id}`, label: model.name || model.id, hint: model.name && model.name !== model.id ? model.id : "" });
  }
  return groups;
}

export const piEffortLevels = (levels, tr) => (levels?.levels || ["off", "minimal", "low", "medium", "high", "xhigh", "max"]).map((value) => ({ value, label: piLevelLabel(value, tr) }));
