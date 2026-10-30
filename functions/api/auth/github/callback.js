import { cookieValue } from '../../../lib/access.js';
import { SESSION_TTL } from '../../../lib/constants.js';
import { rateLimit } from '../../../lib/rate-limit.js';
import { createErrorResponse } from '../../../lib/response.js';
const clearState = 'oauth_state=; Path=/api/auth/github; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
const headers = { 'Cache-Control': 'no-store', 'Set-Cookie': clearState };
export async function onRequestGet(context) {
  const limited = await rateLimit(context.request, context, { path: '/api/auth/github/callback', limit: 20 });
  if (limited.limited) return limited.response;
  const { env, request } = context;
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || !/^[a-f0-9-]{36}$/.test(state) || state !== cookieValue(request, 'oauth_state') || !code) return createErrorResponse('登录请求已失效，请重新登录', { status: 400, headers });
  if (!env.SESSION_KV || !env.OAUTH_GITHUB_CLIENT_ID || !env.OAUTH_GITHUB_CLIENT_SECRET) return createErrorResponse('GitHub 登录未配置', { status: 503, headers });
  try {
    const raw = await env.SESSION_KV.get(`oauth:${state}`);
    if (!raw) return createErrorResponse('登录请求已失效，请重新登录', { status: 400, headers });
    await env.SESSION_KV.delete(`oauth:${state}`);
    const { verifier, callback } = JSON.parse(raw);
    if (callback !== new URL('/api/auth/github/callback', request.url).href) return createErrorResponse('登录回调地址无效', { status: 400, headers });
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'Face-Score-App' },
      body: new URLSearchParams({ client_id: env.OAUTH_GITHUB_CLIENT_ID, client_secret: env.OAUTH_GITHUB_CLIENT_SECRET, code, redirect_uri: callback, code_verifier: verifier }),
      signal: AbortSignal.timeout(10000)
    });
    const token = await response.json();
    if (!response.ok || !token.access_token) return createErrorResponse('GitHub 授权失败，请重新登录', { status: 401, headers });
    const userResponse = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'Face-Score-App', Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    const user = await userResponse.json();
    const allowed = (env.ALLOWED_GITHUB_USERS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    if (!userResponse.ok || typeof user.login !== 'string' || !allowed.includes(user.login.toLowerCase())) return createErrorResponse('您的 GitHub 账号未被授权访问', { status: 403, headers });
    const id = crypto.randomUUID();
    await env.SESSION_KV.put(id, JSON.stringify({ username: user.login, provider: 'github', createdAt: Date.now(), lastActivity: Date.now() }), { expirationTtl: SESSION_TTL });
    const resultHeaders = new Headers({ Location: '/archive', 'Cache-Control': 'no-store' });
    resultHeaders.append('Set-Cookie', clearState);
    resultHeaders.append('Set-Cookie', `session_id=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`);
    return new Response(null, { status: 302, headers: resultHeaders });
  } catch {
    // Never log provider bodies, tokens, authorization codes or credentials.
    console.error('GitHub OAuth request failed');
    return createErrorResponse('GitHub 登录暂时不可用，请稍后重试', { status: 503, headers });
  }
}
