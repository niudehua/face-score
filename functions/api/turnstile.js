// 获取 Turnstile 站点密钥的 API 端点
// 用于前端动态获取 Turnstile 站点密钥

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function onRequestGet(context) {
  // 从环境变量中获取 Turnstile 站点密钥
  const { TURNSTILE_SITE_KEY } = context.env;

  // 返回 JSON 格式的响应，包含站点密钥
  return new Response(JSON.stringify({
    site_key: TURNSTILE_SITE_KEY || ''
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
