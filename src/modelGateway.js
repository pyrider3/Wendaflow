import { LOCAL_PROXY_URL } from './localProxy.js';

function imagePayloads(attachments = []) {
  return attachments.filter((item) => item.dataUrl?.startsWith('data:image/')).map((item) => ({ name: item.name, dataUrl: item.dataUrl }));
}

function filePayloads(attachments = []) {
  return attachments.filter((item) => item.dataUrl && !item.dataUrl.startsWith('data:image/')).map((item) => ({ name: item.name, type: item.type, dataUrl: item.dataUrl }));
}

function contentWithFiles(content, attachments = []) {
  const readable = attachments.filter((item) => item.text).map((item) => `\n\n---\n附件「${item.name}」的内容：\n\n${item.text}`);
  return `${content || '请阅读并分析我上传的附件。'}${readable.join('')}`;
}

function userMessage(content, attachments = []) {
  return { role: 'user', content: contentWithFiles(content, attachments), images: imagePayloads(attachments), files: filePayloads(attachments) };
}

export function contextPlan(nodes, parentId, excludedIds = [], extraRelations = []) {
  const map = new Map(nodes.map((node) => [node.id, node]));
  const excluded = new Set(excludedIds);
  const path = [];
  let cursor = map.get(parentId);
  while (cursor) {
    if (cursor.type !== 'action' && !excluded.has(cursor.id)) path.unshift({ node: cursor, relation: 'inherit' });
    cursor = cursor.parentId ? map.get(cursor.parentId) : null;
  }
  const seen = new Set(path.map((item) => item.node.id));
  for (const { node } of [...path]) {
    for (const relation of node.relations || []) {
      if (!['reference', 'merge'].includes(relation.type) || excluded.has(relation.targetId) || seen.has(relation.targetId)) continue;
      const target = map.get(relation.targetId);
      if (target && target.type !== 'action') { path.push({ node: target, relation: relation.type }); seen.add(target.id); }
    }
  }
  for (const relation of extraRelations || []) {
    const targetId = typeof relation === 'string' ? relation : relation.targetId;
    const type = typeof relation === 'string' ? 'merge' : relation.type || 'merge';
    if (!['reference', 'merge'].includes(type) || excluded.has(targetId) || seen.has(targetId)) continue;
    const target = map.get(targetId);
    if (target && target.type !== 'action') { path.push({ node: target, relation: type }); seen.add(target.id); }
  }
  return path;
}

export function contextAttachments(nodes, parentId, attachments = [], excludedIds = [], extraRelations = []) {
  const seen = new Set();
  // Do not silently resend every large binary from an ancestor on each child
  // request.  That made a normal branch appear to hang before a cloud request
  // was even issued (a PPTX/image history could be tens of MB). Current input
  // attachments are always sent; inherited attachments are restricted to
  // compact text/images that every provider can carry reliably.
  const inherited = contextPlan(nodes, parentId, excludedIds, extraRelations)
    .flatMap(({ node }) => node.attachments || [])
    .filter((attachment) => attachment?.text || (attachment?.dataUrl?.startsWith('data:image/') && (attachment.size || 0) <= 6 * 1024 * 1024));
  return [...inherited, ...attachments]
    .filter((attachment) => attachment && !seen.has(attachment.id || `${attachment.name}:${attachment.size}`) && seen.add(attachment.id || `${attachment.name}:${attachment.size}`));
}

