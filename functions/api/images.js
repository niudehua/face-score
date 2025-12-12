import { getImages, deleteImages, getImagesByIds } from '../lib/db.js';
import { rateLimit } from '../lib/rate-limit.js';
import { deleteImagesFromR2 } from '../lib/storage.js';
import { createSuccessResponse, createErrorResponse, createCORSHeaders } from '../lib/response.js';
import { createLogger } from '../lib/logger.js';
import { RATE_LIMIT_CONFIG, HTTP_STATUS } from '../lib/constants.js';

// 验证会话（支持后门跳过）
async function verifySession(request, env) {
  const bypass =
    typeof env.BYPASS_AUTH === 'string' &&
    env.BYPASS_AUTH.toLowerCase() === 'true';
  if (bypass) {
    return { valid: true, sessionData: { username: 'bypass' } };
  }
  const { SESSION_KV } = env;

  // 从Cookie中获取会话ID
  const cookies = request.headers.get('Cookie') || '';
  const sessionIdMatch = cookies.match(/session_id=([^;]+)/);

  if (!sessionIdMatch || !sessionIdMatch[1]) {
    return { valid: false, message: '未登录' };
  }

  const sessionId = sessionIdMatch[1];
  // 从KV中获取会话
  const sessionDataStr = await SESSION_KV.get(sessionId);

  if (!sessionDataStr) {
    return { valid: false, message: '会话已过期' };
  }

  const sessionData = JSON.parse(sessionDataStr);

  // 更新最后活动时间，自动续期
  sessionData.lastActivity = Date.now();
  const expirationTtl = 7 * 24 * 60 * 60; // 7天
  await SESSION_KV.put(sessionId, JSON.stringify(sessionData), { expirationTtl });

  return { valid: true, sessionData };
}

export async function onRequestGet(context) {
  const { FACE_SCORE_DB } = context.env;
  const logger = createLogger('images-api');
  const corsHeaders = createCORSHeaders('*', context.request);

  try {
    // 1. 实施限流
    const rateLimitResult = await rateLimit(context.request, context, {
      path: '/api/images',
      ...RATE_LIMIT_CONFIG.IMAGES
    });

    if (rateLimitResult.limited) {
      logger.warn('请求被限流', { ip: context.request.headers.get('CF-Connecting-IP') });
      return rateLimitResult.response;
    }

    // 2. 验证会话
    const sessionResult = await verifySession(context.request, context.env);
    if (!sessionResult.valid) {
      logger.warn('会话验证失败', { message: sessionResult.message });
      return createErrorResponse(sessionResult.message, {
        status: HTTP_STATUS.UNAUTHORIZED,
        headers: corsHeaders,
        rateLimitInfo: rateLimitResult
      });
    }

    logger.debug('会话验证成功', { username: sessionResult.sessionData.username });

    // 3. 解析请求参数
    const url = new URL(context.request.url);
    const params = new URLSearchParams(url.search);

    // 获取查询参数
    const page = parseInt(params.get('page') || '1');
    const limit = parseInt(params.get('limit') || '10');
    const sort_by = params.get('sort_by') || 'timestamp';
    const order = params.get('order') || 'desc';
    const date_from = params.get('date_from');
    const date_to = params.get('date_to');
    const debug = params.get('debug') === 'true';

    logger.debug('请求参数', { page, limit, sort_by, order, date_from, date_to });

    // 4. 验证参数
    if (page < 1) {
      throw new Error('页码必须大于等于1');
    }
    if (limit < 1 || limit > 100) {
      throw new Error('每页数量必须在1-100之间');
    }

    // 5. 调用数据库查询
    if (!FACE_SCORE_DB) {
      logger.error('D1数据库未绑定');
      return createErrorResponse('D1数据库未绑定喵～', {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        headers: corsHeaders,
        rateLimitInfo: rateLimitResult,
        logs: debug ? logger.getLogs() : undefined,
        debug
      });
    }

    // 6. 获取图片列表
    const result = await getImages(FACE_SCORE_DB, {
      page,
      limit,
      sort_by,
      order,
      date_from,
      date_to
    });

    logger.debug('获取图片列表成功', {
      total: result.pagination.total,
      limit: result.pagination.limit,
      page: result.pagination.page
    });

    // 7. 返回响应
    return createSuccessResponse({
      data: result.data,
      pagination: result.pagination
    }, {
      headers: corsHeaders,
      rateLimitInfo: rateLimitResult,
      logs: debug ? logger.getLogs() : undefined,
      debug
    });

  } catch (err) {
    logger.error('处理请求失败', err);
    return createErrorResponse(err.message, {
      status: HTTP_STATUS.BAD_REQUEST,
      headers: corsHeaders,
      rateLimitInfo: null, // 错误情况下不返回限流信息
      logs: logger.getLogs(),
      debug: true
    });
  }
}

