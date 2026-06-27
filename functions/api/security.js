import { checkImageSecurity } from '../lib/wechat-security.js';
import { rateLimit } from '../lib/rate-limit.js';
import { createSuccessResponse, createErrorResponse, handleOptionsRequest } from '../lib/response.js';
import { createLogger } from '../lib/logger.js';
import { validateBase64Image } from '../lib/validator.js';
import { RATE_LIMIT_CONFIG, HTTP_STATUS } from '../lib/constants.js';

export async function onRequestOptions(context) {
  return handleOptionsRequest();
}

export async function onRequestPost(context) {
  const { WECHAT_APPID, WECHAT_PRIVATE_KEY } = context.env;
  const logger = createLogger('security-api');

  try {
    const rateLimitResult = await rateLimit(context.request, context, {
      path: '/api/security',
      ...RATE_LIMIT_CONFIG.IMAGE
    });

    if (rateLimitResult.limited) {
      return rateLimitResult.response;
    }

    let body;
    try {
      body = await context.request.json();
    } catch (err) {
      return createErrorResponse('请求体格式错误', { status: HTTP_STATUS.BAD_REQUEST });
    }

    const { image: imageBase64 } = body;

    if (!imageBase64) {
      return createErrorResponse('缺少 image 字段', { status: HTTP_STATUS.BAD_REQUEST });
    }

    const imageValidation = validateBase64Image(imageBase64);
    if (!imageValidation.valid) {
      return createErrorResponse(imageValidation.error || '图片格式无效', { status: HTTP_STATUS.BAD_REQUEST });
    }

    logger.debug('环境变量检查 - WECHAT_APPID:', WECHAT_APPID ? '已配置 (' + WECHAT_APPID.substring(0, 8) + '...)' : '未配置');
    logger.debug('环境变量检查 - WECHAT_PRIVATE_KEY:', WECHAT_PRIVATE_KEY ? '已配置 (' + WECHAT_PRIVATE_KEY.substring(0, 8) + '...)' : '未配置');

    if (!WECHAT_APPID || !WECHAT_PRIVATE_KEY) {
      logger.error('微信小程序配置未完成，拒绝上传');
      return createSuccessResponse({ 
        safe: false, 
        message: '安全检查服务未配置，无法上传',
        debug: {
          wechatAppidConfigured: !!WECHAT_APPID,
          wechatPrivateKeyConfigured: !!WECHAT_PRIVATE_KEY
        }
      });
    }

    logger.debug('开始内容安全检查');
    const securityResult = await checkImageSecurity(imageBase64, WECHAT_APPID, WECHAT_PRIVATE_KEY);

    if (!securityResult.safe) {
      logger.warn('内容安全检查未通过:', securityResult.message);
      return createSuccessResponse({ safe: false, message: '您发布的内容包含违规信息' });
    }

    logger.debug('内容安全检查通过');
    return createSuccessResponse({ safe: true, message: '内容安全检查通过' });

  } catch (error) {
    logger.error('内容安全检查异常', error);
    return createErrorResponse('内容安全检查失败: ' + error.message, { status: HTTP_STATUS.INTERNAL_SERVER_ERROR });
  }
}