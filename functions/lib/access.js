// Shared access controls. No environment flag can bypass administrator sessions.
import { SESSION_TTL } from './constants.js';

export function cookieValue(request, name) {
  return (request.headers.get('Cookie') || '').split(';').map(v => v.trim())
    .find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}

export function isLocalDevelopment(context) {
  const host = new URL(context.request.url).hostname;
  return context.env.ALLOW_INSECURE_LOCAL_DEV === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(host);
}

export function isSameOrigin(request) {
  const origin = request.headers.get('Origin');
  return (!origin || origin === new URL(request.url).origin) && request.headers.get('Sec-Fetch-Site') !== 'cross-site';
}

export async function verifySession(request, env) {
  const id = cookieValue(request, 'session_id');
  if (!id || !env.SESSION_KV) return { valid: false, message: '请先登录' };
  try {
    const raw = await env.SESSION_KV.get(id);
    if (!raw) return { valid: false, message: '会话已过期' };
    const data = JSON.parse(raw);
    const allowed = (env.ALLOWED_GITHUB_USERS || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    if (!data.username || !allowed.includes(data.username.toLowerCase()) ||
        !Number.isFinite(data.lastActivity) || Date.now() - data.lastActivity > SESSION_TTL * 1000) {
      return { valid: false, message: '会话已过期或账号未授权' };
    }
    data.lastActivity = Date.now();
    await env.SESSION_KV.put(id, JSON.stringify(data), { expirationTtl: SESSION_TTL });
    return { valid: true, sessionData: data };
  } catch {
    return { valid: false, message: '无法验证会话，请重新登录' };
  }
}

export async function authorizeMaintenance(context) {
  const configured = context.env.MAINTENANCE_TOKEN;
  const supplied = context.request.headers.get('Authorization');
  if (typeof configured === 'string' && configured.length >= 32 && supplied?.startsWith('Bearer ')) {
    // Compare digests to avoid early-exit comparisons of secrets.
    const hash = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    const [a, b] = await Promise.all([hash(configured), hash(supplied.slice(7))]);
    let difference = 0;
    for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
    if (difference === 0) return true;
  }
  return isSameOrigin(context.request) && (await verifySession(context.request, context.env)).valid;
}
