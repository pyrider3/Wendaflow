import React, { useEffect, useRef, useState } from "react";

const clock = (ms) => { const total = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(total / 60), s = total % 60; return m ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`; };

// Every agent task on this canvas at a glance: what is waiting for you, what is running, what just finished.
export function TaskOverview({ nodes, tr, runnerLabels, onFocus, onRespond }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const host = useRef(null);

  const tasks = nodes.filter((node) => node.type === "action" && node.execution && ["running", "done", "failed", "stopped"].includes(node.status));
  const waiting = (node) => node.status === "running" && (node.execution.pending || []).length > 0;
  const rank = (node) => (waiting(node) ? 0 : node.status === "running" ? 1 : 2);
  const sorted = [...tasks].sort((a, b) => rank(a) - rank(b) || String(b.execution.completedAt || b.execution.startedAt || "").localeCompare(String(a.execution.completedAt || a.execution.startedAt || ""))).slice(0, 14);
  const active = tasks.filter((node) => node.status === "running").length;
  const approvals = tasks.filter(waiting).length;

  useEffect(() => {
    if (!open) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const close = (event) => { if (event.type === "keydown" ? event.key === "Escape" : !host.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", close, true); document.addEventListener("keydown", close);
    return () => { window.clearInterval(timer); document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", close); };
  }, [open]);

  if (!tasks.length) return null;
  const statusLabel = (node) => (waiting(node) ? tr("等你批准", "Needs approval") : node.status === "running" ? tr("运行中", "Running") : node.status === "done" ? tr("已完成", "Done") : node.status === "stopped" ? tr("已停止", "Stopped") : tr("失败", "Failed"));
  const took = (node) => {
    const start = node.execution.startedAt ? new Date(node.execution.startedAt).getTime() : null;
    if (!start) return "";
    const end = node.status === "running" ? now : node.execution.completedAt ? new Date(node.execution.completedAt).getTime() : null;
    return end ? clock(end - start) : "";
  };

  return (
    <div className="task-overview" ref={host}>
      <button className={`quiet-button task-overview-button ${open ? "active" : ""} ${approvals ? "attention" : ""}`} aria-expanded={open} aria-label={tr("任务总览", "Task overview")} title={tr("任务总览", "Task overview")} onClick={() => setOpen((value) => !value)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h13" /></svg>
        {(active > 0 || approvals > 0) && <b>{approvals || active}</b>}
      </button>
      {open && (
        <section className="task-overview-panel" role="dialog" aria-label={tr("任务总览", "Task overview")}>
          <header><strong>{tr("任务总览", "Task overview")}</strong><small>{active > 0 ? tr("{0} 个在运行", "{0} running").replace("{0}", active) : tr("没有在运行的任务", "Nothing running")}</small></header>
          <ul>
            {sorted.map((node) => {
              const pending = waiting(node) ? node.execution.pending[0] : null;
              const cost = node.execution.usage?.cost;
              return (
                <li key={node.id} className={`${node.status} ${pending ? "waiting" : ""}`}>
                  <button className="task-row" onClick={() => { onFocus(node); setOpen(false); }}>
                    <i aria-hidden="true" />
                    <span><strong>{node.title}</strong><small>{runnerLabels[node.actionRunner] || node.actionRunner}{took(node) ? ` · ${took(node)}` : ""}{cost > 0 ? ` · $${cost.toFixed(cost >= 0.01 ? 3 : 4)}` : ""}</small></span>
                    <em>{statusLabel(node)}</em>
                  </button>
                  {pending && (
                    <div className="task-approval">
                      <code>{pending.preview?.kind === "command" ? `$ ${pending.preview.command}` : pending.preview?.path ? `${pending.tool} ${pending.preview.path}` : pending.tool}</code>
                      <div>
                        <button className="approve" onClick={() => onRespond(node, pending.id, true)}>{tr("批准", "Approve")}</button>
                        <button onClick={() => onRespond(node, pending.id, false)}>{tr("拒绝", "Deny")}</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
