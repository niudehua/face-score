// 导入模块
import { getImage } from '../lib/storage.js';
import { rateLimit, addRateLimitHeaders } from '../lib/rate-limit.js';
import { createErrorResponse } from '../lib/response.js';
import { createLogger } from '../lib/logger.js';
import { RATE_LIMIT_CONFIG, HTTP_STATUS } from '../lib/constants.js';

export async function onRequestGet(context) {
  const logger = createLogger('image-api');
  
  // 实施限流
  const rateLimitResult = await rateLimit(context.request, context, {
    path: '/api/image',
    ...RATE_LIMIT_CONFIG.IMAGE
  });

  if (rateLimitResult.limited) {
    logger.warn('请求被限流', { ip: context.request.headers.get('CF-Connecting-IP') });
    return rateLimitResult.response;
  }

  const url = new URL(context.request.url);
  const md5 = url.searchParams.get('md5');

  if (!md5) {
    logger.warn('缺少md5参数');
    return createErrorResponse('缺少md5参数', {
      status: HTTP_STATUS.BAD_REQUEST,
      rateLimitInfo: rateLimitResult
    });
  }

  const r2 = context.env.FACE_IMAGES;
  if (!r2) {
    logger.error('R2存储桶未配置');
    return createErrorResponse('R2存储桶未配置', {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      rateLimitInfo: rateLimitResult
    });
  }

  try {
    const object = await getImage(r2, md5);

    if (!object) {
      logger.warn('图片未找到', { md5 });
      return createErrorResponse('图片未找到', {
        status: HTTP_STATUS.NOT_FOUND,
        rateLimitInfo: rateLimitResult
      });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000');

    let response = new Response(object.body, {
      headers,
    });
    response = addRateLimitHeaders(response, rateLimitResult);
    return response;
  } catch (error) {
    logger.error('获取图片失败', error);
    return createErrorResponse(`获取图片失败: ${error.message}`, {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      rateLimitInfo: rateLimitResult
    });
  }
}
