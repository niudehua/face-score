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
  const { SESSION_KV } = env;

  // 禁止缓存，防止循环重定向
  const noCacheHeaders = {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

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
        headers: noCacheHeaders
      });
    }

    const sessionId = sessionIdMatch[1];
    // 从KV中获取会话
    const sessionDataStr = await SESSION_KV.get(sessionId);

    if (!sessionDataStr) {
      // 关键修复：如果KV中没有会话，必须清除Cookie，否则客户端会死循环
      const clearCookie = 'session_id=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

      return new Response(JSON.stringify({
        success: false,
        message: '会话已过期'
      }), {
        status: 401,
        headers: {
          ...noCacheHeaders,
          'Set-Cookie': clearCookie
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
        ...noCacheHeaders,
        'Set-Cookie': cookie
      }
    });
  } catch (error) {
    console.error('验证会话失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '验证会话失败，请稍后重试'
    }), {
      status: 500,
      headers: noCacheHeaders
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