export function contextMessages(nodes, parentId, prompt, attachments = [], excludedIds = [], extraRelations = []) {
  const path = contextPlan(nodes, parentId, excludedIds, extraRelations);
  const contextBlocks = [];
  // A branching canvas can accumulate very long answers. Sending every byte
  // back on each child request makes some providers wait indefinitely before
  // their first token. Keep the complete recent idea, but bound history.
  let remaining = 24_000;
  const clipped = (value, label) => {
    const text = String(value || '');
    const limit = Math.min(5_000, remaining);
    if (limit <= 0) return '';
    remaining -= Math.min(text.length, limit);
    return text.length > limit ? `${text.slice(0, limit)}\n\n[${label}过长，已保留前 ${limit} 字符]` : text;
  };
  for (const { node, relation } of path) {
    const parts = [];
    if (node.prompt) parts.push(`用户问题：${clipped(node.prompt, '问题上下文')}`);
    if (node.content) {
      const content = clipped(node.content, '回答上下文');
      if (content) parts.push(node.type === 'thought' ? `用户想法 / 背景：${content}` : `此前回答：${content}`);
    }
    const heldAttachments = (node.attachments || []).filter((attachment) => !attachment.text && !(attachment.dataUrl?.startsWith('data:image/') && (attachment.size || 0) <= 6 * 1024 * 1024));
    if (heldAttachments.length) parts.push(`历史附件索引（未随本轮重复上传）：${heldAttachments.map((attachment) => attachment.name).join('、')}`);
    if (parts.length) contextBlocks.push(`【${relation === 'merge' ? '合并上下文' : relation === 'reference' ? '引用上下文' : '继承上下文'} · ${node.title || '历史节点'}】\n${parts.join('\n')}`);
  }
  // Keep the transport shape identical for root and branch requests. A few
  // OpenAI-compatible providers silently stall on mixed user/assistant role
  // histories, whereas one explicit context-injection user turn is portable.
  const prefix = contextBlocks.length ? `以下是必须继承的画布上下文，请据此回答，不要忽略最早的想法：\n\n${contextBlocks.join('\n\n---\n\n')}\n\n=== 当前问题 ===\n` : '';
  return [userMessage(`${prefix}${prompt || '请继续基于上述上下文回答。'}`, contextAttachments(nodes, parentId, attachments, excludedIds, extraRelations))];
}

function ollamaMessages(messages) {
  return messages.map(({ role, content, images }) => ({ role, content, ...(images?.length ? { images: images.map((image) => image.dataUrl.split(',')[1]) } : {}) }));
}

function openAICompatibleMessages(messages) {
  return messages.map(({ role, content, images }) => images?.length && role === 'user' ? { role, content: [{ type: 'text', text: content }, ...images.map((image) => ({ type: 'image_url', image_url: { url: image.dataUrl } }))] } : { role, content });
}

function responsesMessages(messages) {
  return messages.map(({ role, content, images, files }) => (images?.length || files?.length) && role === 'user' ? { role, content: [{ type: 'input_text', text: content }, ...(images || []).map((image) => ({ type: 'input_image', image_url: image.dataUrl })), ...(files || []).map((file) => ({ type: 'input_file', filename: file.name, file_data: file.dataUrl }))] } : { role, content });
}

function anthropicMessages(messages) {
  return messages.map(({ role, content, images, files }) => (images?.length || files?.length) && role === 'user' ? { role, content: [{ type: 'text', text: content }, ...(images || []).map((image) => { const [meta, data] = image.dataUrl.split(','); return { type: 'image', source: { type: 'base64', media_type: meta.match(/^data:([^;]+)/)?.[1] || 'image/png', data } }; }), ...(files || []).filter((file) => file.type === 'application/pdf').map((file) => ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.dataUrl.split(',')[1] } }))] } : { role, content });
}

function geminiContents(messages) {
  return messages.map(({ role, content, images, files }) => ({ role: role === 'assistant' ? 'model' : 'user', parts: [{ text: content }, ...[...(images || []), ...(files || [])].map((file) => { const [meta, data] = file.dataUrl.split(','); return { inline_data: { mime_type: meta.match(/^data:([^;]+)/)?.[1] || file.type || 'application/octet-stream', data } }; })] }));
}

export async function chatWithOllama({ endpoint, model, messages, signal }) {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: ollamaMessages(messages), stream: false }), signal,
  });
  if (!response.ok) throw new Error(`Ollama 返回 ${response.status}`);
  const data = await response.json();
  if (!data?.message?.content) throw new Error('Ollama 没有返回有效内容');
  return data.message.content.trim();
}

