// Turnstile 验证中间件
// 用于验证 Cloudflare Turnstile 响应令牌

/**
 * 验证 Turnstile 响应令牌
 * @param {string} token - Turnstile 响应令牌
 * @param {string} secretKey - Turnstile 服务器端密钥
 * @returns {Promise<boolean>} - 验证结果
 */
export async function verifyTurnstile(token, secretKey) {
  // 如果没有令牌，直接返回验证失败
  if (!token) {
    return false;
  }

  // 构建验证请求
  const formData = new FormData();
  formData.append('secret', secretKey);
  formData.append('response', token);

  try {
    // 发送验证请求到 Cloudflare
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData
    });

    // 解析响应结果
    const result = await response.json();
    return result.success;
  } catch (error) {
    // 如果验证请求失败，记录错误并返回验证失败
    console.error('Turnstile 验证请求失败:', error.message);
    return false;
  }
}

/**
 * 从请求中提取 Turnstile 响应令牌
 * @param {Request} request - HTTP 请求对象
 * @returns {Promise<string|null>} - Turnstile 令牌或 null
 */
export async function extractTurnstileToken(request) {
  // 尝试从请求头获取
  const headerToken = request.headers.get('X-Turnstile-Response');
  if (headerToken) {
    return headerToken;
  }

  // 尝试从 URL 查询参数获取
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('turnstile_response');
  if (queryToken) {
    return queryToken;
  }

  // 尝试从请求体获取（仅适用于 POST 请求）
  if (request.method === 'POST' || request.method === 'PUT') {
    try {
      const body = await request.clone().json();
      if (body.turnstile_response) {
        return body.turnstile_response;
      }
    } catch (error) {
      // 如果无法解析 JSON，忽略并继续
    }
  }

  return null;
}
