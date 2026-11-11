import React, { useState } from "react";
import { DiffText } from "./ChangesPanel.jsx";

export const allowLabel = (suggestion, tr) => suggestion.kind === "files" ? tr("此目录内的文件修改", "edits to files inside this folder") : suggestion.kind === "exact" ? tr("这条完全相同的命令：{0}", "this exact command: {0}").replace("{0}", suggestion.label) : tr("以 {0} 开头的命令", "commands starting with {0}").replace("{0}", suggestion.label);

// The actual command or file change behind an approval request.
function ApprovalPreview({ item, tr }) {
  const preview = item.preview;
  if (!preview) return item.input ? <pre>{item.input}</pre> : null;
  if (preview.kind === "command") return <pre className="approval-command">$ {preview.command}</pre>;
  if (preview.kind === "write") return <div className="approval-file"><small>{tr("写入 {0}（{1} 字节）", "Write {0} ({1} bytes)").replace("{0}", preview.path).replace("{1}", preview.bytes)}</small><pre>{preview.content}</pre></div>;
  if (preview.kind === "edit") {
    const diff = preview.edits.map((edit) => `@@\n${edit.from.split("\n").map((line) => `-${line}`).join("\n")}\n${edit.to.split("\n").map((line) => `+${line}`).join("\n")}`).join("\n");
    return <div className="approval-file"><small>{tr("修改 {0}", "Edit {0}").replace("{0}", preview.path || "")}</small><DiffText text={diff} tr={tr} /></div>;
  }
  return <pre>{preview.text}</pre>;
}

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
          <ApprovalPreview item={item} tr={tr} />
          {item.suggestion && <small className="approval-rule">{tr("“以后都允许”的范围：", "“Always allow” covers:")}{" "}{allowLabel(item.suggestion, tr)}</small>}
          <div>
            <button className="approve" onClick={() => respondAgentApproval(node, item.id, true)}>{tr("批准", "Approve")}</button>
            {item.suggestion && <button className="always" title={allowLabel(item.suggestion, tr)} onClick={() => respondAgentApproval(node, item.id, true, true)}>{tr("以后都允许", "Always allow")}</button>}
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
