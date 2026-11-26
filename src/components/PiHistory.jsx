import React, { useEffect, useRef, useState } from "react";
import { LOCAL_PROXY_URL } from "../localProxy.js";
import { useExitAnimation } from "./useExitAnimation.js";

// Pi puts Wendaflow's pasted context in front of the task; show the part the user typed.
const shown = (text) => { const value = String(text || ""); const marker = value.lastIndexOf("当前需要执行的任务："); return (marker >= 0 ? value.slice(marker + 10) : value).split("\n\n请在最终答复中")[0].trim() || value; };

// One stretch of the session tree: a chain of entries stays in one column; where the conversation
// split, each branch is indented under the split point.
function Chain({ node, tr, onFork }) {
  const chain = [node];
  while (chain[chain.length - 1].children.length === 1) chain.push(chain[chain.length - 1].children[0]);
  const fork = chain[chain.length - 1].children;
  return (
    <>
      {chain.map((item) => <Entry key={item.id} item={item} tr={tr} onFork={onFork} />)}
      {fork.length > 1 && (
        <div className="pi-tree-split">
          {fork.map((child) => <div key={child.id} className={`pi-tree-branch ${child.active || hasActive(child) ? "active" : ""}`}><Chain node={child} tr={tr} onFork={onFork} /></div>)}
        </div>
      )}
    </>
  );
}
const hasActive = (node) => node.active || node.children.some(hasActive);

function Entry({ item, tr, onFork }) {
  const text = item.kind === "user" ? shown(item.text) : item.text;
  return (
    <div className={`pi-tree-entry ${item.kind} ${item.active ? "on-branch" : "off-branch"}`}>
      <i aria-hidden="true" />
      <div>
        {item.label && <span className="pi-tree-label">{item.label}</span>}
        {item.kind === "compaction" && <small>{tr("已压缩", "Compacted")}{item.tokensBefore ? ` · ${tr("约 {0} tokens", "about {0} tokens").replace("{0}", item.tokensBefore)}` : ""}</small>}
        {item.kind === "branch" && <small>{tr("分支摘要", "Branch summary")}</small>}
        <p>{text}</p>
      </div>
      {item.kind === "user" && (item.forkable
        ? <button onClick={() => onFork(item.id, text)}>{tr("从这里分岔", "Branch from here")}</button>
        : <em title={tr("Pi 只能从当前分支上的消息分岔", "Pi can only branch from messages on the current branch")}>{tr("其他分支", "Other branch")}</em>)}
    </div>
  );
}

// The conversation inside one Pi card's session as Pi's own tree: what was said, answers, compaction
// points, labels and earlier branches. Picking a message on the current branch opens a branch that
// rewinds the session to just before it, so it can be rewritten and run again.
export function PiHistory({ node, workspace, command, tr, onFork, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const panel = useRef(null);
  useExitAnimation(panel);
  useEffect(() => {
    let stale = false;
    fetch(`${LOCAL_PROXY_URL}/agents/pi/fork-points`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: node.execution?.sessionId || "", cwd: workspace, command }) })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); if (!stale) setData(result); })
      .catch((failure) => { if (!stale) setError(failure.message); });
    return () => { stale = true; };
  }, [node.id]);
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const tree = data?.tree, points = data?.points || [];
  return (
    <div ref={panel} className="compare-backdrop" role="dialog" aria-modal="true" aria-label={tr("会话记录", "Session history")} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="pi-history">
        <header><div><strong>{tr("会话记录", "Session history")}</strong><small>{tr("选一句话，从它之前分岔：改写后让 Pi 从那里重新来。", "Pick something you said to branch from just before it: rewrite it and Pi starts again from there.")}</small></div><button aria-label={tr("关闭", "Close")} onClick={onClose}>×</button></header>
        {!data && !error && <p className="pi-history-note">{tr("正在读取会话…", "Reading the session…")}</p>}
        {error && <p className="pi-history-note error">{error}</p>}
        {data && !points.length && !tree?.length && <p className="pi-history-note">{tr("这个会话里还没有可以分岔的消息。", "This session has no messages to branch from yet.")}</p>}
        {tree?.length > 0 && <div className="pi-tree">{tree.map((root) => <Chain key={root.id} node={root} tr={tr} onFork={onFork} />)}</div>}
        {!tree?.length && points.length > 0 && (
          <ol>
            {points.map((point, index) => (
              <li key={point.entryId}>
                <span className="pi-history-index">{index + 1}</span>
                <p>{shown(point.text)}</p>
                <button onClick={() => onFork(point.entryId, shown(point.text))}>{tr("从这里分岔", "Branch from here")}</button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
