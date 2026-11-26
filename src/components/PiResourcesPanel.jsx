import React, { useState } from "react";
import { LOCAL_PROXY_URL } from "../localProxy.js";
import { Button, Input, Switch } from "./settings/ui.jsx";

// Pi's packages, skills and MCP servers, managed from Settings: install / remove / update packages, switch
// skills and MCP servers on or off, add and remove MCP servers. Everything goes through Pi's own commands
// and config files, so the terminal Pi sees the same setup.
export function PiResourcesPanel({ resources, command, onChanged, tr }) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState({ tone: "", text: "" });
  const [source, setSource] = useState("");
  const [server, setServer] = useState({ name: "", target: "" });
  const run = async (key, body, done) => {
    if (busy) return;
    setBusy(key); setMessage({ tone: "", text: "" });
    try {
      const response = await fetch(`${LOCAL_PROXY_URL}/agents/pi/manage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, ...body }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onChanged?.(result.resources);
      done?.();
      setMessage({ tone: "ok", text: result.output ? result.output.split("\n").slice(-2).join(" ") : tr("已更新", "Updated") });
    } catch (error) { setMessage({ tone: "error", text: error.message }); }
    finally { setBusy(""); }
  };
  const addServer = () => {
    const name = server.name.trim(), target = server.target.trim();
    if (!name || !target) { setMessage({ tone: "error", text: tr("请填写名称和启动命令或地址", "Enter a name and a command or URL") }); return; }
    const isUrl = /^https?:\/\//.test(target);
    const [program, ...args] = isUrl ? [] : target.match(/"[^"]*"|\S+/g).map((part) => part.replace(/^"|"$/g, ""));
    void run("mcp-add", isUrl ? { action: "mcp-add", name, url: target } : { action: "mcp-add", name, program, args }, () => setServer({ name: "", target: "" }));
  };
  const packages = resources?.packages || [], skills = resources?.skills || [], mcp = resources?.mcp || [];
  return (
    <div className="pi-resources">
      <section>
        <header><strong>{tr("扩展包", "Packages")}</strong><Button disabled={!!busy} onClick={() => run("update", { action: "update" })}>{busy === "update" ? tr("正在更新…", "Updating…") : tr("全部更新", "Update all")}</Button></header>
        {packages.length ? packages.map((item) => (
          <div className="pi-res-row" key={item}><code>{item}</code><Button disabled={!!busy} onClick={() => run(`remove:${item}`, { action: "remove", source: item })}>{busy === `remove:${item}` ? "…" : tr("移除", "Remove")}</Button></div>
        )) : <p className="sx-hint">{tr("还没有安装扩展包。", "No packages installed yet.")}</p>}
        <form className="pi-res-add" onSubmit={(event) => { event.preventDefault(); if (source.trim()) void run("install", { action: "install", source: source.trim() }, () => setSource("")); }}>
          <Input value={source} onChange={(event) => setSource(event.target.value)} placeholder="npm:pi-web-access" spellCheck={false} aria-label={tr("扩展包来源", "Package source")} />
          <Button kind="primary" type="submit" disabled={!!busy || !source.trim()}>{busy === "install" ? tr("正在安装…", "Installing…") : tr("安装", "Install")}</Button>
        </form>
      </section>
      <section>
        <header><strong>{tr("技能", "Skills")}</strong><small>{skills.filter((item) => item.enabled !== false).length} / {skills.length}</small></header>
        {skills.length ? skills.map((item) => (
          <div className="pi-res-row" key={item.name} title={item.description}>
            <span><b>{item.name}</b>{item.description && <em>{item.description}</em>}</span>
            <Switch checked={item.enabled !== false} disabled={!!busy} onChange={(value) => run(`skill:${item.name}`, { action: "skill-toggle", name: item.name, enabled: value })} label={item.name} />
          </div>
        )) : <p className="sx-hint">{tr("~/.pi/agent/skills 里还没有技能。", "No skills in ~/.pi/agent/skills yet.")}</p>}
      </section>
      <section>
        <header><strong>{tr("MCP 服务器", "MCP servers")}</strong></header>
        {mcp.length ? mcp.map((item) => (
          <div className="pi-res-row" key={item.name} title={item.description}>
            <span><b>{item.name}</b>{item.description && <em>{item.description}</em>}</span>
            <Switch checked={item.enabled !== false} disabled={!!busy} onChange={(value) => run(`mcp:${item.name}`, { action: "mcp-toggle", name: item.name, enabled: value })} label={item.name} />
            <Button disabled={!!busy} onClick={() => run(`mcp-remove:${item.name}`, { action: "mcp-remove", name: item.name })}>{tr("移除", "Remove")}</Button>
          </div>
        )) : <p className="sx-hint">{tr("还没有 MCP 服务器。", "No MCP servers yet.")}</p>}
        <form className="pi-res-add" onSubmit={(event) => { event.preventDefault(); addServer(); }}>
          <Input value={server.name} onChange={(event) => setServer((current) => ({ ...current, name: event.target.value }))} placeholder={tr("名称", "Name")} spellCheck={false} aria-label={tr("MCP 服务器名称", "MCP server name")} />
          <Input value={server.target} onChange={(event) => setServer((current) => ({ ...current, target: event.target.value }))} placeholder={tr("npx -y 某个-mcp 或 https://…", "npx -y some-mcp or https://…")} spellCheck={false} aria-label={tr("启动命令或地址", "Command or URL")} />
          <Button kind="primary" type="submit" disabled={!!busy}>{busy === "mcp-add" ? "…" : tr("添加", "Add")}</Button>
        </form>
      </section>
      {message.text && <p className={`pi-res-message ${message.tone}`} role="status">{message.text}</p>}
    </div>
  );
}
