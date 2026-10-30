import { rateLimit } from '../lib/rate-limit.js';
import { createSuccessResponse, createErrorResponse } from '../lib/response.js';
import { signToken } from '../lib/tokens.js';

export async function onRequestPost(context) {
  const limited = await rateLimit(context.request, context, { path: '/api/miniprogram-session', limit: 10, windowSeconds: 60 });
  if (limited.limited) return limited.response;
  const { WECHAT_APPID, APP_SIGNING_SECRET } = context.env;
  const secret = context.env.WECHAT_APPSECRET || context.env.WECHAT_PRIVATE_KEY;
  if (!WECHAT_APPID || !secret || !APP_SIGNING_SECRET || APP_SIGNING_SECRET.length < 32) return createErrorResponse('小程序登录服务未配置', { status: 503 });
  let body;
  try { body = await context.request.json(); } catch { return createErrorResponse('请求体格式错误', { status: 400 }); }
  if (typeof body?.code !== 'string' || !body.code || body.code.length > 512) return createErrorResponse('缺少有效的微信登录码', { status: 400 });
  try {
    const params = new URLSearchParams({ appid: WECHAT_APPID, secret, js_code: body.code, grant_type: 'authorization_code' });
    const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params}`, { signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok || data.errcode || typeof data.openid !== 'string' || !data.openid) return createErrorResponse('微信登录失败，请重试', { status: 401 });
    const token = await signToken(context.env, 'miniprogram', { sub: data.openid }, 3600);
    return createSuccessResponse({ token, expires_in: 3600 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return createErrorResponse('微信登录服务暂时不可用', { status: 503 }); }
}
