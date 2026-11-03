import React, { useState } from "react";

// What a running Pi card needs beside its activity log: approvals to answer, the latest
// thing it said, and a box to steer it while it works.
export function AgentControls({ node, tr, respondAgentApproval, steerAgent }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const pending = node.execution?.pending || [];
  const canSteer = node.execution?.canSteer === true;
  const events = node.execution?.events || [];
  const latest = [...events].reverse().find((event) => ["message", "thinking", "command"].includes(event.type));
  const stop = (event) => event.stopPropagation();

  const send = async (behavior) => {
    const message = text.trim();
    if (!message) return;
    setError("");
    try { await steerAgent(node, message, behavior); setText(""); } catch (failure) { setError(failure.message); }
  };

  return (
    <section className="action-control" onPointerDown={stop} onKeyDown={stop}>
      {pending.map((item) => (
        <div className="approval-request" key={item.id} role="alertdialog" aria-label={tr("Pi 想要运行 {0}", "Pi wants to run {0}").replace("{0}", item.tool)}>
          <strong>{tr("Pi 想要运行 {0}", "Pi wants to run {0}").replace("{0}", item.tool)}</strong>
          {item.input && <pre>{item.input}</pre>}
          <div>
            <button className="approve" onClick={() => respondAgentApproval(node, item.id, true)}>{tr("批准", "Approve")}</button>
            <button className="deny" onClick={() => respondAgentApproval(node, item.id, false)}>{tr("拒绝", "Deny")}</button>
          </div>
        </div>
      ))}
      {latest && !pending.length && <p className={`live-latest ${latest.type}`}>{latest.text.slice(-240)}</p>}
      {canSteer && (
        <form className="steer-box" onSubmit={(event) => { event.preventDefault(); void send("steer"); }}>
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder={tr("追加指令…", "Add an instruction…")} aria-label={tr("追加指令", "Add an instruction")} />
          <button type="submit" disabled={!text.trim()} title={tr("在当前这一步的工具调用结束后、下一次思考前送达", "Delivered after the current step's tool calls, before the next thought")}>{tr("引导", "Steer")}</button>
          <button type="button" disabled={!text.trim()} onClick={() => void send("followUp")} title={tr("等任务做完之后再处理", "Handled once the task is finished")}>{tr("排队", "Queue")}</button>
        </form>
      )}
      {error && <p className="steer-error" role="alert">{error}</p>}
    </section>
  );
}
