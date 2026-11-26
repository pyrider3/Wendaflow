import React, { useState } from "react";
import { Button, Page } from "./settings/ui.jsx";
import { ProviderMark } from "./ModelMenu.jsx";

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
// Ready-made starting points; everything stays editable afterwards.
const PRESETS = [
  { key: "openai", label: "OpenAI", format: "responses", endpoint: "https://api.openai.com/v1", model: "gpt-5.4" },
  { key: "claude", label: "Claude", format: "anthropic", endpoint: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5" },
  { key: "gemini", label: "Gemini", format: "gemini", endpoint: GEMINI, model: "gemini-2.5-flash" },
  { key: "deepseek", label: "DeepSeek", format: "openai-compatible", endpoint: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { key: "qwen", label: "通义千问 Qwen", format: "openai-compatible", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { key: "openrouter", label: "OpenRouter", format: "openai-compatible", endpoint: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini" },
  { key: "compatible", label: "", format: "openai-compatible", endpoint: "", model: "" },
  { key: "ollama", label: "Ollama", local: true, endpoint: "http://127.0.0.1:11434", model: "qwen2.5:7b" },
];
const FORMATS = [["responses", "OpenAI Responses"], ["openai-compatible", "OpenAI-compatible"], ["anthropic", "Anthropic"], ["gemini", "Gemini"]];

// Settings → Model connections: every model as a tile, an "add" tile with provider presets, and an editor
// for the selected one. Cloud and local (Ollama) models live side by side.
export function ModelConnectionsPanel({ cloudProfiles, setCloudProfiles, localProfiles, setLocalProfiles, chatModel, setChatModel, defaultChatModel, makeDefaultChatModel, testLocal, tr }) {
  const all = [
    ...cloudProfiles.map((profile) => ({ ...profile, kind: "cloud", key: `cloud:${profile.id}` })),
    ...localProfiles.map((profile) => ({ ...profile, kind: "local", key: `local:${profile.id}` })),
  ];
  const [selectedKey, setSelectedKey] = useState(() => (all.find((item) => item.key === chatModel) || all[0])?.key || "");
  const [adding, setAdding] = useState(all.length === 0);
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState("");
  const selected = all.find((item) => item.key === selectedKey) || null;
  const update = (patch) => {
    if (!selected) return;
    const apply = (items) => items.map((profile) => (profile.id === selected.id ? { ...profile, ...patch } : profile));
    if (selected.kind === "cloud") setCloudProfiles(apply); else setLocalProfiles(apply);
  };
  const add = (preset) => {
    const id = `${preset.local ? "local" : "cloud"}-${Date.now()}`;
    if (preset.local) setLocalProfiles((items) => [...items, { id, name: preset.label, endpoint: preset.endpoint, model: preset.model }]);
    else setCloudProfiles((items) => [...items, { id, name: preset.label || tr("兼容 OpenAI 的模型", "OpenAI-compatible model"), format: preset.format, endpoint: preset.endpoint, model: preset.model, apiKey: "", useLocalProxy: true, chatOptions: { thinking: false, reasoning: "none", temperature: 0.7 } }]);
    setSelectedKey(`${preset.local ? "local" : "cloud"}:${id}`); setAdding(false); setStatus(""); setReveal(false);
  };
  const remove = () => {
    if (!selected) return;
    const rest = all.filter((item) => item.key !== selected.key);
    if (selected.kind === "cloud") setCloudProfiles((items) => items.filter((profile) => profile.id !== selected.id));
    else setLocalProfiles((items) => items.filter((profile) => profile.id !== selected.id));
    if (chatModel === selected.key) setChatModel(rest[0]?.key || "");
    setSelectedKey(rest[0]?.key || "");
  };
  const stateOf = (item) => item.kind === "local" ? ["local", tr("本机", "On this computer")] : !item.model ? ["missing", tr("缺少模型名", "Model missing")] : item.apiKey ? ["ready", tr("已配置", "Ready")] : ["missing", tr("缺少密钥", "Key missing")];
  return (
    <Page title={tr("模型连接", "Model connections")} description={tr("在这里接入要用的模型。对话、绘图和行动（Pi）都用这些连接，修改会自动保存。", "Connect the models you want to use. Chat, drawing and actions (Pi) all use these connections; changes save automatically.")}>
      <div className="mc-grid" role="list">
        {all.map((item) => {
          const [tone, label] = stateOf(item);
          return (
            <button key={item.key} role="listitem" className={`mc-tile ${item.key === selectedKey && !adding ? "selected" : ""}`} onClick={() => { setSelectedKey(item.key); setAdding(false); setStatus(""); setReveal(false); }}>
              <ProviderMark provider={item.kind === "local" ? "ollama" : item.endpoint || ""} label={`${item.name} ${item.model}`} />
              <span className="mc-name">{item.name || tr("未命名", "Untitled")}</span>
              <small className="mc-model">{item.model || "—"}</small>
              <span className={`mc-state ${tone}`}>{label}</span>
              {defaultChatModel === item.key && <span className="mc-default">{tr("默认", "Default")}</span>}
            </button>
          );
        })}
        <button className={`mc-tile add ${adding ? "selected" : ""}`} onClick={() => setAdding(true)}><span className="mc-plus">＋</span><span className="mc-name">{tr("添加模型", "Add a model")}</span></button>
      </div>

      {adding && (
        <section className="mc-panel mc-presets">
          <header><strong>{tr("选择服务商", "Choose a provider")}</strong><small>{tr("先选一个起点，地址和模型都会帮你填好，之后可以改。", "Pick a starting point; the endpoint and model are filled in for you and stay editable.")}</small></header>
          <div className="mc-preset-grid">
            {PRESETS.map((preset) => (
              <button key={preset.key} onClick={() => add(preset)}>
                <ProviderMark provider={preset.key} label={preset.label} />
                <span>{preset.label || tr("其他兼容 OpenAI 的服务", "Other OpenAI-compatible")}</span>
                {preset.local && <small>{tr("本机", "Local")}</small>}
              </button>
            ))}
          </div>
        </section>
      )}

      {!adding && selected && (
        <section className="mc-panel" key={selectedKey}>
          <header>
            <ProviderMark provider={selected.kind === "local" ? "ollama" : selected.endpoint || ""} label={`${selected.name} ${selected.model}`} />
            <strong>{selected.name || tr("未命名", "Untitled")}</strong>
            <span className="mc-spacer" />
            {defaultChatModel !== selected.key && <Button onClick={() => makeDefaultChatModel(selected.key)}>{tr("设为默认", "Set default")}</Button>}
            <Button kind="danger" onClick={remove}>{tr("删除", "Delete")}</Button>
          </header>
          <div className="mc-fields">
            <label><span>{tr("显示名称", "Display name")}</span><input value={selected.name} onChange={(event) => update({ name: event.target.value })} /></label>
            <label><span>{tr("模型", "Model")}</span><input value={selected.model} onChange={(event) => update({ model: event.target.value })} placeholder={selected.kind === "local" ? "qwen2.5:7b" : "gpt-5.4"} spellCheck={false} /></label>
            {selected.kind === "cloud" && (
              <div className="mc-field wide"><span>{tr("接口格式", "API format")}</span>
                <div className="mc-seg" role="radiogroup">{FORMATS.map(([value, label]) => <button key={value} role="radio" aria-checked={selected.format === value} className={selected.format === value ? "selected" : ""} onClick={() => update({ format: value, ...(value === "gemini" && !selected.endpoint ? { endpoint: GEMINI } : {}) })}>{label}</button>)}</div>
              </div>
            )}
            <label className="wide"><span>{selected.kind === "local" ? tr("服务地址", "Server URL") : tr("接口地址", "Endpoint")}</span><input value={selected.endpoint} onChange={(event) => update({ endpoint: event.target.value })} placeholder="https://…" spellCheck={false} /></label>
            {selected.kind === "cloud" && (
              <label className="wide"><span>{tr("API 密钥", "API key")}</span>
                <span className="mc-key"><input type={reveal ? "text" : "password"} autoComplete="off" value={selected.apiKey || ""} onChange={(event) => update({ apiKey: event.target.value })} placeholder={tr("粘贴密钥，只保存在这台电脑上", "Paste the key; it stays on this computer")} spellCheck={false} /><button type="button" onClick={() => setReveal((value) => !value)}>{reveal ? tr("隐藏", "Hide") : tr("显示", "Show")}</button></span>
              </label>
            )}
          </div>
          <footer>
            <span className={`mc-state ${stateOf(selected)[0]}`}>{status || stateOf(selected)[1]}</span>
            {selected.kind === "local" && <Button kind="primary" onClick={async () => { setStatus(tr("正在连接…", "Connecting…")); setStatus(await testLocal(selected.endpoint)); }}>{tr("测试连接", "Test connection")}</Button>}
          </footer>
        </section>
      )}
    </Page>
  );
}
