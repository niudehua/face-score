// 限流中间件
// 用于实现基于 IP 的请求速率限制

/**
 * 基于 IP 的请求限流
 * @param {Request} request - HTTP 请求对象
 * @param {Object} context - Cloudflare Workers 上下文对象
 * @param {Object} options - 限流配置选项
 * @param {string} options.path - API 路径标识
 * @param {number} options.limit - 每分钟允许的最大请求数
 * @param {number} [options.windowSeconds=60] - 限流窗口大小（秒）
 * @returns {Promise<{limited: boolean, response?: Response, remaining?: number}>} - 限流结果
 */
export async function rateLimit(request, context, options) {
  const {
    path,
    limit,
    windowSeconds = 60
  } = options;

  // 获取客户端 IP
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0] || 'unknown';
  
  // 生成限流密钥
  const key = `rate_limit:${ip}:${path}`;
  
  // 获取当前时间窗口（每分钟一个窗口）
  const currentTime = Math.floor(Date.now() / 1000);
  const windowKey = `${key}:${Math.floor(currentTime / windowSeconds)}`;
  
  let currentCount = 0;
  let remaining = limit;
  
  try {
    // 检查是否有 KV 存储可用
    if (context.env && context.env.RATE_LIMIT_KV) {
      // 使用 KV 存储
      const kv = context.env.RATE_LIMIT_KV;
      
      // 获取当前计数
      const countStr = await kv.get(windowKey);
      currentCount = countStr ? parseInt(countStr, 10) : 0;
      
      // 检查是否超过限制
      if (currentCount >= limit) {
        remaining = 0;
      } else {
        // 增加计数
        await kv.put(windowKey, (currentCount + 1).toString(), {
          expirationTtl: windowSeconds * 2 // 设置过期时间，避免存储无限增长
        });
        remaining = limit - currentCount - 1;
      }
    } else {
      // 如果 KV 不可用，使用简单的内存存储（仅适用于开发环境）
      // 注意：这在生产环境的多个 Worker 实例中会失效
      if (!globalThis.rateLimitMemoryStore) {
        globalThis.rateLimitMemoryStore = new Map();
      }
      
      const memoryStore = globalThis.rateLimitMemoryStore;
      const windowData = memoryStore.get(windowKey) || {
        count: 0,
        windowStart: currentTime
      };
      
      // 检查窗口是否过期
      if (currentTime - windowData.windowStart >= windowSeconds) {
        // 窗口过期，重置计数
        windowData.count = 0;
        windowData.windowStart = currentTime;
      }
      
      currentCount = windowData.count;
      
      // 检查是否超过限制
      if (currentCount >= limit) {
        remaining = 0;
      } else {
        // 增加计数
        windowData.count++;
        memoryStore.set(windowKey, windowData);
        remaining = limit - windowData.count;
      }
    }
  } catch (error) {
    // 如果存储操作失败，记录错误但允许请求继续
    console.error('限流存储操作失败:', error.message);
    // 允许请求继续，但不返回限流头
    return { limited: false };
  }
  
  // 计算窗口重置时间（秒）
  const resetSeconds = windowSeconds - (currentTime % windowSeconds);
  
  // 如果超过限制，返回 429 响应
  if (currentCount >= limit) {
    const response = new Response(JSON.stringify({
      error: '请求过于频繁，请稍后再试',
      retryAfter: resetSeconds
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': resetSeconds.toString(),
        'Retry-After': resetSeconds.toString()
      }
    });
    
    return { limited: true, response };
  }
  
  // 返回限流信息，包括剩余请求数
  return {
    limited: false,
    remaining,
    limit,
    reset: resetSeconds
  };
}

/**
 * 向响应添加限流相关的响应头
 * @param {Response} response - HTTP 响应对象
 * @param {Object} rateLimitInfo - 限流信息对象
 */
export function addRateLimitHeaders(response, rateLimitInfo) {
  if (!response || !rateLimitInfo) {
    return;
  }
  
  const {
    limit,
    remaining,
    reset
  } = rateLimitInfo;
  
  // 克隆响应以修改响应头
  const responseWithHeaders = new Response(response.body, response);
  
  // 添加限流响应头
  responseWithHeaders.headers.set('X-RateLimit-Limit', limit.toString());
  responseWithHeaders.headers.set('X-RateLimit-Remaining', remaining.toString());
  responseWithHeaders.headers.set('X-RateLimit-Reset', reset.toString());
  
  return responseWithHeaders;
}
