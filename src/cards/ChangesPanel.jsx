import React, { useState } from "react";
import { LOCAL_PROXY_URL } from "../localProxy.js";

const post = async (route, body) => {
  const response = await fetch(`${LOCAL_PROXY_URL}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || String(response.status));
  return result;
};

export function DiffText({ text, tr }) {
  const lines = String(text || "").split("\n").filter((line) => !line.startsWith("--- ") && !line.startsWith("+++ "));
  const shown = lines.slice(0, 400);
  return (
    <pre className="diff-text">
      {shown.map((line, index) => <span key={index} className={line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : line.startsWith("@@") ? "hunk" : ""}>{line || " "}{"\n"}</span>)}
      {lines.length > shown.length && <span className="hunk">{tr("…还有 {0} 行未显示", "…{0} more lines not shown").replace("{0}", lines.length - shown.length)}</span>}
    </pre>
  );
}

// What a finished run changed in its working folder, with a diff per file and a way back.
export function ChangesPanel({ node, tr, applyAgentChanges }) {
  const [open, setOpen] = useState(null);
  const [diffs, setDiffs] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const changes = node.execution?.changes;
  const jobId = node.execution?.jobId;
  const isolated = node.actionIsolated === true;
  if (!changes || !jobId || node.status === "running") return null;

  if (!changes.available) {
    const reasons = { discarded: tr("这次隔离运行的结果已丢弃。", "The result of this isolated run was discarded."), "too-large": tr("工作目录太大，没有记录文件快照，所以无法显示改动或撤销。", "The working folder is too large to snapshot, so changes cannot be shown or undone."), expired: tr("这次运行的文件快照已过期。", "The file snapshot for this run has expired.") };
    return reasons[changes.reason] ? <p className="changes-note" onPointerDown={(event) => event.stopPropagation()}>{reasons[changes.reason]}</p> : null;
  }
  const files = changes.files || [];
  const applied = new Set(changes.applied || []);
  const pendingFiles = isolated ? files.filter((file) => !applied.has(file.path)) : files;
  if (!files.length && !(changes.rolledBack || []).length) return null;
  const sum = (key) => files.reduce((total, file) => total + (file[key] || 0), 0);
  const labels = { added: tr("新增", "New"), modified: tr("修改", "Edited"), deleted: tr("删除", "Deleted") };

  const toggle = async (file) => {
    if (open === file.path) { setOpen(null); return; }
    setOpen(file.path);
    if (diffs[file.path] || file.binary || file.large) return;
    try { const result = await post("/agent/changes/diff", { job: jobId, path: file.path }); setDiffs((current) => ({ ...current, [file.path]: result.diff })); }
    catch (error) { setDiffs((current) => ({ ...current, [file.path]: `${tr("无法读取差异：", "Cannot read the diff:")} ${error.message}` })); }
  };
  const rollback = async (paths, force = false) => {
    setBusy(true); setNote("");
    try {
      const result = await post(isolated ? "/agent/changes/apply" : "/agent/changes/rollback", { job: jobId, paths, force });
      applyAgentChanges(node, result.job.changes);
      if (!isolated) setDiffs({});
      setOpen(null); setConfirm(null);
      if (result.skipped.length) setNote(isolated ? tr("有 {0} 个文件在工作目录里被改过，已跳过。", "{0} files were edited in the working folder and were skipped.").replace("{0}", result.skipped.length) : tr("有 {0} 个文件在运行结束后又被改过，已跳过。", "{0} files were edited again after the run and were skipped.").replace("{0}", result.skipped.length));
    } catch (error) { setNote(error.message); }
    setBusy(false);
  };
  const discard = async () => {
    setBusy(true); setNote("");
    try { const result = await post("/agent/changes/discard", { job: jobId }); applyAgentChanges(node, result.job.changes); } catch (error) { setNote(error.message); }
    setBusy(false);
  };
  const stop = (event) => event.stopPropagation();

  return (
    <section className="changes-panel" onPointerDown={stop} onClick={stop} onWheel={(event) => event.stopPropagation()}>
      <header>
        <span>{isolated
          ? (pendingFiles.length ? tr("隔离副本里的改动 {0} 个文件", "{0} files changed in the isolated copy").replace("{0}", pendingFiles.length) : tr("已全部应用到工作目录", "All applied to the working folder"))
          : (files.length ? tr("改动 {0} 个文件", "{0} files changed").replace("{0}", files.length) : tr("已撤销本次所有改动", "All changes from this run were undone"))}</span>
        {pendingFiles.length > 0 && <small><b className="add">+{pendingFiles.reduce((total, file) => total + (file.additions || 0), 0)}</b> <b className="del">−{pendingFiles.reduce((total, file) => total + (file.deletions || 0), 0)}</b></small>}
        {pendingFiles.length > 0 && confirm !== "all" && <button disabled={busy} onClick={() => setConfirm("all")}>{isolated ? tr("应用到工作目录", "Apply to folder") : tr("撤销本轮", "Undo run")}</button>}
        {isolated && confirm !== "all" && <button disabled={busy} onClick={discard}>{tr("丢弃", "Discard")}</button>}
        {confirm === "all" && (
          <span className="changes-confirm">
            {isolated ? tr("写入工作目录？", "Write into the working folder?") : tr("恢复到运行前？", "Restore to before the run?")}
            <button className={isolated ? "" : "danger"} disabled={busy} onClick={() => rollback(null)}>{isolated ? tr("确认应用", "Apply") : tr("确认撤销", "Undo")}</button>
            <button disabled={busy} onClick={() => setConfirm(null)}>{tr("取消", "Cancel")}</button>
          </span>
        )}
      </header>
      {note && <p className="changes-note" role="status">{note}{" "}{note.includes("跳过") || note.includes("skipped") ? <button onClick={() => rollback(null, true)}>{isolated ? tr("仍然应用", "Apply anyway") : tr("仍然撤销", "Undo anyway")}</button> : null}</p>}
      <ul>
        {files.map((file) => (
          <li key={file.path} className={open === file.path ? "open" : ""}>
            <button className="file-row" onClick={() => toggle(file)} aria-expanded={open === file.path}>
              <i className={file.status}>{isolated && applied.has(file.path) ? tr("已应用", "Applied") : labels[file.status]}</i>
              <span title={file.path}>{file.path}</span>
              <small>{file.binary ? tr("二进制", "binary") : file.large ? tr("较大文件", "large") : <><b className="add">+{file.additions || 0}</b> <b className="del">−{file.deletions || 0}</b></>}</small>
            </button>
            {open === file.path && (
              <div className="file-diff">
                {file.binary || file.large ? <p className="changes-note">{tr("这类文件不显示文字差异。", "No text diff for this kind of file.")}</p> : diffs[file.path] === undefined ? <p className="changes-note">{tr("读取中…", "Loading…")}</p> : <DiffText text={diffs[file.path]} tr={tr} />}
                {!file.large && !(isolated && applied.has(file.path)) && <button className="undo-file" disabled={busy} onClick={() => rollback([file.path])}>{isolated ? tr("只应用这个文件", "Apply this file only") : tr("只撤销这个文件", "Undo this file only")}</button>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {changes.truncated && <p className="changes-note">{tr("改动太多，只列出前一部分文件。", "Too many changes; only the first files are listed.")}</p>}
    </section>
  );
}
