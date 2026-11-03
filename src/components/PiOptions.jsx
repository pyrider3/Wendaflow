import React from "react";

// "provider::id" is how a model is carried through a <select>; both halves are what Pi's own flags take.
export const piSelectionValue = (settings) => (settings?.provider && settings?.model ? `${settings.provider}::${settings.model}` : settings?.model ? `::${settings.model}` : "");
export function parsePiSelection(value) {
  const at = String(value || "").indexOf("::");
  return at < 0 ? { provider: "", model: "" } : { provider: value.slice(0, at), model: value.slice(at + 2) };
}

export function piLevelLabel(level, tr) {
  const labels = { off: tr("已关闭", "Off"), minimal: tr("极低", "Minimal"), low: tr("低", "Low"), medium: tr("中", "Medium"), high: tr("高", "High"), xhigh: tr("极高", "XHigh"), max: tr("最高", "Max") };
  return labels[level] || level;
}

// The model <option>s, grouped by provider. A value Pi no longer lists stays selectable so it is never lost silently.
export function PiModelOptions({ info, selection, tr }) {
  const models = info?.models || [];
  const current = info?.current;
  const known = models.some((model) => `${model.provider}::${model.id}` === selection);
  const groups = [];
  for (const model of models) {
    let group = groups.find((item) => item.provider === model.provider);
    if (!group) groups.push((group = { provider: model.provider, items: [] }));
    group.items.push(model);
  }
  return (
    <>
      <option value="">{current ? tr("默认 · {0}", "Default · {0}").replace("{0}", `${current.provider} / ${current.id}`) : tr("使用 Pi 的默认设置", "Use Pi's default")}</option>
      {selection && !known && <option value={selection}>{selection.replace("::", " / ")}</option>}
      {groups.map((group) => (
        <optgroup key={group.provider} label={group.provider}>
          {group.items.map((model) => (
            <option key={model.id} value={`${model.provider}::${model.id}`}>{model.name === model.id ? model.id : `${model.name} (${model.id})`}</option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export function PiThinkingOptions({ levels, current, tr }) {
  const list = levels?.levels || ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
  return (
    <>
      <option value="">{current ? tr("默认 · {0}", "Default · {0}").replace("{0}", piLevelLabel(current, tr)) : tr("默认", "Default")}</option>
      {list.map((level) => <option key={level} value={level}>{piLevelLabel(level, tr)}</option>)}
    </>
  );
}
