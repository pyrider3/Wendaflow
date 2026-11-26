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

// A question a Pi extension asks while it runs (ctx.ui.confirm/select/input/editor), answered on the card.
function ExtensionDialog({ item, node, tr, respond }) {
  const [value, setValue] = useState(item.kind === "editor" ? item.prefill || "" : "");
  const answer = (payload) => respond(node, item.id, payload.approved === true, false, payload.answer || null);
  const cancel = () => answer({ answer: { cancelled: true } });
  const heading = item.title || tr("Pi 扩展需要你回答", "A Pi extension needs your answer");
  return (
    <div className="approval-request extension-dialog" role="alertdialog" aria-label={heading}>
      <strong>{heading}</strong>
      {item.message && item.kind !== "select" && <p>{item.message}</p>}
      {item.kind === "confirm" && (
        <div>
          <button className="approve" onClick={() => answer({ approved: true })}>{tr("确定", "OK")}</button>
          <button className="deny" onClick={() => answer({ approved: false })}>{tr("取消", "Cancel")}</button>
        </div>
      )}
      {item.kind === "select" && (
        <div className="extension-options">
          {item.options.map((option) => <button key={option} onClick={() => answer({ approved: true, answer: { value: option } })}>{option}</button>)}
          <button className="deny" onClick={cancel}>{tr("取消", "Cancel")}</button>
        </div>
      )}
      {(item.kind === "input" || item.kind === "editor") && (
        <form onSubmit={(event) => { event.preventDefault(); answer({ approved: true, answer: { value } }); }}>
          {item.kind === "editor"
            ? <textarea value={value} rows={6} onChange={(event) => setValue(event.target.value)} aria-label={heading} />
            : <input value={value} placeholder={item.placeholder || ""} onChange={(event) => setValue(event.target.value)} aria-label={heading} />}
          <div>
            <button className="approve" type="submit">{tr("提交", "Submit")}</button>
            <button className="deny" type="button" onClick={cancel}>{tr("取消", "Cancel")}</button>
          </div>
        </form>
      )}
    </div>
  );
}

const stepLabels = (tr) => ({ read: tr("读取", "Read"), edit: tr("修改", "Edit"), write: tr("写入", "Write"), bash: tr("运行", "Run"), grep: tr("搜索", "Search"), find: tr("查找", "Find"), ls: tr("列出", "List") });
const baseName = (target) => { const first = String(target || "").split("\n")[0]; return /[\\/]/.test(first) && first.length < 300 ? first.split(/[\\/]/).filter(Boolean).pop() || first : first; };

// The last few tool calls of a running card, newest last: what Pi is doing right now at a glance.
function LiveSteps({ events, tr }) {
  const steps = events.filter((event) => event.type === "command" && event.meta?.tool).slice(-4);
  if (!steps.length) return null;
  return (
    <ol className="live-steps" aria-label={tr("最近的步骤", "Recent steps")}>
      {steps.map((event) => {
        const { tool, target, state, diff } = event.meta;
        const label = stepLabels(tr)[tool] || tool;
        return (
          <li key={event.id} className={state || "running"}>
            <i aria-hidden="true" />
            <b>{label}</b>
            <code title={target}>{baseName(target)}</code>
            {diff && (diff.added || diff.removed) ? <span className="diffstat"><ins>+{diff.added}</ins><del>−{diff.removed}</del></span> : null}
          </li>
        );
      })}
    </ol>
  );
}

// What a running Pi card needs beside its activity log: approvals to answer, the latest
// thing it said, and a box to steer it while it works.
export function AgentControls({ node, tr, respondAgentApproval, steerAgent, switchPiModel, piModelChoices = [] }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [switcher, setSwitcher] = useState("");
  const pending = node.execution?.pending || [];
  const canSteer = node.execution?.canSteer === true;
  const running = node.status === "running";
  const status = node.execution?.extensionStatus || {}, widgets = node.execution?.extensionWidgets || {};
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
      {running && Object.keys(status).length > 0 && <p className="extension-status">{Object.values(status).join(" · ")}</p>}
      {running && Object.entries(widgets).map(([key, lines]) => <pre key={key} className="extension-widget">{lines.join("\n")}</pre>)}
      {pending.filter((item) => item.kind && item.kind !== "approval").map((item) => <ExtensionDialog key={item.id} item={item} node={node} tr={tr} respond={respondAgentApproval} />)}
      {pending.filter((item) => !item.kind || item.kind === "approval").map((item) => (
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
      {running && !pending.length && <LiveSteps events={events} tr={tr} />}
      {latest && !pending.length && latest.type !== "command" && <p className={`live-latest ${latest.type}`}>{latest.text.slice(-240)}</p>}
      {canSteer && node.actionRunner === "pi" && switchPiModel && (
        <div className="live-switch">
          {piModelChoices.length > 0 && <button type="button" className={switcher === "model" ? "open" : ""} onClick={() => setSwitcher((value) => value === "model" ? "" : "model")}>{tr("切换模型", "Switch model")} <i>⌄</i></button>}
          <button type="button" className={switcher === "thinking" ? "open" : ""} onClick={() => setSwitcher((value) => value === "thinking" ? "" : "thinking")}>{tr("思考强度", "Thinking level")} <i>⌄</i></button>
          {switcher && (
            <div className="live-switch-menu" role="menu" onWheel={(event) => event.stopPropagation()}>
              {(switcher === "model" ? piModelChoices : [["off", tr("已关闭", "Off")], ["low", tr("低", "Low")], ["medium", tr("中", "Medium")], ["high", tr("高", "High")], ["xhigh", tr("极高", "XHigh")]].map(([value, label]) => ({ value, label }))).map((item) => (
                <button key={item.value} role="menuitem" onClick={() => { setSwitcher(""); void switchPiModel(node, switcher === "model" ? { value: item.value } : { thinking: item.value }); }}>{item.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
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
