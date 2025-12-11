// 登录鉴权API

// 生成随机会话ID
function generateSessionId() {
  return crypto.randomUUID();
}

// 登录API
export async function onRequestPost(context) {
  const { request, env } = context;
  const { ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_KV } = env;
  
  try {
    // 解析请求体
    const body = await request.json();
    const { username, password } = body;
    
    // 验证用户名和密码
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return new Response(JSON.stringify({
        success: false,
        message: '用户名或密码错误'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
    
    // 生成会话ID
    const sessionId = generateSessionId();
    const sessionData = {
      username,
      createdAt: Date.now(),
      lastActivity: Date.now()
    };
    
    // 存储到KV，设置过期时间为7天
    const expirationTtl = 7 * 24 * 60 * 60; // 7天
    await SESSION_KV.put(sessionId, JSON.stringify(sessionData), { expirationTtl });
    
    // 设置Cookie
    const cookie = `session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${expirationTtl}`;
    
    return new Response(JSON.stringify({
      success: true,
      message: '登录成功'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    console.error('登录失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '登录失败，请稍后重试'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
}

// 登出API
export async function onRequestDelete(context) {
  const { request, env } = context;
  const { SESSION_KV } = env;
  
  try {
    // 从Cookie中获取会话ID
    const cookies = request.headers.get('Cookie') || '';
    const sessionIdMatch = cookies.match(/session_id=([^;]+)/);
    
    if (sessionIdMatch && sessionIdMatch[1]) {
      const sessionId = sessionIdMatch[1];
      // 从KV中删除会话
      await SESSION_KV.delete(sessionId);
    }
    
    // 清除Cookie
    const cookie = 'session_id=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
    
    return new Response(JSON.stringify({
      success: true,
      message: '登出成功'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    console.error('登出失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '登出失败，请稍后重试'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
}

// 验证会话API
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // 处理GitHub授权回调
  if (url.pathname === '/api/auth/github/callback') {
    return handleGithubCallback(context);
  }
  
  // 生成GitHub授权URL
  if (url.pathname === '/api/auth/github') {
    return redirectToGithubAuth(context);
  }
  
  // 原有会话验证逻辑
  return verifySession(context);
}

// 重定向到GitHub授权页
async function redirectToGithubAuth(context) {
  const { env } = context;
  const { GITHUB_CLIENT_ID } = env;
  
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
  
  // 重定向到GitHub授权页
  return new Response(null, {
    status: 302,
    headers: {
      'Location': githubAuthUrl
    }
  });
}

// 处理GitHub回调
async function handleGithubCallback(context) {
  const { request, env } = context;
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_ALLOWED_USERS, SESSION_KV } = env;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  
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

// 原有会话验证逻辑
async function verifySession(context) {
  const { request, env } = context;
  const { SESSION_KV } = env;
  
  try {
    // 从Cookie中获取会话ID
    const cookies = request.headers.get('Cookie') || '';
    const sessionIdMatch = cookies.match(/session_id=([^;]+)/);
    
    if (!sessionIdMatch || !sessionIdMatch[1]) {
      return new Response(JSON.stringify({
        success: false,
        message: '未登录'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
    
    const sessionId = sessionIdMatch[1];
    // 从KV中获取会话
    const sessionDataStr = await SESSION_KV.get(sessionId);
    
    if (!sessionDataStr) {
      return new Response(JSON.stringify({
        success: false,
        message: '会话已过期'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }
    
    const sessionData = JSON.parse(sessionDataStr);
    
    // 更新最后活动时间，自动续期
    sessionData.lastActivity = Date.now();
    const expirationTtl = 7 * 24 * 60 * 60; // 7天
    await SESSION_KV.put(sessionId, JSON.stringify(sessionData), { expirationTtl });
    
    // 更新Cookie
    const cookie = `session_id=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${expirationTtl}`;
    
    return new Response(JSON.stringify({
      success: true,
      message: '已登录',
      data: {
        username: sessionData.username
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    console.error('验证会话失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '验证会话失败，请稍后重试'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
}

// 处理OPTIONS请求
export async function onRequestOptions(context) {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}