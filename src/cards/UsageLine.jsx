import React from "react";

const compact = (value) => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k` : String(Math.round(value || 0)));
const money = (value) => (value >= 0.1 ? `$${value.toFixed(2)}` : value >= 0.01 ? `$${value.toFixed(3)}` : `$${value.toFixed(4)}`);

// Tokens, cost and how full the context window is — what a long agent run makes you wonder about.
export function UsageLine({ usage, tr }) {
  if (!usage || !usage.turns) return null;
  const context = usage.context && usage.context.window > 0 && usage.context.percent != null ? usage.context : null;
  const percent = context ? Math.min(100, Math.max(0, context.percent)) : 0;
  const tone = percent >= 90 ? "high" : percent >= 70 ? "mid" : "";
  const detail = [
    `${tr("输入", "Input")} ${usage.input}`, `${tr("输出", "Output")} ${usage.output}`,
    usage.cacheRead || usage.cacheWrite ? `${tr("缓存", "Cache")} ${usage.cacheRead} / ${usage.cacheWrite}` : "",
    context ? `${tr("上下文", "Context")} ${context.tokens ?? "?"} / ${context.window}` : "",
  ].filter(Boolean).join(" · ");
  return (
    <div className="usage-line" title={detail} onPointerDown={(event) => event.stopPropagation()}>
      {usage.model && <span className="usage-model">{usage.model}</span>}
      <span>↑{compact(usage.input)} ↓{compact(usage.output)}{usage.cacheRead ? ` · ${tr("缓存", "Cache")} ${compact(usage.cacheRead)}` : ""}</span>
      {usage.cost > 0 && <span>{money(usage.cost)}</span>}
      {context && (
        <span className={`usage-context ${tone}`}>
          <b style={{ "--used": `${percent}%` }} />{tr("上下文", "Context")} {Math.round(percent)}%
        </span>
      )}
    </div>
  );
}
