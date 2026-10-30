import { authenticate, challenge, config } from './lib/mcp/oauth.js';
import { analyze, tools } from './lib/mcp/tools.js';
import { McpError, json, readLimited } from './lib/mcp/http.js';
import { rateLimit } from './lib/rate-limit.js';

const versions = ['2025-11-25', '2025-06-18', '2025-03-26'];
const rpcError = (id, code, message, status = 200) => json({ jsonrpc: '2.0', id, error: { code, message } }, status);
function allowedOrigin(context, c) {
  const origin = context.request.headers.get('Origin');
  return !origin || [c.origin, 'https://chatgpt.com'].includes(origin);
}
export async function onRequestPost(context) {
  let id = null;
  try {
    const c = config(context);
    if (!allowedOrigin(context, c)) return json({ error: '请求来源无效' }, 403);
    if (!await authenticate(context)) return challenge(context);
    const limited = await rateLimit(context.request, context, { path: '/mcp/protocol', limit: 60, windowSeconds: 60 });
    if (limited.limited) return limited.response;
    const protocol = context.request.headers.get('MCP-Protocol-Version');
    if (protocol && !versions.includes(protocol)) return rpcError(null, -32600, '不支持的 MCP 协议版本', 400);
    if (!context.request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: '需要 application/json' }, 415);
    const accept = context.request.headers.get('Accept') || '';
    if (!accept.includes('application/json') || !accept.includes('text/event-stream')) return json({ error: 'Accept 需要同时包含 application/json 和 text/event-stream' }, 406);
    let message;
    try { message = JSON.parse(new TextDecoder().decode(await readLimited(context.request.body, 32768))); }
    catch (error) { return rpcError(null, -32700, error instanceof McpError ? error.message : 'JSON 解析失败', error.status || 400); }
    if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' ||
        (message.params !== undefined && (!message.params || typeof message.params !== 'object' || Array.isArray(message.params)))) return rpcError(null, -32600, '无效的 JSON-RPC 请求', 400);
    if (message.id === undefined) {
      if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
      return rpcError(null, -32600, '不支持的通知', 400);
    }
    if (typeof message.id !== 'string' && !(typeof message.id === 'number' && Number.isFinite(message.id))) return rpcError(null, -32600, '无效的请求 ID', 400);
    id = message.id;
    const result = value => json({ jsonrpc: '2.0', id, result: value });
    switch (message.method) {
      case 'initialize':
        if (typeof message.params?.protocolVersion !== 'string' || !message.params?.clientInfo || !message.params?.capabilities) return rpcError(id, -32602, '初始化参数不完整');
        return result({ protocolVersion: versions.includes(message.params.protocolVersion) ? message.params.protocolVersion : versions[0], capabilities: { tools: {} },
          serverInfo: { name: 'face-score-private', version: '1.0.0' }, instructions: '这是仅限本人使用的人脸娱乐分析。调用前确认用户授权把选择的照片交给 Face++（以及已配置的微信检查服务）。只使用用户选择的文件；工具不保存照片，不调用 AI，文案由 ChatGPT 根据返回数据生成，不能推断人格、健康、族裔或真实关系。' });
      case 'ping': return result({});
      case 'tools/list': return result({ tools });
      case 'tools/call': {
        if (!tools.some(t => t.name === message.params?.name)) return rpcError(id, -32602, '未知工具名称');
        const quota = await rateLimit(context.request, context, { path: '/mcp/analysis', limit: 10, windowSeconds: 60 });
        if (quota.limited) return quota.response;
        try {
          const data = await analyze(message.params.name, message.params.arguments, context.env);
          return result({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false });
        } catch (error) {
          return result({ content: [{ type: 'text', text: error instanceof McpError ? error.message : '分析暂时失败，请稍后重试' }], isError: true });
        }
      }
      default: return rpcError(id, -32601, '未实现的方法');
    }
  } catch (error) {
    if (!(error instanceof McpError)) console.error('Private MCP request failed');
    return rpcError(id, -32603, error instanceof McpError ? error.message : '私人 MCP 服务暂时不可用', error.status || 503);
  }
}
export async function onRequestGet(context) {
  try {
    const c = config(context);
    if (!allowedOrigin(context, c)) return json({ error: '请求来源无效' }, 403);
    if (!await authenticate(context)) return challenge(context);
    return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  } catch (error) { return json({ error: error instanceof McpError ? error.message : '私人 MCP 服务暂时不可用' }, error.status || 503); }
}
