// 生成随机会话ID
function generateSessionId() {
  return crypto.randomUUID();
}

// 处理GitHub回调
export async function onRequestGet(context) {
  const { request, env } = context;
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_ALLOWED_USERS, SESSION_KV } = env;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  
  console.log('[DEBUG] 处理 /api/auth/github/callback 请求');
  
  if (!code) {
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'GitHub授权失败，缺少授权码' 
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  try {
    // 1. 交换授权码获取访问令牌
    console.log('[DEBUG] 交换授权码获取访问令牌');
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code
      })
    });
    
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      throw new Error('Failed to get access token');
    }
    
    // 2. 使用访问令牌获取用户信息
    console.log('[DEBUG] 使用访问令牌获取用户信息');
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });
    
    const userData = await userResponse.json();
    const username = userData.login;
    
    // 3. 关键：检查用户是否在允许列表中
    const allowedUsers = (GITHUB_ALLOWED_USERS || '').split(',').map(u => u.trim());
    if (!allowedUsers.includes(username)) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: '您的GitHub账号未被授权访问' 
      }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    // 4. 生成会话ID
    const sessionId = generateSessionId();
    const sessionData = {
      username,
      provider: 'github',
      createdAt: Date.now(),
      lastActivity: Date.now()
    };
    
    // 5. 存储到KV，设置过期时间为7天
    const expirationTtl = 7 * 24 * 60 * 60; // 7天
    await SESSION_KV.put(sessionId, JSON.stringify(sessionData), { expirationTtl });
    
    // 6. 设置Cookie
    const cookie = `session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${expirationTtl}`;
    
    // 7. 登录成功，跳转到图片列表页
    console.log(`[DEBUG] 登录成功，跳转到图片列表页: ${username}`);
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/images',
        'Set-Cookie': cookie
      }
    });
  } catch (error) {
    console.error('GitHub登录失败:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'GitHub登录失败，请稍后重试' 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}