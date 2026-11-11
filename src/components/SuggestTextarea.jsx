import React, { useEffect, useRef, useState } from "react";
import { LOCAL_PROXY_URL } from "../localProxy.js";

const post = async (route, body) => {
  const response = await fetch(`${LOCAL_PROXY_URL}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || String(response.status));
  return result;
};

// The composer's text box. In action mode it suggests workspace files after "@" and Pi's slash commands/skills
// at the start of the text. Everything else behaves like a plain textarea (Enter sends, Shift+Enter breaks the line).
export function SuggestTextarea({ value, onChange, onSubmit, placeholder, autoFocus, workspace, piCommand, enabled, commandsEnabled, tr }) {
  const ref = useRef(null);
  const [trigger, setTrigger] = useState(null);   // { kind, from, to, query }
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const commandsCache = useRef({ key: "", list: null });

  const detect = (text, caret) => {
    const before = text.slice(0, caret);
    const file = before.match(/(?:^|[\s(（])@([^\s@]*)$/);
    if (file) return { kind: "file", from: caret - file[1].length - 1, to: caret, query: file[1] };
    const command = before.match(/^\/([\w:.-]*)$/);
    if (command) return { kind: "command", from: 0, to: caret, query: command[1] };
    return null;
  };

  useEffect(() => {
    if (!enabled || !trigger || (trigger.kind === "command" && !commandsEnabled)) { setItems([]); return undefined; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        if (trigger.kind === "file") {
          const result = await post("/agents/files", { cwd: workspace, query: trigger.query });
          if (!cancelled) { setItems(result.files.map((file) => ({ value: `@${file}`, label: file.slice(file.lastIndexOf("/") + 1), hint: file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "" }))); setIndex(0); }
        } else {
          const key = `${piCommand}|${workspace}`;
          if (commandsCache.current.key !== key) commandsCache.current = { key, list: (await post("/agents/pi/commands", { command: piCommand, cwd: workspace })).commands };
          const needle = trigger.query.toLowerCase();
          const list = commandsCache.current.list.filter((item) => item.name.toLowerCase().includes(needle)).slice(0, 30);
          if (!cancelled) { setItems(list.map((item) => ({ value: `/${item.name}`, label: `/${item.name}`, hint: item.description }))); setIndex(0); }
        }
      } catch { if (!cancelled) setItems([]); }
    }, trigger.kind === "file" ? 120 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [trigger?.kind, trigger?.query, workspace, enabled, commandsEnabled, piCommand]);

  const refresh = (text, caret, composing) => setTrigger(enabled && !composing ? detect(text, caret) : null);

  const accept = (item) => {
    const insert = `${item.value} `;
    const next = value.slice(0, trigger.from) + insert + value.slice(trigger.to);
    onChange(next);
    setTrigger(null); setItems([]);
    const caret = trigger.from + insert.length;
    window.requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(caret, caret); });
  };

  const open = !!trigger && items.length > 0;
  return (
    <>
      <textarea
        ref={ref}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(event) => { onChange(event.target.value); refresh(event.target.value, event.target.selectionStart, event.nativeEvent.isComposing); }}
        onClick={(event) => refresh(event.target.value, event.target.selectionStart, false)}
        onBlur={() => window.setTimeout(() => setTrigger(null), 120)}
        onKeyDown={(event) => {
          const composing = event.nativeEvent.isComposing;
          if (open && !composing) {
            if (event.key === "ArrowDown") { event.preventDefault(); setIndex((current) => (current + 1) % items.length); return; }
            if (event.key === "ArrowUp") { event.preventDefault(); setIndex((current) => (current - 1 + items.length) % items.length); return; }
            if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); accept(items[index]); return; }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setTrigger(null); return; }
          }
          if (event.key === "Enter" && !event.shiftKey && !composing) { event.preventDefault(); onSubmit(); }
        }}
      />
      {open && (
        <ul className="suggest-menu" role="listbox" aria-label={trigger.kind === "file" ? tr("工作目录里的文件", "Files in the working folder") : tr("Pi 命令和技能", "Pi commands and skills")} onPointerDown={(event) => event.preventDefault()}>
          {items.map((item, at) => (
            <li key={item.value} role="option" aria-selected={at === index} className={at === index ? "active" : ""} onMouseEnter={() => setIndex(at)} onClick={() => accept(item)}>
              <strong>{item.label}</strong>{item.hint && <small>{item.hint}</small>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
