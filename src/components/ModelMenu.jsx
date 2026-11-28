import React, { useEffect, useMemo, useRef, useState } from "react";
import claudeIcon from "../assets/model-icons/claude-color.svg";
import openaiIcon from "../assets/model-icons/openai.svg";
import geminiIcon from "../assets/model-icons/gemini-color.svg";
import deepseekIcon from "../assets/model-icons/deepseek-color.svg";
import qwenIcon from "../assets/model-icons/qwen-color.svg";
import metaIcon from "../assets/model-icons/meta-color.svg";
import mistralIcon from "../assets/model-icons/mistral-color.svg";
import kimiIcon from "../assets/model-icons/kimi-color.svg";
import zhipuIcon from "../assets/model-icons/zhipu-color.svg";
import grokIcon from "../assets/model-icons/grok.svg";
import doubaoIcon from "../assets/model-icons/doubao-color.svg";
import minimaxIcon from "../assets/model-icons/minimax-color.svg";
import hunyuanIcon from "../assets/model-icons/hunyuan-color.svg";
import ollamaIcon from "../assets/model-icons/ollama.svg";
import openrouterIcon from "../assets/model-icons/openrouter-color.svg";

// The providers' own marks (see src/assets/model-icons/README.md). Single-colour marks are drawn with
// the text colour so they stay visible in dark themes; coloured ones are shown as they are.
const MARKS = [
  [/claude|anthropic|fable/, claudeIcon], [/gemini|google|antigravity/, geminiIcon], [/deepseek/, deepseekIcon],
  [/qwen|qwq|tongyi/, qwenIcon], [/\bllama|\bmeta\b/, metaIcon], [/mistral|mixtral|codestral/, mistralIcon],
  [/kimi|moonshot/, kimiIcon], [/glm|zhipu/, zhipuIcon], [/grok|xai/, grokIcon, true], [/doubao/, doubaoIcon],
  [/minimax|abab/, minimaxIcon], [/hunyuan/, hunyuanIcon], [/\bgpt|openai|\bo[134]\b|codex|chatgpt/, openaiIcon, true],
  [/openrouter/, openrouterIcon], [/ollama|local/, ollamaIcon, true],
];
export function ProviderMark({ provider, label }) {
  const key = `${label} ${provider}`.toLowerCase();
  const hit = MARKS.find(([pattern]) => pattern.test(key));
  if (!hit) return <span className="mm-mark none" aria-hidden="true" />;
  return hit[2]
    ? <span className="mm-mark mono" aria-hidden="true" style={{ WebkitMaskImage: `url(${JSON.stringify(hit[1])})`, maskImage: `url(${JSON.stringify(hit[1])})` }} />
    : <img className="mm-mark" src={hit[1]} alt="" aria-hidden="true" draggable={false} />;
}

// The thinking level as a glowing rail: drag or click the thumb, or use the arrow keys.
export function EffortRail({ levels, value, onChange, label, defaultLabel, disabledNote }) {
  const track = useRef(null);
  const stars = useRef(null);
  const speed = useRef(0);
  const index = levels.findIndex((item) => item.value === value);
  const only = levels.length <= 1;
  const at = index >= 0 ? index : -1;
  const pct = at >= 0 && levels.length > 1 ? (at / (levels.length - 1)) * 100 : 0;
  speed.current = 36 + 220 * (pct / 100); // px per second; faster as the level rises
  // The star field drifts continuously; a new level only changes its speed, so the particles never jump or restart.
  useEffect(() => {
    const el = stars.current;
    if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    let frame = 0, last = performance.now(), offset = 0, current = speed.current;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      current += (speed.current - current) * Math.min(1, dt * 4); // ease towards the new speed
      offset = (offset + current * dt) % 220;
      el.style.backgroundPosition = `${offset}px 0`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [only]);
  const pick = (clientX) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || levels.length < 2) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left - 16) / Math.max(1, rect.width - 32)));
    const next = levels[Math.round(ratio * (levels.length - 1))];
    if (next && next.value !== value) onChange(next.value);
  };
  const down = (event) => {
    if (only) return;
    event.preventDefault();
    track.current?.setPointerCapture?.(event.pointerId);
    pick(event.clientX);
  };
  const move = (event) => { if (event.buttons & 1) pick(event.clientX); };
  const key = (event) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = levels[Math.min(levels.length - 1, Math.max(0, (at < 0 ? 0 : at) + step))];
    if (next) onChange(next.value);
  };
  return (
    <div className={`mm-effort-card ${only ? "disabled" : ""}`}>
      <div className="mm-effort-head"><span>{label}</span><b key={value}>{at >= 0 ? levels[at].label : defaultLabel}</b></div>
      {only ? <p className="mm-note">{disabledNote}</p> : (
        <div ref={track} className={`mm-track ${at < 0 ? "unset" : ""}`} style={{ "--p": pct / 100 }} role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={levels.length - 1} aria-valuenow={Math.max(0, at)} aria-valuetext={at >= 0 ? levels[at].label : defaultLabel} onPointerDown={down} onPointerMove={move} onKeyDown={key}>
          <span className="mm-fill"><i ref={stars} /></span>
          {levels.map((item, stop) => <span key={item.value} className={`mm-stop ${stop <= at ? "lit" : ""}`} style={{ "--x": stop / (levels.length - 1) }} title={item.label} />)}
          <span className="mm-thumb"><i /></span>
        </div>
      )}
    </div>
  );
}

