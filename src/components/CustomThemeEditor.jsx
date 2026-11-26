import React, { useState } from "react";
import { Button } from "./settings/ui.jsx";
import { CUSTOM_PRESETS, DEFAULT_CUSTOM_THEME, normalizeCustomTheme } from "../themes/custom-theme.mjs";

// Settings → Appearance → Custom: quick starts, a live preview, then colours, shape, grid, type and effects.
// The page's --custom-* variables update as you edit, so the preview (and the canvas behind) follow at once.
export function CustomThemeEditor({ value, onChange, tr }) {
  const [code, setCode] = useState(null);
  const [note, setNote] = useState("");
  const set = (patch) => onChange((current) => normalizeCustomTheme({ ...current, ...patch }));

  const presets = [
    ["daylight", tr("晨光", "Daylight")], ["night", tr("夜幕", "Night")], ["forest", tr("森林", "Forest")],
    ["rose", tr("玫瑰", "Rose")], ["deepsea", tr("深海蓝", "Deep sea")], ["amber", tr("琥珀夜", "Amber night")],
  ];
  const colorGroups = [
    [tr("画布", "Canvas"), [["background", tr("背景", "Background")], ["grid", tr("网格", "Grid")], ["glow", tr("光晕", "Glow")]]],
    [tr("卡片", "Cards"), [["card", tr("卡片底色", "Card fill")], ["cardBorder", tr("卡片边框", "Card border")], ["text", tr("标题文字", "Title text")], ["body", tr("正文文字", "Body text")]]],
    [tr("强调", "Accents"), [["accent", tr("强调色", "Accent")], ["selection", tr("选中色", "Selection")], ["line", tr("连线", "Lines")]]],
    [tr("界面", "Interface"), [["panel", tr("面板和菜单", "Panels and menus")], ["muted", tr("次要文字", "Secondary text")]]],
  ];
  const sliders = [
    ["radius", tr("卡片圆角", "Card corners"), 0, 24, 1, "px"],
    ["borderWidth", tr("边框粗细", "Border width"), 0, 3, 0.5, "px"],
    ["lineWidth", tr("连线粗细", "Line width"), 1, 3, 0.25, ""],
    ["cardOpacity", tr("卡片不透明度", "Card opacity"), 60, 100, 5, "%"],
  ];
  const segments = [
    ["shadow", tr("阴影", "Shadow"), [["none", tr("无", "None")], ["soft", tr("柔和", "Soft")], ["float", tr("浮起", "Floating")], ["hard", tr("硬投影", "Hard")], ["glow", tr("发光", "Glow")]]],
    ["gridStyle", tr("网格", "Grid"), [["dots", tr("圆点", "Dots")], ["lines", tr("方格", "Lines")], ["none", tr("无", "None")]]],
    ["font", tr("字体", "Font"), [["system", tr("默认", "Default")], ["serif", tr("宋体", "Serif")], ["kai", tr("楷体", "Kai")], ["mono", tr("等宽", "Mono")], ["rounded", tr("圆体", "Rounded")]]],
  ];

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(value)); setNote(tr("主题代码已复制", "Theme code copied")); }
    catch { setCode(JSON.stringify(value)); setNote(tr("无法访问剪贴板，请手动复制下面的代码", "Could not reach the clipboard; copy the code below")); }
  };
  const applyCode = () => {
    try { onChange(normalizeCustomTheme(JSON.parse(code))); setCode(null); setNote(tr("已应用主题代码", "Theme code applied")); }
    catch { setNote(tr("这段代码无法识别", "That code could not be read")); }
  };

  return (
    <div className="ct">
      <div className="ct-presets" role="group" aria-label={tr("从一套配色开始", "Start from a palette")}>
        <span className="ct-label">{tr("从一套配色开始", "Start from a palette")}</span>
        {presets.map(([id, label]) => (
          <button key={id} type="button" onClick={() => set({ ...CUSTOM_PRESETS[id] })}>
            <i style={{ background: `linear-gradient(135deg, ${CUSTOM_PRESETS[id].background} 50%, ${CUSTOM_PRESETS[id].accent} 50%)` }} aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      <div className={`ct-preview grid-${value.gridStyle}`} aria-hidden="true">
        <div className="ct-card"><b>{tr("一个想法", "An idea")}</b><span>{tr("卡片里的正文会这样显示。", "Body text in a card looks like this.")}</span></div>
        <svg className="ct-link" viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M0 8 C 50 8, 50 32, 100 32" /></svg>
        <div className="ct-card selected"><b>{tr("选中的卡片", "Selected card")}</b><span>{tr("强调色和选中色", "Accent and selection")}</span></div>
        <span className="ct-send">↑</span>
      </div>

      <section className="ct-section">
        <h4>{tr("颜色", "Colours")}</h4>
        {colorGroups.map(([title, keys]) => (
          <div key={title} className="ct-group">
            <span className="ct-label">{title}</span>
            <div className="ct-colors">
              {keys.map(([key, label]) => (
                <label key={key} className="ct-color">
                  <input type="color" value={value[key]} onChange={(event) => set({ [key]: event.target.value })} aria-label={label} />
                  <span>{label}</span>
                  <input className="ct-hex" value={value[key]} spellCheck={false} aria-label={`${label} HEX`}
                    onChange={(event) => { const next = event.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(next)) set({ [key]: next }); }} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="ct-section">
        <h4>{tr("形状与效果", "Shape and effects")}</h4>
        <div className="ct-sliders">
          {sliders.map(([key, label, min, max, step, unit]) => (
            <label key={key} className="ct-slider">
              <span>{label}<b>{value[key]}{unit}</b></span>
              <input type="range" min={min} max={max} step={step} value={value[key]} onChange={(event) => set({ [key]: Number(event.target.value) })} />
            </label>
          ))}
          <label className="ct-slider">
            <span>{tr("背景光晕", "Background glow")}<b>{value.glowStrength}%</b></span>
            <input type="range" min={0} max={100} step={5} value={value.glowStrength} onChange={(event) => set({ glowStrength: Number(event.target.value) })} />
          </label>
          <label className="ct-slider">
            <span>{tr("网格间距", "Grid spacing")}<b>{value.gridSize}px</b></span>
            <input type="range" min={12} max={48} step={2} value={value.gridSize} disabled={value.gridStyle === "none"} onChange={(event) => set({ gridSize: Number(event.target.value) })} />
          </label>
        </div>
        {segments.map(([key, label, options]) => (
          <div key={key} className="ct-seg-row">
            <span className="ct-label">{label}</span>
            <div className="ct-seg" role="radiogroup" aria-label={label}>
              {options.map(([option, text]) => (
                <button key={option} type="button" role="radio" aria-checked={value[key] === option} className={value[key] === option ? "selected" : ""} onClick={() => set({ [key]: option })}>{text}</button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {code !== null && (
        <div className="ct-code">
          <textarea value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} placeholder={tr("把主题代码粘贴到这里", "Paste theme code here")} />
          <div><Button kind="primary" className="small" onClick={applyCode}>{tr("应用", "Apply")}</Button><Button kind="ghost" className="small" onClick={() => setCode(null)}>{tr("取消", "Cancel")}</Button></div>
        </div>
      )}
      <div className="ct-actions">
        <span className="sx-note" role="status">{note || tr("修改会立即应用，并保存在这台设备上。", "Changes apply at once and are saved on this device.")}</span>
        <Button kind="ghost" className="small" onClick={copyCode}>{tr("复制主题代码", "Copy theme code")}</Button>
        <Button kind="ghost" className="small" onClick={() => { setCode(""); setNote(""); }}>{tr("粘贴主题代码", "Paste theme code")}</Button>
        <Button kind="ghost" className="small" onClick={() => { onChange(DEFAULT_CUSTOM_THEME); setNote(""); }}>{tr("恢复默认", "Restore defaults")}</Button>
      </div>
    </div>
  );
}