// 批量删除图片API
export async function onRequestDelete(context) {
  const { FACE_SCORE_DB, FACE_IMAGES } = context.env;
  const logger = createLogger('images-delete-api');
  const corsHeaders = createCORSHeaders('*', context.request);

  // 删除操作不支持后门跳过，确保安全
  try {
    // 1. 实施限流
    const rateLimitResult = await rateLimit(context.request, context, {
      path: '/api/images',
      limit: 10, // 每分钟10次请求
      windowSeconds: 60
    });

    if (rateLimitResult.limited) {
      logger.warn('请求被限流', { ip: context.request.headers.get('CF-Connecting-IP') });
      return rateLimitResult.response;
    }

    // 2. 验证会话
    const sessionResult = await verifySession(context.request, context.env);
    if (!sessionResult.valid) {
      logger.warn('会话验证失败', { message: sessionResult.message });
      return createErrorResponse(sessionResult.message, {
        status: HTTP_STATUS.UNAUTHORIZED,
        headers: corsHeaders,
        rateLimitInfo: rateLimitResult
      });
    }

    logger.debug('会话验证成功', { username: sessionResult.sessionData.username });

    // 3. 解析请求体
    let body;
    try {
      body = await context.request.json();
    } catch (parseError) {
      logger.error('解析请求体失败', parseError);
      return createErrorResponse('请求体格式错误', {
        status: HTTP_STATUS.BAD_REQUEST,
        headers: corsHeaders,
        rateLimitInfo: rateLimitResult
      });
    }

    const { ids } = body;

    logger.debug('请求体解析成功', { idsCount: ids?.length });

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      logger.warn('未提供有效的图片ID列表');
      return createErrorResponse('请提供要删除的图片ID列表', {
        status: HTTP_STATUS.BAD_REQUEST,
        headers: corsHeaders,
        rateLimitInfo: rateLimitResult
      });
    }

    logger.debug('批量删除请求', { idsCount: ids.length });

    // 4. 检查数据库连接
    if (!FACE_SCORE_DB) {
      logger.error('FACE_SCORE_DB 未配置');
      return createErrorResponse('数据库连接失败', {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        headers: corsHeaders,
        rateLimitInfo: rateLimitResult
      });
    }

    // 5. 获取要删除的图片信息
    const imagesToDelete = await getImagesByIds(FACE_SCORE_DB, ids);
    const md5List = imagesToDelete.map(image => image.md5);

    logger.debug('获取要删除的图片信息', { md5Count: md5List.length });

    // 6. 从R2删除图片
    let r2Deleted = 0;
    if (FACE_IMAGES && md5List.length > 0) {
      try {
        r2Deleted = await deleteImagesFromR2(FACE_IMAGES, md5List);
        logger.debug('从R2删除成功', { deleted: r2Deleted });
      } catch (r2Error) {
        logger.error('从R2删除图片失败', r2Error);
        return createErrorResponse('删除图片文件失败', {
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
          headers: corsHeaders,
          rateLimitInfo: rateLimitResult
        });
      }
    } else if (!FACE_IMAGES) {
      logger.warn('未绑定FACE_IMAGES，跳过R2删除');
    }

    // 7. 从D1删除记录
    let d1Result = { deleted: 0 };
    try {
      d1Result = await deleteImages(FACE_SCORE_DB, ids);
      logger.debug('从D1删除成功', { deleted: d1Result.deleted });
    } catch (d1Error) {
      logger.error('从D1删除记录失败', d1Error);
      return createErrorResponse('删除数据库记录失败', {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        headers: corsHeaders,
        rateLimitInfo: rateLimitResult
      });
    }

    // 8. 返回响应
    return createSuccessResponse({
      success: true,
      message: '批量删除成功',
      deletedFromD1: d1Result.deleted,
      deletedFromR2: r2Deleted,
      totalRequested: ids.length
    }, {
      headers: corsHeaders,
      rateLimitInfo: rateLimitResult
    });

  } catch (err) {
    logger.error('批量删除失败', err);

    // 处理不同类型的错误
    let errorMessage = '批量删除失败，请稍后重试';
    let statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;

    if (err.message.includes('fetch')) {
      errorMessage = '网络请求失败，请稍后重试';
    } else if (err.message.includes('JSON')) {
      errorMessage = '请求体格式错误，请检查JSON格式';
      statusCode = HTTP_STATUS.BAD_REQUEST;
    }

    return createErrorResponse(errorMessage, {
      status: statusCode,
      headers: corsHeaders,
      rateLimitInfo: null, // 错误情况下不返回限流信息
      logs: logger.getLogs(),
      debug: true
    });
  }
}