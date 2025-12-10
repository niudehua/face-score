// 导入模块
import { getImages } from '../lib/db.js';
import { rateLimit, addRateLimitHeaders } from '../lib/rate-limit.js';
import { verifyTurnstile, extractTurnstileToken } from '../lib/turnstile.js';

export async function onRequestGet(context) {
  const { FACE_SCORE_DB, TURNSTILE_SECRET_KEY } = context.env;
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

  // 2. Turnstile 验证
  let isMiniProgram = false;
  
  // 检查请求是否来自小程序
  try {
    const body = await context.request.clone().json();
    // 检查请求体中的标识
    if (body.app_type === 'miniprogram') {
      isMiniProgram = true;
      log(`🐱 [DEBUG] 检测到小程序请求，跳过 Turnstile 验证`);
    }
  } catch (err) {
    // 忽略 JSON 解析错误
  }
  
  // 检查请求头中的标识
  if (!isMiniProgram && context.request.headers.get('X-App-Type') === 'miniprogram') {
    isMiniProgram = true;
    log(`🐱 [DEBUG] 检测到小程序请求头，跳过 Turnstile 验证`);
  }
  
  if (TURNSTILE_SECRET_KEY && !isMiniProgram) {
    try {
      const turnstileToken = await extractTurnstileToken(context.request);
      const isVerified = await verifyTurnstile(turnstileToken, TURNSTILE_SECRET_KEY);
      
      if (!isVerified) {
        log(`❌ [ERROR] Turnstile 验证失败: 无效或缺失令牌`);
        return new Response(JSON.stringify({ 
          error: "验证失败，请检查您的请求喵～", 
          logs 
        }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      
      log(`✅ [DEBUG] Turnstile 验证成功`);
    } catch (err) {
      log(`❌ [ERROR] Turnstile 验证过程出错: ${err.message}`);
      return new Response(JSON.stringify({ 
        error: "验证过程出错，请稍后重试喵～", 
        logs 
      }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else if (isMiniProgram) {
    log(`🐱 [DEBUG] 小程序请求，跳过 Turnstile 验证`);
  } else {
    log(`⚠️ [WARN] Turnstile 密钥未配置，跳过验证`);
  }

  // 3. 解析请求参数
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

    // 4. 验证参数
    if (page < 1) {
      throw new Error('页码必须大于等于1');
    }
    if (limit < 1 || limit > 100) {
      throw new Error('每页数量必须在1-100之间');
    }

    // 5. 调用数据库查询
    if (!FACE_SCORE_DB) {
      log(`❌ [ERROR] D1数据库未绑定`);
      return new Response(JSON.stringify({ 
        error: "D1数据库未绑定喵～", 
        logs: debug ? logs : undefined 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
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

    log(`✅ [DEBUG] 获取图片列表成功，总记录数: ${result.pagination.total}, 每页数量: ${result.pagination.limit}, 当前页码: ${result.pagination.page}`);

    // 7. 返回响应
    let response = new Response(JSON.stringify({
      data: result.data,
      pagination: result.pagination,
      logs: debug ? logs : undefined
    }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
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
      headers: { "Content-Type": "application/json" },
    });
  }
}