// Public deployments accept visitors' own keys and never expose local actions or archives.
export const PUBLIC_MODEL_HOSTS = new Set([
  'api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com',
  'api.deepseek.com', 'ark.cn-beijing.volces.com', 'api.siliconflow.cn',
  'dashscope.aliyuncs.com', 'open.bigmodel.cn', 'api.moonshot.cn', 'api.moonshot.ai',
]);
export function validatePublicEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password || url.search || url.hash || !PUBLIC_MODEL_HOSTS.has(url.hostname)) {
    throw new Error('公开版仅支持已列入支持范围的 HTTPS 模型服务，请使用官方接口地址。');
  }
  return url;
}
export function publicRequestAllowed(method, pathname) {
  return (method === 'GET' && pathname === '/health') || (method === 'POST' && pathname === '/stream');
}
