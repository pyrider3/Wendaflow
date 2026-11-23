// Model calls for agent requests. They reuse the browser app's own gateway, so
// an answer requested by an agent is built from exactly the same canvas context
// (ancestors, extra parents, references) as one the user asks for by hand.
import { streamCloud, streamOllama } from '../modelGateway.js';

export const DEFAULT_LOCAL = { value: 'local:local-default', kind: 'local', name: 'Ollama', endpoint: 'http://127.0.0.1:11434', model: 'qwen2.5:7b' };

function safeEndpoint(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('仅允许 HTTP(S) 模型接口');
  if (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('非本机模型接口必须使用 HTTPS');
  return url.toString().replace(/\/$/, '');
}

function fromObject(spec) {
  const format = String(spec.format || 'openai-compatible');
  if (format === 'ollama' || spec.kind === 'local') return { kind: 'local', name: spec.name || 'Ollama', endpoint: safeEndpoint(spec.endpoint || DEFAULT_LOCAL.endpoint), model: String(spec.model || DEFAULT_LOCAL.model), chatOptions: spec.chatOptions || {} };
  if (!spec.model) throw new Error('模型配置缺少 model');
  return { kind: 'cloud', name: spec.name || format, format, endpoint: safeEndpoint(spec.endpoint), model: String(spec.model), apiKey: String(spec.apiKey || ''), chatOptions: spec.chatOptions || {} };
}

function envProfile(env) {
  if (!env.WENDAFLOW_AGENT_MODEL) return null;
  try { return fromObject(JSON.parse(env.WENDAFLOW_AGENT_MODEL)); } catch (error) { throw new Error(`WENDAFLOW_AGENT_MODEL 无效：${error.message}`); }
}

// requested: undefined (the model selected in the browser), a profile value,
// name or model id shared by the browser, "ollama:<model>", or a full object.
export function resolveModel(requested, { profiles = [], defaultModel = null } = {}, env = process.env) {
  if (requested && typeof requested === 'object') return fromObject(requested);
  const wanted = typeof requested === 'string' ? requested.trim() : '';
  if (wanted.startsWith('ollama:')) return { ...DEFAULT_LOCAL, value: null, model: wanted.slice(7) };
  if (wanted) {
    const lower = wanted.toLowerCase();
    const hit = profiles.find(p => p.value === wanted) || profiles.find(p => String(p.name || '').toLowerCase() === lower) || profiles.find(p => String(p.model || '').toLowerCase() === lower);
    if (hit) return hit;
    throw new Error(`找不到模型「${wanted}」。可用：${profiles.map(p => `${p.name} · ${p.model}`).join('；') || '（浏览器未共享模型，请先在浏览器打开 Wendaflow）'}`);
  }
  const selected = profiles.find(p => p.value === defaultModel);
  return selected || envProfile(env) || profiles[0] || DEFAULT_LOCAL;
}

export function publicModel(profile) {
  return { value: profile.value || null, name: profile.name, model: profile.model, kind: profile.kind, ...(profile.format ? { format: profile.format } : {}) };
}

export function normalizeChatOptions(options = {}) {
  const resolved = { thinking: false, reasoning: 'none', temperature: 0.7, ...options };
  return !resolved.thinking || resolved.reasoning === 'none' ? { ...resolved, thinking: false, reasoning: 'none' } : resolved;
}

export function complete(profile, messages, { onToken = () => {}, onThinking, signal, streamers = { streamCloud, streamOllama } } = {}) {
  const chatOptions = normalizeChatOptions(profile.chatOptions);
  if (profile.kind === 'local') return streamers.streamOllama({ endpoint: profile.endpoint, model: profile.model, messages, chatOptions, signal, onToken, onThinking });
  if (!profile.apiKey) throw new Error(`尚未填写 ${profile.name} 的 API 密钥`);
  return streamers.streamCloud({ ...profile, useLocalProxy: false, messages, chatOptions, signal, onToken, onThinking });
}