export async function streamOllama({ endpoint, model, messages, chatOptions = {}, signal, onToken, onThinking }) {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: ollamaMessages(messages), stream: true, options: Number.isFinite(chatOptions.temperature) ? { temperature: chatOptions.temperature } : undefined, ...(typeof chatOptions.thinking === 'boolean' ? { think: chatOptions.thinking } : {}) }), signal,
  });
  if (!response.ok) throw new Error(`Ollama 返回 ${response.status}`);
  if (!response.body) throw new Error('浏览器无法读取流式响应');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', complete = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line)?.message || {};
      const thought = message.thinking || message.reasoning || '';
      if (thought && chatOptions.reasoning !== 'none') onThinking?.(thought);
      const token = message.content || '';
      complete += token;
      if (token) onToken(complete);
    }
  }
  return complete.trim();
}

export async function streamOpenAIResponses({ endpoint, apiKey, model, messages, chatOptions = {}, signal, onToken, onThinking }) {
  const isDeepSeek = /deepseek/i.test(model || '') || /api\.deepseek\.com/i.test(endpoint || '');
  const responseReasoning = isDeepSeek ? { effort: chatOptions.reasoning === 'none' ? 'none' : chatOptions.reasoning } : chatOptions.reasoning && chatOptions.reasoning !== 'none' ? { effort: chatOptions.reasoning } : null;
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: responsesMessages(messages), stream: true, store: false, ...(responseReasoning ? { reasoning: responseReasoning } : {}), ...(Number.isFinite(chatOptions.temperature) ? { temperature: chatOptions.temperature } : {}) }), signal,
  });
  if (!response.ok) throw new Error(`云端接口返回 ${response.status}`);
  if (!response.body) throw new Error('浏览器无法读取流式响应');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', complete = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const event of events) {
      const dataLine = event.split('\n').find((line) => line.startsWith('data:'));
      if (!dataLine || dataLine.slice(5).trim() === '[DONE]') continue;
      const data = JSON.parse(dataLine.slice(5));
      if (data.type === 'response.output_text.delta' && data.delta) {
        complete += data.delta;
        onToken(complete);
      }
      if ((data.type === 'response.reasoning_summary_text.delta' || data.type === 'response.reasoning_text.delta') && data.delta) onThinking?.(data.delta);
      if (data.type === 'error') throw new Error(data.message || '云端流式请求失败');
    }
  }
  return complete.trim();
}

async function readSSE(response, signal, onEvent) {
  if (!response.ok) throw new Error(`API 返回 ${response.status}`);
  if (!response.body) throw new Error('浏览器无法读取流式响应');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (!signal?.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const event of events) {
      const data = event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('');
      if (data && data !== '[DONE]') onEvent(JSON.parse(data));
    }
  }
}

export async function streamOpenAICompatible({ endpoint, apiKey, model, messages, chatOptions = {}, signal, onToken, onThinking }) {
  const isDoubao = /doubao/i.test(model || '') || /(?:volces|volcengine)\.com/i.test(endpoint || '');
  const isDeepSeek = /deepseek/i.test(model || '') || /api\.deepseek\.com/i.test(endpoint || '');
  const reasoningEffort = chatOptions.reasoning === 'none' ? 'minimal' : chatOptions.reasoning;
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: openAICompatibleMessages(messages), stream: true, ...(Number.isFinite(chatOptions.temperature) ? { temperature: chatOptions.temperature } : {}), ...(isDoubao && reasoningEffort ? { reasoning_effort: reasoningEffort } : {}), ...(isDeepSeek ? { thinking: { type: chatOptions.reasoning === 'none' ? 'disabled' : 'enabled' } } : {}), ...(!isDoubao && !isDeepSeek && typeof chatOptions.thinking === 'boolean' ? { enable_thinking: chatOptions.thinking } : {}) }), signal,
  });
  let complete = '';
  await readSSE(response, signal, (data) => {
    const delta = data.choices?.[0]?.delta || {};
    const thought = delta.reasoning_content || delta.reasoning || '';
    if (thought && chatOptions.reasoning !== 'none') onThinking?.(thought);
    const token = delta.content || '';
    if (token) { complete += token; onToken(complete); }
  });
  return complete.trim();
}

