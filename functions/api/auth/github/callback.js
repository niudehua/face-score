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
    // 检查环境变量
    console.log('[DEBUG] 检查环境变量:');
    console.log(`[DEBUG] GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID ? '已设置' : '未设置'}`);
    console.log(`[DEBUG] GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET ? '已设置' : '未设置'}`);
    console.log(`[DEBUG] GITHUB_ALLOWED_USERS: ${GITHUB_ALLOWED_USERS || '未设置'}`);
    
    // 1. 交换授权码获取访问令牌
    console.log('[DEBUG] 交换授权码获取访问令牌');
    
    // 注意：GitHub OAuth令牌交换端点需要使用表单格式发送请求
    const formData = new URLSearchParams();
    formData.append('client_id', GITHUB_CLIENT_ID);
    formData.append('client_secret', GITHUB_CLIENT_SECRET);
    formData.append('code', code);
    const formDataString = formData.toString();
    
    console.log(`[DEBUG] 请求URL: https://github.com/login/oauth/access_token`);
    console.log(`[DEBUG] 请求方法: POST`);
    console.log(`[DEBUG] 请求体: ${formDataString}`);
    console.log(`[DEBUG] 请求体长度: ${formDataString.length}`);
    
    try {
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        body: formDataString
      });
      
      console.log(`[DEBUG] 令牌响应状态: ${tokenResponse.status}`);
      
      // 检查响应内容类型
      const contentType = tokenResponse.headers.get('content-type');
      console.log(`[DEBUG] 令牌响应内容类型: ${contentType}`);
      
      // 获取所有响应头
      const headers = {};
      for (const [key, value] of tokenResponse.headers) {
        headers[key] = value;
      }
      console.log(`[DEBUG] 所有响应头: ${JSON.stringify(headers)}`);
      
      // 读取响应文本，以便查看实际返回的内容
      const tokenResponseText = await tokenResponse.text();
      console.log(`[DEBUG] 令牌响应文本长度: ${tokenResponseText.length}`);
      console.log(`[DEBUG] 令牌响应文本: "${tokenResponseText}"`);
      
      // 清理响应文本，去除可能的BOM和空白字符
      const cleanedText = tokenResponseText.trim();
      console.log(`[DEBUG] 清理后的响应文本: "${cleanedText}"`);
      
      // 尝试解析为JSON
      let tokenData;
      try {
        tokenData = JSON.parse(cleanedText);
        console.log(`[DEBUG] 令牌响应数据: ${JSON.stringify(tokenData)}`);
      } catch (parseError) {
        // 如果JSON解析失败，尝试检查是否是HTML响应
        if (cleanedText.startsWith('<')) {
          throw new Error(`GitHub returned HTML instead of JSON: ${cleanedText.substring(0, 100)}...`);
        }
        throw new Error(`Failed to parse token response as JSON: "${cleanedText}", error: ${parseError.message}`);
      }
      
      if (!tokenData.access_token) {
        throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
      }
    } catch (fetchError) {
      console.error(`[DEBUG] fetch错误: ${fetchError.message}`);
      console.error(`[DEBUG] fetch错误堆栈: ${fetchError.stack}`);
      // 尝试使用更简单的HTTP客户端实现
      console.log('[DEBUG] 尝试使用更简单的HTTP客户端实现');
      
      // 注意：在Cloudflare Workers环境中，我们不能使用其他HTTP客户端，所以这里只是为了调试
      throw new Error(`Network error when calling GitHub API: ${fetchError.message}`);
    }
    
    // 2. 使用访问令牌获取用户信息
    console.log('[DEBUG] 使用访问令牌获取用户信息');
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });
    
    console.log(`[DEBUG] 用户信息响应状态: ${userResponse.status}`);
    const userData = await userResponse.json();
    console.log(`[DEBUG] 用户信息: ${JSON.stringify(userData)}`);
    
    const username = userData.login;
    if (!username) {
      throw new Error(`Failed to get username from GitHub: ${JSON.stringify(userData)}`);
    }
    
    // 3. 关键：检查用户是否在允许列表中
    const allowedUsers = (GITHUB_ALLOWED_USERS || '').split(',').map(u => u.trim());
    console.log(`[DEBUG] 允许的用户列表: ${allowedUsers.join(', ')}`);
    console.log(`[DEBUG] 当前用户: ${username}`);
    
    if (allowedUsers.length > 0 && !allowedUsers.includes(username)) {
      console.log('[DEBUG] 用户不在允许列表中');
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
    console.log('[DEBUG] 存储会话到KV');
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
    console.error('GitHub登录失败详情:', error.stack);
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'GitHub登录失败，请稍后重试',
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}