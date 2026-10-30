import { rateLimit } from '../../lib/rate-limit.js';
import { createErrorResponse } from '../../lib/response.js';

export async function onRequestGet(context) {
  const limited = await rateLimit(context.request, context, { path: '/api/auth/github', limit: 20 });
  if (limited.limited) return limited.response;
  const { OAUTH_GITHUB_CLIENT_ID, OAUTH_GITHUB_CLIENT_SECRET, SESSION_KV, ALLOWED_GITHUB_USERS } = context.env;
  if (!OAUTH_GITHUB_CLIENT_ID || !OAUTH_GITHUB_CLIENT_SECRET || !SESSION_KV || !ALLOWED_GITHUB_USERS?.trim()) return createErrorResponse('GitHub 登录未配置', { status: 503 });
  try {
    const state = crypto.randomUUID();
    const verifier = crypto.randomUUID() + crypto.randomUUID();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const challenge = btoa(String.fromCharCode(...digest)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const callback = new URL('/api/auth/github/callback', context.request.url).href;
    await SESSION_KV.put(`oauth:${state}`, JSON.stringify({ verifier, callback }), { expirationTtl: 600 });
    const params = new URLSearchParams({ client_id: OAUTH_GITHUB_CLIENT_ID, redirect_uri: callback, scope: 'read:user', state, code_challenge: challenge, code_challenge_method: 'S256' });
    return new Response(null, { status: 302, headers: {
      Location: `https://github.com/login/oauth/authorize?${params}`,
      'Set-Cookie': `oauth_state=${state}; Path=/api/auth/github; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      'Cache-Control': 'no-store'
    } });
  } catch { return createErrorResponse('登录服务暂时不可用', { status: 503 }); }
}
