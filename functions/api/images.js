// 导入模块
import { getImages, deleteImages, getImagesByIds } from '../lib/db.js';
import { rateLimit, addRateLimitHeaders } from '../lib/rate-limit.js';
import { verifyTurnstile, extractTurnstileToken } from '../lib/turnstile.js';
import { deleteImagesFromR2 } from '../lib/storage.js';

// 验证会话
async function verifySession(request, env) {
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
  const { FACE_SCORE_DB, TURNSTILE_SECRET_KEY, SESSION_KV } = context.env;
  const logs = [];

  function log(msg) {
    logs.push(msg);
    console.log(msg);
  }

  log(`🐾 [DEBUG] FACEPP_KEY: ${context.env.FACEPP_KEY ? "已设置" : "未设置"}`);
  log(`🐾 [DEBUG] FACEPP_SECRET: ${context.env.FACEPP_SECRET ? "已设置" : "未设置"}`);
  log(`🐾 [DEBUG] TURNSTILE_SECRET_KEY: ${TURNSTILE_SECRET_KEY ? "已设置" : "未设置"}`);

  // 1. 实施限流
  const rateLimitResult = await rateLimit(context.request, context, {
    path: '/api/images',
    limit: 50, // 每分钟50次请求
    windowSeconds: 60
  });

  if (rateLimitResult.limited) {
    log(`❌ [ERROR] 请求被限流: ${rateLimitResult.response.status}`);
    return rateLimitResult.response;
  }

  // 2. 验证会话
  const sessionResult = await verifySession(context.request, context.env);
  if (!sessionResult.valid) {
    log(`❌ [ERROR] 会话验证失败: ${sessionResult.message}`);
    return new Response(JSON.stringify({ 
      error: sessionResult.message 
    }), {
      status: 401,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
    });
  }
  
  log(`✅ [DEBUG] 会话验证成功，用户: ${sessionResult.sessionData.username}`);

  // 3. 照片列表不需要 Turnstile 验证，跳过验证逻辑
  log(`⚠️ [DEBUG] 照片列表请求，跳过 Turnstile 验证`);

  // 4. 解析请求参数
  try {
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
    
    log(`🐾 [DEBUG] 请求参数: page=${page}, limit=${limit}, sort_by=${sort_by}, order=${order}, date_from=${date_from}, date_to=${date_to}`);

    // 5. 验证参数
    if (page < 1) {
      throw new Error('页码必须大于等于1');
    }
    if (limit < 1 || limit > 100) {
      throw new Error('每页数量必须在1-100之间');
    }

    // 6. 调用数据库查询
    if (!FACE_SCORE_DB) {
      log(`❌ [ERROR] D1数据库未绑定`);
      return new Response(JSON.stringify({ 
        error: "D1数据库未绑定喵～", 
        logs: debug ? logs : undefined 
      }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        },
      });
    }

    // 7. 获取图片列表
    const result = await getImages(FACE_SCORE_DB, {
      page,
      limit,
      sort_by,
      order,
      date_from,
      date_to
    });

    log(`✅ [DEBUG] 获取图片列表成功，总记录数: ${result.pagination.total}, 每页数量: ${result.pagination.limit}, 当前页码: ${result.pagination.page}`);

    // 8. 返回响应
    let response = new Response(JSON.stringify({
      data: result.data,
      pagination: result.pagination,
      logs: debug ? logs : undefined
    }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
    });

    // 添加限流响应头
    response = addRateLimitHeaders(response, rateLimitResult);
    return response;

  } catch (err) {
    log(`❌ [ERROR] 处理请求失败: ${err.message}`);
    return new Response(JSON.stringify({ 
      error: err.message, 
      logs 
    }), {
      status: 400,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
    });
  }
}

