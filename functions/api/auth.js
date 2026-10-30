import { cookieValue, isSameOrigin, verifySession } from '../lib/access.js';
import { createErrorResponse, createSuccessResponse } from '../lib/response.js';
import { SESSION_TTL } from '../lib/constants.js';
const clearCookie = 'session_id=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
const headers = { 'Cache-Control': 'no-store' };
export async function onRequestGet(context) {
  const result = await verifySession(context.request, context.env);
  if (!result.valid) return createErrorResponse(result.message, { status: 401, headers: { ...headers, 'Set-Cookie': clearCookie } });
  return createSuccessResponse({ success: true, data: { username: result.sessionData.username } }, {
    headers: { ...headers, 'Set-Cookie': `session_id=${cookieValue(context.request, 'session_id')}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}` }
  });
}
export async function onRequestDelete(context) {
  if (!isSameOrigin(context.request)) return createErrorResponse('请求来源无效', { status: 403 });
  const id = cookieValue(context.request, 'session_id');
  try {
    if (id && context.env.SESSION_KV) await context.env.SESSION_KV.delete(id);
    return createSuccessResponse({ success: true }, { headers: { ...headers, 'Set-Cookie': clearCookie } });
  } catch { return createErrorResponse('退出失败，请重试', { status: 503, headers }); }
}
