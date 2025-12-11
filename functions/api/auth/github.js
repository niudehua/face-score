// 生成随机会话ID
function generateSessionId() {
  return crypto.randomUUID();
}

// 处理GitHub授权请求
export async function onRequestGet(context) {
  const { env } = context;
  const { GITHUB_CLIENT_ID } = env;
  
  console.log('[DEBUG] 处理 /api/auth/github 请求');
  
  if (!GITHUB_CLIENT_ID) {
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'GitHub OAuth 配置未完成' 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  // 构建GitHub授权URL
  const callbackUrl = `https://${context.request.headers.get('Host')}/api/auth/github/callback`;
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=read:user`;
  
  console.log(`[DEBUG] 重定向到GitHub授权页: ${githubAuthUrl}`);
  
  // 重定向到GitHub授权页
  return new Response(null, {
    status: 302,
    headers: {
      'Location': githubAuthUrl
    }
  });
}