// 批量删除图片API
export async function onRequestDelete(context) {
  const { FACE_SCORE_DB, FACE_IMAGES } = context.env;
  const logs = [];

  function log(msg) {
    logs.push(msg);
    console.log(msg);
  }

  // 1. 实施限流
  const rateLimitResult = await rateLimit(context.request, context, {
    path: '/api/images',
    limit: 10, // 每分钟10次请求
    windowSeconds: 60
  });

  if (rateLimitResult.limited) {
    log(`❌ [ERROR] 请求被限流: ${rateLimitResult.response.status}`);
    return rateLimitResult.response;
  }

  // 2. 验证会话
  const sessionResult = await verifySession(context.request, context.env);
  if (!sessionResult.valid) {
    log(`❌ [ERROR] 会话验证失败: ${sessionResult.message}`);
    return new Response(JSON.stringify({ 
      error: sessionResult.message 
    }), {
      status: 401,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
    });
  }
  
  log(`✅ [DEBUG] 会话验证成功，用户: ${sessionResult.sessionData.username}`);

  try {
    // 3. 解析请求体
    log(`🐾 [DEBUG] 开始解析请求体`);
    const body = await context.request.json();
    const { ids } = body;
    
    log(`🐾 [DEBUG] 请求体解析成功: ${JSON.stringify(body)}`);
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      log(`⚠️ [WARN] 未提供有效的图片ID列表`);
      return new Response(JSON.stringify({
        error: '请提供要删除的图片ID列表'
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        },
      });
    }
    
    log(`🐾 [DEBUG] 批量删除请求，ID数量: ${ids.length}`);
    log(`🐾 [DEBUG] 收到的ID列表: ${JSON.stringify(ids)}`);
    
    // 4. 检查数据库连接
    if (!FACE_SCORE_DB) {
      log(`❌ [ERROR] FACE_SCORE_DB 未配置`);
      return new Response(JSON.stringify({
        error: '数据库连接失败'
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        },
      });
    }
    
    // 4. 获取要删除的图片信息
    log(`🐾 [DEBUG] 开始获取要删除的图片信息`);
    const imagesToDelete = await getImagesByIds(FACE_SCORE_DB, ids);
    const md5List = imagesToDelete.map(image => image.md5);
    
    log(`🐾 [DEBUG] getImagesByIds返回结果: ${JSON.stringify(imagesToDelete)}`);
    log(`🐾 [DEBUG] 提取的MD5列表: ${JSON.stringify(md5List)}`);
    log(`🐾 [DEBUG] 要删除的图片信息获取成功，MD5数量: ${md5List.length}`);
    
    // 5. 从R2删除图片
    let r2Deleted = 0;
    if (FACE_IMAGES && md5List.length > 0) {
      log(`🐾 [DEBUG] 开始从R2删除图片`);
      r2Deleted = await deleteImagesFromR2(FACE_IMAGES, md5List);
      log(`✅ [DEBUG] 从R2删除成功，数量: ${r2Deleted}`);
    } else if (FACE_IMAGES) {
      log(`⚠️ [DEBUG] 未找到对应的图片信息，跳过R2删除`);
    } else {
      log(`⚠️ [DEBUG] 未绑定FACE_IMAGES，跳过R2删除`);
    }
    
    // 6. 从D1删除记录
    log(`🐾 [DEBUG] 开始从D1删除记录`);
    const d1Result = await deleteImages(FACE_SCORE_DB, ids);
    log(`🐾 [DEBUG] deleteImages返回结果: ${JSON.stringify(d1Result)}`);
    log(`✅ [DEBUG] 从D1删除成功，数量: ${d1Result.deleted}`);
    
    // 7. 返回响应
    const responseData = {
      success: true,
      message: '批量删除成功',
      deletedFromD1: d1Result.deleted,
      deletedFromR2: r2Deleted,
      totalRequested: ids.length
    };
    
    log(`✅ [DEBUG] 删除操作完成，返回数据: ${JSON.stringify(responseData)}`);
    
    let response = new Response(JSON.stringify(responseData), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
    });
    
    // 添加限流响应头
    response = addRateLimitHeaders(response, rateLimitResult);
    return response;
    
  } catch (err) {
    log(`❌ [ERROR] 批量删除失败: ${err.message}`);
    log(`❌ [ERROR] 错误堆栈: ${err.stack}`);
    
    // 处理不同类型的错误
    let errorMessage = '批量删除失败，请稍后重试';
    let statusCode = 500;
    
    if (err.message.includes('fetch')) {
      errorMessage = '网络请求失败，请稍后重试';
    } else if (err.message.includes('JSON')) {
      errorMessage = '请求体格式错误，请检查JSON格式';
      statusCode = 400;
    }
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      detail: err.message
    }), {
      status: statusCode,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
    });
  }
}