import { verifyTurnstile } from './turnstile.js';
import { verifyToken } from './tokens.js';
import { isLocalDevelopment, isSameOrigin } from './access.js';
import { checkImageSecurity } from './wechat-security.js';
import { createErrorResponse } from './response.js';

export async function miniProgramIdentity(context) {
  const token = context.request.headers.get('Authorization')?.replace(/^Bearer /, '');
  const identity = await verifyToken(context.env, token, 'miniprogram');
  return identity?.sub ? identity : null;
}

export async function guardAnalysis(context, body, images) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return createErrorResponse('请求体格式错误', { status: 400 });
  const mini = body.app_type === 'miniprogram' || context.request.headers.get('X-App-Type') === 'miniprogram';
  if (mini) {
    if (!await miniProgramIdentity(context)) return createErrorResponse('小程序登录已过期，请重试', { status: 401 });
  } else {
    if (!isSameOrigin(context.request)) return createErrorResponse('请求来源无效', { status: 403 });
    const secret = context.env.TURNSTILE_SECRET_KEY?.trim();
    if (!secret && !isLocalDevelopment(context)) return createErrorResponse('人机验证服务未配置', { status: 503 });
    if (secret && !await verifyTurnstile(body.turnstile_response, secret)) return createErrorResponse('请完成人机验证', { status: 403 });
  }
  // A client-side safety check alone cannot authorize analysis of a different image.
  const appSecret = context.env.WECHAT_APPSECRET || context.env.WECHAT_PRIVATE_KEY;
  if (mini || context.env.REQUIRE_IMAGE_SECURITY === 'true' || (context.env.WECHAT_APPID && appSecret)) {
    if (!context.env.WECHAT_APPID || !appSecret) return createErrorResponse('内容安全服务未配置', { status: 503 });
    try {
      for (const image of images) {
        const result = await checkImageSecurity(image, context.env.WECHAT_APPID, appSecret);
        if (!result.safe) return createErrorResponse('您发布的内容包含违规信息', { status: 403 });
      }
    } catch { return createErrorResponse('内容安全检查暂时不可用，请稍后重试', { status: 503 }); }
  }
  return null;
}
