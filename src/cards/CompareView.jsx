import React, { useEffect } from "react";
import { ChangesPanel } from "./ChangesPanel.jsx";
import { LOCAL_PROXY_URL } from "../localProxy.js";

const post = async (route, body) => {
  const response = await fetch(`${LOCAL_PROXY_URL}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || String(response.status));
  return result;
};

const seconds = (node) => {
  const start = node.execution?.startedAt, end = node.execution?.completedAt;
  return start && end ? Math.max(0, Math.round((new Date(end) - new Date(start)) / 1000)) : null;
};

// Two runs of the same task side by side: who changed what, in which files, and a way to keep one of them.
export function CompareView({ cards, tr, runnerLabels, applyAgentChanges, onClose, notify }) {
  useEffect(() => {
    const close = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  const done = (card) => card.status !== "running" && !!card.execution?.changes;
  const filesOf = (card) => new Set((card.execution?.changes?.files || []).map((file) => file.path));
  const permissionLabels = { ask: tr("执行前询问", "Ask before acting"), read: tr("只读", "Read only"), full: tr("完全信任", "Full trust") };
  const [a, b] = cards;
  const both = a && b && done(a) && done(b) ? [...filesOf(a)].filter((path) => filesOf(b).has(path)) : [];

  const adopt = async (keep, drop) => {
    try {
      const kept = await post("/agent/changes/apply", { job: keep.execution.jobId });
      applyAgentChanges(keep, kept.job.changes);
      if (drop?.execution?.jobId) { const dropped = await post("/agent/changes/discard", { job: drop.execution.jobId }); applyAgentChanges(drop, dropped.job.changes); }
      notify(kept.skipped.length ? tr("已采用方案 {0}，有 {1} 个文件因工作目录里又被改过而跳过。", "Variant {0} adopted; {1} files were skipped because they changed in the working folder.").replace("{0}", keep.variant).replace("{1}", kept.skipped.length) : tr("已采用方案 {0}，另一个已丢弃。", "Variant {0} adopted; the other was discarded.").replace("{0}", keep.variant));
      onClose();
    } catch (error) { notify(error.message); }
  };

  return (
    <div className="compare-backdrop" role="dialog" aria-modal="true" aria-label={tr("并排对比", "Compare")} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="compare-sheet">
        <header>
          <strong>{tr("并排对比", "Compare")}</strong>
          {both.length > 0 && <small>{tr("两边都改了：{0}", "Both changed: {0}").replace("{0}", both.slice(0, 4).join("、") + (both.length > 4 ? "…" : ""))}</small>}
          <button className="compare-close" aria-label={tr("关闭", "Close")} onClick={onClose}>×</button>
        </header>
        <div className="compare-columns">
          {cards.map((card, index) => {
            const other = cards[1 - index];
            const secondsTaken = seconds(card);
            const options = card.actionOptions || {};
            return (
              <section key={card.id}>
                <header>
                  <b>{tr("方案 {0}", "Variant {0}").replace("{0}", card.variant || "?")}</b>
                  <span>{runnerLabels[card.actionRunner] || card.actionRunner}{options.model ? ` · ${options.model}` : ""}{card.actionRunner === "pi" && options.permission ? ` · ${permissionLabels[options.permission] || options.permission}` : ""}</span>
                  <small>{card.status === "running" ? tr("运行中…", "Running…") : card.status === "failed" || card.status === "error" ? tr("失败", "Failed") : secondsTaken !== null ? tr("用时 {0} 秒", "Took {0}s").replace("{0}", secondsTaken) : tr("已完成", "Done")}</small>
                </header>
                {card.execution?.output && <p className="compare-output">{card.execution.output.slice(0, 480)}</p>}
                {done(card) ? <ChangesPanel node={card} tr={tr} applyAgentChanges={applyAgentChanges} /> : <p className="changes-note">{card.status === "running" ? tr("还没有结果。", "No result yet.") : tr("没有可比较的改动。", "Nothing to compare.")}</p>}
                {done(card) && card.execution.changes.available && (card.execution.changes.files || []).length > 0 && (
                  <button className="adopt" onClick={() => adopt(card, other)}>{tr("采用方案 {0}，丢弃另一个", "Adopt variant {0}, discard the other").replace("{0}", card.variant || "?")}</button>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