export async function streamAnthropic({ endpoint, apiKey, model, messages, signal, onToken, onThinking }) {
  const system = messages.filter((item) => item.role === 'system').map((item) => item.content).join('\n');
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model, messages: anthropicMessages(messages.filter((item) => item.role !== 'system')), system: system || undefined, max_tokens: 4096, stream: true }), signal,
  });
  let complete = '';
  await readSSE(response, signal, (data) => {
    const token = data.type === 'content_block_delta' ? data.delta?.text || '' : '';
    const thought = data.type === 'content_block_delta' ? data.delta?.thinking || '' : '';
    if (thought) onThinking?.(thought);
    if (token) { complete += token; onToken(complete); }
    if (data.type === 'error') throw new Error(data.error?.message || 'Claude API 请求失败');
  });
  return complete.trim();
}

export async function streamGemini({ endpoint, apiKey, model, messages, chatOptions = {}, signal, onToken, onThinking }) {
  const base = (endpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const response = await fetch(`${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: geminiContents(messages), generationConfig: { ...(Number.isFinite(chatOptions.temperature) ? { temperature: chatOptions.temperature } : {}), ...(chatOptions.thinking ? { thinkingConfig: { thinkingBudget: -1 } } : {}) } }), signal,
  });
  let complete = '';
  await readSSE(response, signal, (data) => {
    const parts = data.candidates?.[0]?.content?.parts || [];
    const thought = parts.filter((part) => part.thought).map((part) => part.text || '').join('');
    if (thought) onThinking?.(thought);
    const token = parts.filter((part) => !part.thought).map((part) => part.text || '').join('');
    if (token) { complete += token; onToken(complete); }
  });
  return complete.trim();
}

async function streamLocalProxy(config) {
  const response = await fetch(`${LOCAL_PROXY_URL}/stream`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: config.endpoint, format: config.format, apiKey: config.apiKey, model: config.model, messages: config.messages, chatOptions: config.chatOptions }), signal: config.signal,
  });
  let complete = '';
  await readSSE(response, config.signal, (data) => {
    let token = '';
    if (config.format === 'anthropic') { token = data.type === 'content_block_delta' ? data.delta?.text || '' : ''; if (data.delta?.thinking) config.onThinking?.(data.delta.thinking); }
    else if (config.format === 'gemini') { const parts = data.candidates?.[0]?.content?.parts || []; const thought = parts.filter((part) => part.thought).map((part) => part.text || '').join(''); if (thought) config.onThinking?.(thought); token = parts.filter((part) => !part.thought).map((part) => part.text || '').join(''); }
    else if (config.format === 'openai-compatible') { const delta = data.choices?.[0]?.delta || {}; if (config.chatOptions?.reasoning !== 'none' && (delta.reasoning_content || delta.reasoning)) config.onThinking?.(delta.reasoning_content || delta.reasoning); token = delta.content || ''; }
    else { if ((data.type === 'response.reasoning_summary_text.delta' || data.type === 'response.reasoning_text.delta') && data.delta) config.onThinking?.(data.delta); token = data.type === 'response.output_text.delta' ? data.delta || '' : ''; }
    if (token) { complete += token; config.onToken(complete); }
    if (data.type === 'error') throw new Error(data.error?.message || data.message || '代理请求失败');
  });
  return complete.trim();
}

export function streamCloud(config) {
  if (config.useLocalProxy !== false) return streamLocalProxy(config);
  if (config.format === 'gemini') return streamGemini(config);
  if (config.format === 'anthropic') return streamAnthropic(config);
  if (config.format === 'openai-compatible') return streamOpenAICompatible(config);
  return streamOpenAIResponses(config);
}

export async function listOllamaModels(endpoint, signal) {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/api/tags`, { signal });
  if (!response.ok) throw new Error(`无法连接 Ollama（${response.status}）`);
  const data = await response.json();
  return (data.models || []).map((item) => item.name);
}
