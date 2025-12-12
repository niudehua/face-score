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

    // 发送请求获取令牌
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
    console.log(`[DEBUG] 令牌响应文本前100字符: "${tokenResponseText.substring(0, 100)}..."`);

    // 检查响应是否以常见的JSON开头字符开始
    const firstNonWhitespaceChar = tokenResponseText.trim()[0];
    console.log(`[DEBUG] 响应第一个非空白字符: "${firstNonWhitespaceChar}"`);

    // 检查是否是常见的非JSON响应格式
    const isLikelyJson = firstNonWhitespaceChar === '{' || firstNonWhitespaceChar === '[';
    console.log(`[DEBUG] 响应是否可能是JSON: ${isLikelyJson}`);

    // 特别处理"Unexpected token 'R'"错误，这通常是截断的HTTP响应
    if (tokenResponseText.includes('Request for') || tokenResponseText.includes('\r\nRequest')) {
      throw new Error('GitHub returned truncated HTTP response: "Request for..."');
    }

    // 检查响应是否为空
    if (!tokenResponseText.trim()) {
      throw new Error('GitHub returned empty response');
    }

    // 检查响应是否为HTML格式
    const isHtmlResponse = tokenResponseText.includes('<html') || tokenResponseText.includes('<HTML') || tokenResponseText.includes('<head') || tokenResponseText.includes('<HEAD') || tokenResponseText.includes('<body') || tokenResponseText.includes('<BODY') || tokenResponseText.startsWith('<');
    console.log(`[DEBUG] 响应是否为HTML: ${isHtmlResponse}`);

    if (isHtmlResponse || !isLikelyJson) {
      // 如果是HTML响应或不太可能是JSON，提取错误信息
      let errorMessage = 'Unknown non-JSON response';

      try {
        // 尝试提取title标签内容
        const titleMatch = tokenResponseText.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          errorMessage = titleMatch[1].trim();
        } else if (tokenResponseText.includes('Request for')) {
          // 处理截断的HTTP响应
          errorMessage = 'Truncated HTTP response: Request for...';
        } else if (tokenResponseText.includes('Bad Request') || tokenResponseText.includes('400')) {
          errorMessage = 'Bad Request from GitHub API';
        } else if (tokenResponseText.includes('Not Found') || tokenResponseText.includes('404')) {
          errorMessage = 'GitHub API endpoint not found';
        } else if (tokenResponseText.includes('Server Error') || tokenResponseText.includes('500')) {
          errorMessage = 'GitHub Server Error';
        } else {
          // 尝试提取前100个字符作为错误信息
          errorMessage = tokenResponseText.trim().substring(0, 100) + '...';
        }
      } catch (htmlError) {
        // 如果提取失败，使用通用错误信息
        errorMessage = `Non-JSON response: ${tokenResponseText.trim().substring(0, 100)}...`;
      }

      throw new Error(`GitHub returned non-JSON response: ${errorMessage}`);
    }

    // 清理响应文本，去除可能的BOM和空白字符
    const cleanedText = tokenResponseText.trim();

    // 尝试解析为JSON
    let tokenData;
    try {
      // 使用try-catch处理JSON解析
      tokenData = JSON.parse(cleanedText);
      console.log(`[DEBUG] 令牌响应数据: ${JSON.stringify(tokenData)}`);
    } catch (parseError) {
      // 再次检查是否是HTML或其他非JSON响应
      if (cleanedText.includes('<') || cleanedText.includes('Request for')) {
        throw new Error(`GitHub returned HTML/non-JSON response: ${cleanedText.substring(0, 100)}...`);
      }

      // 如果确实是JSON解析错误，返回详细错误信息
      const errorMsg = `Failed to parse token response as JSON: "${cleanedText.substring(0, 100)}...", error: ${parseError.message}`;
      console.error(`[DEBUG] JSON解析错误详情: ${errorMsg}`);
      console.error(`[DEBUG] 完整响应文本: "${tokenResponseText}"`);
      throw new Error(errorMsg);
    }

    if (!tokenData.access_token) {
      // 处理GitHub返回的特定错误
      if (tokenData.error === 'bad_verification_code') {
        console.error(`[DEBUG] bad_verification_code错误: ${tokenData.error_description || 'The code passed is incorrect or expired.'}`);
        // 根据GitHub文档，解决方法是重新启动OAuth授权流程
        throw new Error(`Failed to get access token: Bad verification code - the code is incorrect or expired. Please try logging in again.`);
      } else if (tokenData.error === 'incorrect_client_credentials') {
        console.error(`[DEBUG] incorrect_client_credentials错误: ${tokenData.error_description || 'The client_id and/or client_secret passed are incorrect.'}`);
        throw new Error(`Failed to get access token: Invalid GitHub OAuth credentials. Please check your client_id and client_secret.`);
      } else if (tokenData.error === 'redirect_uri_mismatch') {
        console.error(`[DEBUG] redirect_uri_mismatch错误: ${tokenData.error_description || 'The redirect_uri MUST match the registered callback URL.'}`);
        throw new Error(`Failed to get access token: Redirect URI mismatch. Please check your registered callback URL.`);
      } else if (tokenData.error === 'unverified_user_email') {
        console.error(`[DEBUG] unverified_user_email错误: ${tokenData.error_description || 'The user must have a verified primary email.'}`);
        throw new Error(`Failed to get access token: Your GitHub email is not verified. Please verify your email address and try again.`);
      } else {
        // 其他错误
        console.error(`[DEBUG] 获取访问令牌失败: ${JSON.stringify(tokenData)}`);
        throw new Error(`Failed to get access token: ${tokenData.error || 'Unknown error'} - ${tokenData.error_description || 'No description available.'}`);
      }
    }

    // 2. 使用访问令牌获取用户信息
    console.log('[DEBUG] 使用访问令牌获取用户信息');
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'Face-Score-App'
      }
    });

    console.log(`[DEBUG] 用户信息响应状态: ${userResponse.status}`);

    // 读取响应文本，以便查看实际返回的内容
    const userResponseText = await userResponse.text();
    console.log(`[DEBUG] 用户信息响应文本: "${userResponseText.substring(0, 100)}..."`);

    let userData;
    try {
      userData = JSON.parse(userResponseText);
      console.log(`[DEBUG] 用户信息: ${JSON.stringify(userData)}`);
    } catch (userParseError) {
      throw new Error(`Failed to parse user data as JSON: "${userResponseText.substring(0, 100)}...", error: ${userParseError.message}`);
    }

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
        'Set-Cookie': cookie,
        'Cache-Control': 'no-store'
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