function Row({ item, index, selected, starred, starrable, selectedNote, onChange, onToggleFavorite, isDefault, onSetDefault, tr }) {
  return (
    <div className={`mm-row ${selected ? "selected" : ""}`} style={{ "--i": Math.min(index, 14) }}>
      <button role="radio" aria-checked={selected} className="mm-pick" onClick={() => onChange(item.value)}>
        <ProviderMark provider={item.provider} label={`${item.label} ${item.hint || ""}`} />
        <span className="mm-name" title={item.label}>{item.label}</span>
        {selected && selectedNote && <b className="mm-level">{selectedNote}</b>}
        {isDefault && <span className="mm-default">{tr("默认", "Default")}</span>}
        {item.hint && <em title={item.hint}>{item.hint}</em>}
      </button>
      {onSetDefault && item.value && !isDefault && <button className="mm-set-default" title={tr("新任务默认用这个模型", "Use this model for new tasks by default")} onClick={() => onSetDefault(item.value)}>{tr("设为默认", "Set default")}</button>}
      {starrable && item.value && !item.pinned && <button className={`mm-star ${starred ? "on" : ""}`} aria-pressed={starred} aria-label={starred ? tr("从常用中移除", "Remove from frequently used") : tr("设为常用", "Add to frequently used")} title={starred ? tr("从常用中移除", "Remove from frequently used") : tr("设为常用", "Add to frequently used")} onClick={() => onToggleFavorite(item.value)}>{starred ? "★" : "☆"}</button>}
    </div>
  );
}

// Model picker. It opens on the models you starred (plus the one in use); every model lives one level
// down under "All models", where models are starred. Below sits the thinking rail when there is one.
// defaultValue marks the model new tasks use; onSetDefault lets any model become it. A "follow the default"
// entry (empty value) is folded into the real model it stands for, so the default can be starred like any other.
export function ModelMenu({ groups, value, onChange, favorites, onToggleFavorite, searchable, selectedNote, effort, footer, defaultValue = "", onSetDefault, tr }) {
  const [view, setView] = useState("favorites");
  const [query, setQuery] = useState("");
  const starrable = !!onToggleFavorite;
  const all = useMemo(() => groups.flatMap((group) => group.items.map((item) => ({ ...item, provider: group.title || "" }))).filter((item) => !(defaultValue && item.value === "")), [groups, defaultValue]);
  value = value || defaultValue;
  const favoriteRows = useMemo(() => {
    const starred = starrable ? all.filter((item) => item.value && (item.pinned || favorites?.has(item.value))) : [];
    const current = all.find((item) => item.value === value);
    return current && !starred.includes(current) ? [current, ...starred] : starred;
  }, [all, favorites, value, starrable]);
  const allRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((item) => !needle || `${item.label} ${item.hint || ""} ${item.provider}`.toLowerCase().includes(needle));
  }, [all, query]);
  const showAll = view === "all" || !starrable;
  const rows = showAll ? allRows : favoriteRows;
  const rowProps = (item) => ({ selected: item.value === value, starred: starrable && favorites?.has(item.value), starrable, selectedNote, onChange, onToggleFavorite, isDefault: !!defaultValue && item.value === defaultValue, onSetDefault, tr });
  const starredCount = starrable ? all.filter((item) => favorites?.has(item.value)).length : 0;
  return (
    <div className="mm">
      {showAll && starrable ? (
        <div className="mm-head sub">
          <button className="mm-back" onClick={() => { setView("favorites"); setQuery(""); }} aria-label={tr("返回常用模型", "Back to frequently used")}>‹</button>
          <span>{tr("全部模型", "All models")}</span>
          {searchable && <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("搜索模型…", "Search models…")} aria-label={tr("搜索模型…", "Search models…")} spellCheck={false} />}
        </div>
      ) : <div className="mm-head"><span>{starrable ? tr("常用模型", "Frequently used") : tr("模型", "Model")}</span></div>}
      <div key={showAll ? "all" : "favorites"} className={`mm-list ${showAll && starrable ? "slide-in" : "slide-back"}`} role="radiogroup" aria-label={tr("模型", "Model")}>
        {rows.map((item, index) => <Row key={item.value || "-default"} item={item} index={index} tr={tr} {...rowProps(item)} />)}
        {!showAll && !starredCount && <p className="mm-note">{tr("在“全部模型”里点 ☆，把常用的模型放到这里。", "Star models under “All models” to keep them here.")}</p>}
        {showAll && !rows.length && <p className="mm-note">{tr("没有匹配的模型", "No matching models")}</p>}
      </div>
      {!showAll && (
        <button className="mm-more" onClick={() => setView("all")}>
          <span>{tr("全部模型", "All models")}</span><em>{all.length}</em><i aria-hidden="true">›</i>
        </button>
      )}
      {effort && <EffortRail {...effort} />}
      {footer}
    </div>
  );
}
