import { cookieValue, isSameOrigin, verifySession } from '../access.js';
import { rateLimit } from '../rate-limit.js';
import { signToken, verifyToken } from '../tokens.js';
import { McpError, json, readForm } from './http.js';

const FLOW_COOKIE = 'mcp_flow';
const clearFlow = 'mcp_flow=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
const SCOPE = 'face:analyze';
export const sha256 = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
async function secretMatches(a, b) {
  const [left, right] = await Promise.all([sha256(a), sha256(b)]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
const random = () => crypto.randomUUID() + crypto.randomUUID();
const now = () => Math.floor(Date.now() / 1000);
export function config(context) {
  const env = context.env;
  if (env.MCP_ENABLED !== 'true') throw new McpError('私人 MCP 尚未启用', 503);
  let origin, redirect;
  try {
    origin = new URL(env.MCP_ORIGIN); redirect = new URL(env.MCP_REDIRECT_URI);
    if (origin.protocol !== 'https:' || origin.origin !== env.MCP_ORIGIN || origin.origin !== new URL(context.request.url).origin ||
        redirect.origin !== 'https://chatgpt.com' || redirect.search || redirect.hash ||
        !(/^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(redirect.pathname) || redirect.pathname === '/connector_platform_oauth_redirect')) throw new Error();
  } catch { throw new McpError('MCP_ORIGIN 或 ChatGPT 回调地址未正确配置', 503); }
  const owner = (env.MCP_OWNER_GITHUB_USER || '').toLowerCase();
  const allowed = (env.ALLOWED_GITHUB_USERS || '').split(',').map(v => v.trim().toLowerCase());
  if (!/^[a-z0-9][a-z0-9-]{0,38}$/.test(owner) || !allowed.includes(owner) ||
      !env.MCP_CLIENT_ID || !/^[A-Za-z0-9_-]{3,100}$/.test(env.MCP_CLIENT_ID) ||
      typeof env.MCP_CLIENT_SECRET !== 'string' || env.MCP_CLIENT_SECRET.length < 32 || /\s/.test(env.MCP_CLIENT_SECRET) ||
      !env.APP_SIGNING_SECRET || env.APP_SIGNING_SECRET.length < 32 || !env.FACE_SCORE_DB || !env.SESSION_KV ||
      !env.OAUTH_GITHUB_CLIENT_ID || !env.OAUTH_GITHUB_CLIENT_SECRET) throw new McpError('私人 MCP 的账号、OAuth 或存储配置不完整', 503);
  return { origin: origin.origin, resource: origin.origin + '/mcp', redirect: redirect.href, owner, client: env.MCP_CLIENT_ID, scope: SCOPE };
}
const schemaReady = new WeakSet();
async function database(env) {
  const db = env.FACE_SCORE_DB;
  if (!schemaReady.has(db)) {
    await db.batch([
      db.prepare('CREATE TABLE IF NOT EXISTS mcp_oauth_flows (id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at INTEGER NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS mcp_oauth_codes (code_hash TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at INTEGER NOT NULL)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, owner TEXT NOT NULL, client_id TEXT NOT NULL, resource TEXT NOT NULL, binding TEXT NOT NULL, grant_id TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL)`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_mcp_oauth_tokens_grant ON mcp_oauth_tokens(grant_id)')
    ]);
    schemaReady.add(db);
  }
  return db;
}
async function prune(db) {
  await db.batch([
    db.prepare('DELETE FROM mcp_oauth_flows WHERE expires_at <= ?').bind(now()),
    db.prepare('DELETE FROM mcp_oauth_codes WHERE expires_at <= ?').bind(now()),
    db.prepare('DELETE FROM mcp_oauth_tokens WHERE expires_at <= ?').bind(now())
  ]);
}
const binding = (env, c) => sha256(JSON.stringify([env.MCP_CLIENT_SECRET, c.client, c.owner, c.resource]));
export function resourceMetadata(context) {
  const c = config(context);
  return json({ resource: c.resource, authorization_servers: [c.origin], scopes_supported: [SCOPE], bearer_methods_supported: ['header'], resource_name: '萌牛测颜（私人）' });
}
export function serverMetadata(context) {
  const c = config(context);
  return json({ issuer: c.origin, authorization_endpoint: c.origin + '/api/mcp/oauth/authorize', token_endpoint: c.origin + '/api/mcp/oauth/token',
    revocation_endpoint: c.origin + '/api/mcp/oauth/revoke', response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    scopes_supported: [SCOPE], token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'], code_challenge_methods_supported: ['S256'], authorization_response_iss_parameter_supported: true });
}
export function challenge(context) {
  const c = config(context);
  return json({ error: '需要连接私人 MCP 并完成 GitHub 授权' }, 401, {
    'WWW-Authenticate': `Bearer resource_metadata="${c.origin}/.well-known/oauth-protected-resource/mcp", scope="${SCOPE}"`
  });
}
export async function authenticate(context) {
  const c = config(context);
  const auth = context.request.headers.get('Authorization') || '';
  if (!/^Bearer [A-Za-z0-9-]{72}$/.test(auth)) return null;
  const db = await database(context.env);
  return db.prepare(`SELECT owner FROM mcp_oauth_tokens WHERE token_hash = ? AND kind = 'access' AND used = 0 AND expires_at > ? AND owner = ? AND client_id = ? AND resource = ? AND binding = ?`)
    .bind(await sha256(auth.slice(7)), now(), c.owner, c.client, c.resource, await binding(context.env, c)).first();
}
async function limit(context, path, count = 20) {
  const result = await rateLimit(context.request, context, { path, limit: count, windowSeconds: 60 });
  if (result.limited) throw new McpError('请求过于频繁或限流服务不可用，请稍后重试', result.response.status);
}
const flowId = request => cookieValue(request, FLOW_COOKIE);
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function redirectOAuth(c, flow, params) {
  const url = new URL(c.redirect);
  for (const [key, value] of Object.entries({ ...params, state: flow.state, iss: c.origin })) if (value) url.searchParams.set(key, value);
  return new Response(null, { status: 302, headers: { Location: url.href, 'Set-Cookie': clearFlow, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
export async function authorize(context) {
  const c = config(context);
  await limit(context, '/mcp/oauth/authorize');
  const p = new URL(context.request.url).searchParams;
  for (const name of p.keys()) if (p.getAll(name).length !== 1) throw new McpError('不允许重复参数');
  // Validate before ever redirecting. Redirect URI is one exact, pre-registered URL.
  if (p.get('client_id') !== c.client || p.get('redirect_uri') !== c.redirect) throw new McpError('OAuth 客户端或回调地址不匹配');
  if (p.get('response_type') !== 'code' || p.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(p.get('code_challenge') || '') ||
      p.get('resource') !== c.resource || p.get('scope') !== SCOPE || !p.get('state') || p.get('state').length > 1024) throw new McpError('需要 PKCE S256、有效 state、正确 resource 和 face:analyze scope');
  const id = crypto.randomUUID();
  const payload = { client: c.client, redirect: c.redirect, resource: c.resource, state: p.get('state'), challenge: p.get('code_challenge'), binding: await binding(context.env, c) };
  const db = await database(context.env); await prune(db);
  await db.prepare('INSERT INTO mcp_oauth_flows (id, payload, expires_at) VALUES (?, ?, ?)').bind(id, JSON.stringify(payload), now() + 600).run();
  const session = await verifySession(context.request, context.env);
  return new Response(null, { status: 302, headers: {
    Location: session.valid ? '/api/mcp/oauth/consent' : '/api/auth/github',
    'Set-Cookie': `mcp_flow=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'
  } });
}
async function ownerSession(context, c) {
  const session = await verifySession(context.request, context.env);
  if (!session.valid) throw new McpError('请通过 GitHub 登录后重新连接 MCP', 401);
  if (session.sessionData.username.toLowerCase() !== c.owner) throw new McpError('仅 MCP_OWNER_GITHUB_USER 指定的本人账号可授权', 403);
}
async function pendingFlow(context, c) {
  const id = flowId(context.request);
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new McpError('授权请求已失效，请在 ChatGPT 重新连接');
  const db = await database(context.env);
  const row = await db.prepare('SELECT payload FROM mcp_oauth_flows WHERE id = ? AND expires_at > ?').bind(id, now()).first();
  if (!row) throw new McpError('授权请求已过期或已使用，请重新连接');
  const data = JSON.parse(row.payload);
  if (data.binding !== await binding(context.env, c) || data.redirect !== c.redirect || data.resource !== c.resource || data.client !== c.client) throw new McpError('授权配置已改变，请重新连接');
  return { id, data, db };
}
export async function consentPage(context) {
  const c = config(context); await ownerSession(context, c);
  const { id } = await pendingFlow(context, c);
  const csrf = await signToken(context.env, 'mcp-consent', { flow: id }, 600);
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>连接私人萌牛测颜</title><body><h1>授权 ChatGPT 使用萌牛测颜</h1><p>当前账号：${escape(c.owner)}</p><p>允许三个工具分析你主动选择的照片。调用时照片会下载到后端并发送给 Face++；配置微信安全服务时也会发送给微信检查。本服务不保存照片，不调用 Workers AI，检测结果交给 ChatGPT 生成娱乐文案。</p><p>照片不能用来判断真实人格、健康或恋爱关系。此授权不允许浏览、删除档案或执行维护操作。</p><form method="post" action="/api/mcp/oauth/consent"><input type="hidden" name="csrf" value="${escape(csrf)}"><button name="decision" value="approve">允许连接</button><button name="decision" value="deny">取消</button></form></body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" }
  });
}
export async function consent(context) {
  const c = config(context); await limit(context, '/mcp/oauth/consent'); await ownerSession(context, c);
  if (!isSameOrigin(context.request)) throw new McpError('授权页面来源无效', 403);
  const form = await readForm(context.request);
  const { id, data, db } = await pendingFlow(context, c);
  const csrf = await verifyToken(context.env, form.get('csrf'), 'mcp-consent');
  if (csrf?.flow !== id) throw new McpError('授权确认校验失败', 403);
  if (!['approve', 'deny'].includes(form.get('decision'))) throw new McpError('授权选择无效');
  const taken = await db.prepare('DELETE FROM mcp_oauth_flows WHERE id = ? AND expires_at > ? RETURNING payload').bind(id, now()).first();
  if (!taken) throw new McpError('授权请求已使用');
  if (form.get('decision') === 'deny') return redirectOAuth(c, data, { error: 'access_denied' });
  const code = random();
  await db.prepare('INSERT INTO mcp_oauth_codes (code_hash, payload, expires_at) VALUES (?, ?, ?)').bind(await sha256(code), JSON.stringify(data), now() + 120).run();
  return redirectOAuth(c, data, { code });
}
async function clientForm(context, c) {
  const form = await readForm(context.request);
  let id = form.get('client_id'), secret = form.get('client_secret');
  const auth = context.request.headers.get('Authorization');
  if (auth) {
    if (!auth.startsWith('Basic ') || secret) throw new McpError('OAuth 客户端认证失败', 401);
    try {
      const decoded = atob(auth.slice(6)), colon = decoded.indexOf(':');
      if (colon < 0) throw new Error();
      const basicId = decodeURIComponent(decoded.slice(0, colon).replace(/\+/g, ' '));
      if (id && id !== basicId) throw new Error();
      id = basicId; secret = decodeURIComponent(decoded.slice(colon + 1).replace(/\+/g, ' '));
    } catch { throw new McpError('OAuth 客户端认证失败', 401); }
  }
  if (id !== c.client || typeof secret !== 'string' || !await secretMatches(secret, context.env.MCP_CLIENT_SECRET)) throw new McpError('OAuth 客户端认证失败', 401);
  return form;
}
async function issueTokens(env, c, db, grant = crypto.randomUUID()) {
  const access = random(), refresh = random(), fingerprint = await binding(env, c);
  const statement = (value, kind, seconds) => db.prepare('INSERT INTO mcp_oauth_tokens (token_hash, kind, owner, client_id, resource, binding, grant_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(value, kind, c.owner, c.client, c.resource, fingerprint, grant, now() + seconds);
  await db.batch([statement(await sha256(access), 'access', 3600), statement(await sha256(refresh), 'refresh', 7 * 86400)]);
  return json({ access_token: access, token_type: 'Bearer', expires_in: 3600, refresh_token: refresh, scope: SCOPE });
}
export async function token(context) {
  const c = config(context); await limit(context, '/mcp/oauth/token', 30);
  const form = await clientForm(context, c), db = await database(context.env);
  if (form.get('resource') !== c.resource) return json({ error: 'invalid_target' }, 400);
  const fingerprint = await binding(context.env, c);
  if (form.get('grant_type') === 'authorization_code') {
    const code = form.get('code'), verifier = form.get('code_verifier');
    if (!/^[a-f0-9-]{72}$/.test(code || '') || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier || '') || form.get('redirect_uri') !== c.redirect) return json({ error: 'invalid_grant' }, 400);
    const hash = await sha256(code);
    const row = await db.prepare('SELECT payload FROM mcp_oauth_codes WHERE code_hash = ? AND expires_at > ?').bind(hash, now()).first();
    if (!row) return json({ error: 'invalid_grant' }, 400);
    const data = JSON.parse(row.payload);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const challenge = btoa(String.fromCharCode(...digest)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    if (data.challenge !== challenge || data.client !== c.client || data.resource !== c.resource || data.redirect !== c.redirect || data.binding !== fingerprint) return json({ error: 'invalid_grant' }, 400);
    if (!await db.prepare('DELETE FROM mcp_oauth_codes WHERE code_hash = ? AND expires_at > ? RETURNING code_hash').bind(hash, now()).first()) return json({ error: 'invalid_grant' }, 400);
    return issueTokens(context.env, c, db);
  }
  if (form.get('grant_type') === 'refresh_token') {
    const value = form.get('refresh_token');
    if (!/^[a-f0-9-]{72}$/.test(value || '')) return json({ error: 'invalid_grant' }, 400);
    const hash = await sha256(value);
    const row = await db.prepare(`UPDATE mcp_oauth_tokens SET used = 1 WHERE token_hash = ? AND kind = 'refresh' AND used = 0 AND expires_at > ? AND client_id = ? AND resource = ? AND binding = ? RETURNING grant_id`).bind(hash, now(), c.client, c.resource, fingerprint).first();
    if (!row) {
      const replay = await db.prepare("SELECT grant_id FROM mcp_oauth_tokens WHERE token_hash = ? AND kind = 'refresh' AND used = 1 AND binding = ?").bind(hash, fingerprint).first();
      if (replay) await db.prepare('DELETE FROM mcp_oauth_tokens WHERE grant_id = ?').bind(replay.grant_id).run();
      return json({ error: 'invalid_grant' }, 400);
    }
    await db.prepare("DELETE FROM mcp_oauth_tokens WHERE grant_id = ? AND kind = 'access'").bind(row.grant_id).run();
    return issueTokens(context.env, c, db, row.grant_id);
  }
  return json({ error: 'unsupported_grant_type' }, 400);
}
export async function revoke(context) {
  const c = config(context); await limit(context, '/mcp/oauth/revoke');
  const form = await clientForm(context, c), db = await database(context.env);
  const row = await db.prepare('SELECT grant_id FROM mcp_oauth_tokens WHERE token_hash = ? AND client_id = ?').bind(await sha256(form.get('token') || ''), c.client).first();
  if (row) await db.prepare('DELETE FROM mcp_oauth_tokens WHERE grant_id = ?').bind(row.grant_id).run();
  return json({});
}
export async function handleOAuth(context, fn) {
  try { return await fn(context); }
  catch (error) {
    if (error instanceof McpError) return json({ error: error.status === 401 ? 'invalid_client' : 'invalid_request', error_description: error.message }, error.status);
    console.error('Private MCP OAuth operation failed');
    return json({ error: 'server_error', error_description: '私人 MCP 授权服务暂时不可用' }, 503);
  }
}
