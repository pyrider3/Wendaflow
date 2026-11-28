import React, { useId, useMemo, useRef, useState } from "react";
import { Button, Page } from "./settings/ui.jsx";
import { ProviderMark } from "./ModelMenu.jsx";
import { probeModelProfile } from "../modelGateway.js";
import { PUBLIC_WEB } from "../localProxy.js";

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
const FORMAT_LABELS = Object.fromEntries(FORMATS);

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
  const [status, setStatus] = useState({ tone: "", text: "" });
  const [probing, setProbing] = useState(false);
  const [detected, setDetected] = useState(null); // { key, models, modelVerified, modelError }
  const [modelFilter, setModelFilter] = useState("");
  const datalistId = useId();
  const activeKeyRef = useRef(selectedKey);
  activeKeyRef.current = selectedKey;
  const selected = all.find((item) => item.key === selectedKey) || null;
  const resetFeedback = () => { setStatus({ tone: "", text: "" }); setModelFilter(""); };
  const update = (patch) => {
    if (!selected) return;
    const apply = (items) => items.map((profile) => (profile.id === selected.id ? { ...profile, ...patch } : profile));
    if (selected.kind === "cloud") setCloudProfiles(apply); else setLocalProfiles(apply);
  };
  const add = (preset) => {
    const id = `${preset.local ? "local" : "cloud"}-${Date.now()}`;
    if (preset.local) setLocalProfiles((items) => [...items, { id, name: preset.label, endpoint: preset.endpoint, model: preset.model }]);
    else setCloudProfiles((items) => [...items, { id, name: preset.label || tr("兼容 OpenAI 的模型", "OpenAI-compatible model"), format: preset.format, endpoint: preset.endpoint, model: preset.model, apiKey: "", useLocalProxy: true, chatOptions: { thinking: false, reasoning: "none", temperature: 0.7 } }]);
    const key = `${preset.local ? "local" : "cloud"}:${id}`;
    if (!chatModel) setChatModel(key);
    setSelectedKey(key); setAdding(false); resetFeedback(); setReveal(false);
  };
  const remove = () => {
    if (!selected) return;
    const rest = all.filter((item) => item.key !== selected.key);
    if (selected.kind === "cloud") setCloudProfiles((items) => items.filter((profile) => profile.id !== selected.id));
    else setLocalProfiles((items) => items.filter((profile) => profile.id !== selected.id));
    if (chatModel === selected.key) setChatModel(rest[0]?.key || "");
    if (defaultChatModel === selected.key && makeDefaultChatModel) makeDefaultChatModel(rest[0]?.key || "");
    setSelectedKey(rest[0]?.key || "");
    if (rest.length === 0) setAdding(true);
    resetFeedback();
  };
  const stateOf = (item) => item.kind === "local" ? ["local", tr("本机", "On this computer")] : !item.model ? ["missing", tr("缺少模型名", "Model missing")] : item.apiKey ? ["ready", tr("已配置", "Ready")] : ["missing", tr("缺少密钥", "Key missing")];

  const probeSelected = async () => {
    if (!selected || probing) return;
    if (selected.kind === "cloud") {
      if (!String(selected.endpoint || "").trim() && selected.format !== "gemini") { setStatus({ tone: "error", text: tr("请先填写接口地址", "Enter an endpoint URL first") }); return; }
      if (!String(selected.apiKey || "").trim()) { setStatus({ tone: "error", text: tr("请先填写 API 密钥", "Enter an API key first") }); return; }
    }
    const targetKey = selected.key;
    setProbing(true);
    setStatus({ tone: "", text: tr("正在检测…", "Detecting…") });
    try {
      const result = await probeModelProfile(
        { endpoint: selected.endpoint, format: selected.format, apiKey: selected.apiKey, model: selected.model, local: selected.kind === "local" },
        { publicWeb: PUBLIC_WEB },
      );
      const patch = {};
      const notes = [];
      if (result.endpointAdjusted && result.endpoint) {
        patch.endpoint = result.endpoint;
        notes.push(tr("已自动修正地址", "Auto-updated endpoint"));
      }
      if (selected.kind === "cloud" && result.formatAdjusted && result.format) {
        patch.format = result.format;
        notes.push(tr("已自动切换接口格式为 {0}", "Auto-switched format to {0}").replace("{0}", FORMAT_LABELS[result.format] || result.format));
      }
      if (!String(selected.model || "").trim() && result.models?.length) {
        patch.model = result.models[0];
        if (!String(selected.name || "").trim() || selected.name === tr("兼容 OpenAI 的模型", "OpenAI-compatible model")) patch.name = result.models[0];
      }
      if (Object.keys(patch).length) update(patch);
      setDetected({ key: targetKey, models: result.models || [], modelVerified: result.modelVerified, modelError: result.modelError || "" });
      setModelFilter("");
      const ms = Math.max(1, Math.round(result.latencyMs || 0));
      let summary = result.models?.length
        ? tr("已连接 · 检测到 {0} 个模型（{1} ms）", "Connected · {0} models found ({1} ms)").replace("{0}", result.models.length).replace("{1}", ms)
        : result.modelVerified
          ? tr("已连接 · 模型可用（{0} ms）", "Connected · model verified ({0} ms)").replace("{0}", ms)
          : tr("已连接 · 未返回模型列表", "Connected · no models listed");
      if (result.modelVerified === false && selected.model) {
        summary = tr("模型「{0}」不可用，可从下方选择", "Model “{0}” did not respond; pick one below").replace("{0}", selected.model);
      }
      if (notes.length) summary = `${summary} · ${notes.join(" · ")}`;
      if (activeKeyRef.current === targetKey) setStatus({ tone: result.modelVerified === false ? "missing" : "ready", text: summary });
    } catch (error) {
      if (activeKeyRef.current !== targetKey) return;
      if (selected.kind === "local" && testLocal) {
        const fallback = await testLocal(selected.endpoint);
        setStatus({ tone: "error", text: fallback });
      } else {
        setStatus({ tone: "error", text: tr("检测失败：{0}", "Detection failed: {0}").replace("{0}", error.message || String(error)) });
      }
    } finally {
      setProbing(false);
    }
  };

  const detectedForSelected = detected?.key === selected?.key ? detected : null;
  const filteredModels = useMemo(() => {
    const list = detectedForSelected?.models || [];
    const needle = modelFilter.trim().toLowerCase();
    return needle ? list.filter((id) => id.toLowerCase().includes(needle)) : list;
  }, [detectedForSelected, modelFilter]);

  const chooseDetectedModel = (modelId) => {
    if (!selected) return;
    const genericName = !selected.name || selected.name === selected.model || selected.name === tr("兼容 OpenAI 的模型", "OpenAI-compatible model");
    update({ model: modelId, ...(genericName ? { name: modelId } : {}) });
    if (detectedForSelected?.modelVerified === false) {
      setDetected((current) => (current?.key === selected.key ? { ...current, modelVerified: true, modelError: "" } : current));
    }
  };

  return (
    <Page title={tr("模型连接", "Model connections")} description={tr("在这里接入要用的模型。对话、绘图和行动（Pi）都用这些连接，修改会自动保存。", "Connect the models you want to use. Chat, drawing and actions (Pi) all use these connections; changes save automatically.")}>
      <div className="mc-grid" role="list">
        {all.map((item) => {
          const [tone, label] = stateOf(item);
          return (
            <button key={item.key} type="button" role="listitem" className={`mc-tile ${item.key === selectedKey && !adding ? "selected" : ""}`} onClick={() => { setSelectedKey(item.key); setAdding(false); resetFeedback(); setReveal(false); }}>
              <ProviderMark provider={item.kind === "local" ? "ollama" : item.endpoint || ""} label={`${item.name} ${item.model}`} />
              <span className="mc-name">{item.name || tr("未命名", "Untitled")}</span>
              <small className="mc-model">{item.model || "—"}</small>
              <span className={`mc-state ${tone}`}>{label}</span>
              {defaultChatModel === item.key && <span className="mc-default">{tr("默认", "Default")}</span>}
            </button>
          );
        })}
        <button type="button" className={`mc-tile add ${adding ? "selected" : ""}`} onClick={() => setAdding(true)}><span className="mc-plus">＋</span><span className="mc-name">{tr("添加模型", "Add a model")}</span></button>
      </div>

      {adding && (
        <section className="mc-panel mc-presets">
          <header><strong>{tr("选择服务商", "Choose a provider")}</strong><small>{tr("先选一个起点，地址和模型都会帮你填好，之后可以改。", "Pick a starting point; the endpoint and model are filled in for you and stay editable.")}</small></header>
          <div className="mc-preset-grid">
            {PRESETS.map((preset) => (
              <button key={preset.key} type="button" onClick={() => add(preset)}>
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
            <label><span>{tr("模型", "Model")}</span><input value={selected.model} list={detectedForSelected?.models?.length ? datalistId : undefined} onChange={(event) => update({ model: event.target.value })} placeholder={selected.kind === "local" ? "qwen2.5:7b" : "gpt-5.4"} autoCorrect="off" autoCapitalize="none" spellCheck={false} /></label>
            {detectedForSelected?.models?.length > 0 && (
              <datalist id={datalistId}>
                {detectedForSelected.models.map((id) => <option key={id} value={id} />)}
              </datalist>
            )}
            {selected.kind === "cloud" && (
              <div className="mc-field wide"><span>{tr("接口格式", "API format")}</span>
                <div className="mc-seg" role="radiogroup">{FORMATS.map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={selected.format === value} className={selected.format === value ? "selected" : ""} onClick={() => update({ format: value, ...(value === "gemini" && !selected.endpoint ? { endpoint: GEMINI } : {}) })}>{label}</button>)}</div>
              </div>
            )}
            <label className="wide"><span>{selected.kind === "local" ? tr("服务地址", "Server URL") : tr("接口地址", "Endpoint")}</span><input type="url" value={selected.endpoint} onChange={(event) => update({ endpoint: event.target.value })} placeholder="https://…" autoCorrect="off" autoCapitalize="none" spellCheck={false} /></label>
            {selected.kind === "cloud" && (
              <label className="wide"><span>{tr("API 密钥", "API key")}</span>
                <span className="mc-key"><input type={reveal ? "text" : "password"} autoComplete="off" autoCorrect="off" autoCapitalize="none" value={selected.apiKey || ""} onChange={(event) => update({ apiKey: event.target.value })} placeholder={tr("粘贴密钥，只保存在这台电脑上", "Paste the key; it stays on this computer")} spellCheck={false} /><button type="button" aria-pressed={reveal} onClick={() => setReveal((value) => !value)}>{reveal ? tr("隐藏", "Hide") : tr("显示", "Show")}</button></span>
              </label>
            )}
          </div>
          {detectedForSelected && detectedForSelected.models.length > 0 && (
            <div className="mc-detected">
              <div className="mc-detected-head">
                <span><strong>{tr("检测到的模型", "Detected models")}</strong> · {detectedForSelected.models.length}</span>
                <small>{tr("点击模型直接填入", "Click a model to use it")}</small>
                {detectedForSelected.models.length > 8 && (
                  <input type="search" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} placeholder={tr("筛选检测到的模型…", "Filter detected models…")} aria-label={tr("筛选检测到的模型…", "Filter detected models…")} autoCorrect="off" autoCapitalize="none" spellCheck={false} />
                )}
              </div>
              <div className="mc-detected-list" role="list">
                {filteredModels.length ? filteredModels.map((id) => (
                  <button key={id} type="button" role="listitem" className={selected.model === id ? "selected" : ""} title={id} onClick={() => chooseDetectedModel(id)}>
                    {id}
                  </button>
                )) : <span className="mc-detected-empty">{tr("没有匹配的模型", "No matching models")}</span>}
              </div>
            </div>
          )}
          <footer>
            <span className={`mc-state ${status.tone || stateOf(selected)[0]}`} role="status" aria-live="polite">{status.text || stateOf(selected)[1]}</span>
            {(!PUBLIC_WEB || selected.kind === "local") && (
              <Button kind="primary" disabled={probing} onClick={() => void probeSelected()}>
                {probing ? tr("正在检测…", "Detecting…") : tr("一键检测", "One-click detect")}
              </Button>
            )}
          </footer>
        </section>
      )}
    </Page>
  );
}
