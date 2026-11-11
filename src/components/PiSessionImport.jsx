import React, { useEffect, useState } from "react";
import { LOCAL_PROXY_URL } from "../localProxy.js";

const post = async (route, body) => {
  const response = await fetch(`${LOCAL_PROXY_URL}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || String(response.status));
  return result;
};

const ago = (iso, tr) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (minutes < 1) return tr("刚刚", "just now");
  if (minutes < 60) return tr("{0} 分钟前", "{0} min ago").replace("{0}", minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 48) return tr("{0} 小时前", "{0} h ago").replace("{0}", hours);
  return tr("{0} 天前", "{0} d ago").replace("{0}", Math.round(hours / 24));
};

// Pi sessions that already exist on disk (including the ones started in a terminal), importable as cards.
export function PiSessionImport({ tr, workspace, onImport, onClose }) {
  const [query, setQuery] = useState("");
  const [here, setHere] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const close = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try { const result = await post("/agents/pi/sessions", { cwd: here ? workspace : "", query }); if (!cancelled) { setSessions(result.sessions); setError(""); } }
      catch (failure) { if (!cancelled) setError(failure.message); }
    }, query ? 200 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, here, workspace]);

  const pick = async (session) => {
    setBusy(session.id);
    try { onImport(await post("/agents/pi/session", { id: session.id })); onClose(); } catch (failure) { setError(failure.message); setBusy(""); }
  };

  return (
    <div className="compare-backdrop" role="dialog" aria-modal="true" aria-label={tr("导入 Pi 会话", "Import a Pi session")} onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="compare-sheet pi-import">
        <header>
          <strong>{tr("导入 Pi 会话", "Import a Pi session")}</strong>
          <button className="compare-close" aria-label={tr("关闭", "Close")} onClick={onClose}>×</button>
        </header>
        <div className="pi-import-tools">
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("搜索会话…", "Search sessions…")} aria-label={tr("搜索会话…", "Search sessions…")} spellCheck={false} />
          {workspace && <label><input type="checkbox" checked={here} onChange={(event) => setHere(event.target.checked)} />{tr("只看当前工作目录", "Only this working folder")}</label>}
        </div>
        {error && <p className="changes-note" role="alert">{error}</p>}
        <ul className="pi-import-list">
          {sessions === null && !error && <li className="changes-note">{tr("读取中…", "Loading…")}</li>}
          {sessions?.length === 0 && <li className="changes-note">{tr("没有找到会话。", "No sessions found.")}</li>}
          {(sessions || []).map((session) => (
            <li key={session.id}>
              <button disabled={!!busy} onClick={() => pick(session)}>
                <strong>{session.title}</strong>
                {session.preview && <span>{session.preview}</span>}
                <small>{session.cwd.split("/").filter(Boolean).pop() || "/"} · {ago(session.updatedAt, tr)}{session.forked ? ` · ${tr("分叉会话", "forked")}` : ""}{busy === session.id ? ` · ${tr("读取中…", "Loading…")}` : ""}</small>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
