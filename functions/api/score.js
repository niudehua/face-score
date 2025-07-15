async function fetchWithRetry(url, options, retries = 3, delayMs = 1000, logs = []) {
  for (let i = 0; i < retries; i++) {
    try {
      logs.push(`🐾 [DEBUG] 第 ${i + 1} 次调用 Face++ 接口`);
      const resp = await fetch(url, options);

      if (resp.ok) {
        logs.push(`✅ [DEBUG] 第 ${i + 1} 次调用成功，状态码: ${resp.status}`);
        return resp;
      }

      if (resp.status >= 400 && resp.status < 500) {
        logs.push(`⚠️ [WARN] 客户端错误（${resp.status}），不再重试`);
        return resp;
      }

      logs.push(`⚠️ [WARN] 服务器错误，状态码: ${resp.status}`);
      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      logs.push(`❌ [ERROR] 第 ${i + 1} 次调用失败: ${err.message}`);
      if (i < retries - 1) {
        logs.push(`⏳ 等待 ${delayMs}ms 后重试...`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        logs.push("🚫 重试次数用完啦～");
        throw err;
      }
    }
  }
}

export async function onRequestPost(context) {
  const { FACEPP_KEY, FACEPP_SECRET } = context.env;
  const logs = [];

  logs.push(`🐾 [DEBUG] FACEPP_KEY: ${FACEPP_KEY ? "已设置" : "未设置"}`);
  logs.push(`🐾 [DEBUG] FACEPP_SECRET: ${FACEPP_SECRET ? "已设置" : "未设置"}`);

  let body;
  try {
    body = await context.request.json();
    logs.push(`🐾 [DEBUG] 接收到请求 body: ${JSON.stringify(body)}`);
  } catch (err) {
    logs.push(`❌ [ERROR] 解析 JSON body 失败: ${err.message}`);
    return new Response(JSON.stringify({ error: "请求体不是有效 JSON 喵～", logs }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { image: imageBase64, debug } = body;

  if (!imageBase64) {
    logs.push("⚠️ [WARN] image 字段为空");
    return new Response(JSON.stringify({ error: "缺少 image 字段喵～", logs }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const formData = new FormData();
  formData.append("api_key", FACEPP_KEY);
  formData.append("api_secret", FACEPP_SECRET);
  formData.append("image_base64", imageBase64);
  formData.append("return_attributes", "beauty");

  try {
    const resp = await fetchWithRetry("https://api-cn.faceplusplus.com/facepp/v3/detect", {
      method: "POST",
      body: formData,
    }, 3, 1000, logs);

    const result = await resp.json();
    logs.push(`✅ [DEBUG] Face++ 返回结果: ${JSON.stringify(result)}`);

    if (result.error_message) {
      logs.push(`❌ [ERROR] Face++ 返回错误: ${result.error_message}`);
      return new Response(JSON.stringify({ error: "Face++ 接口错误喵～", detail: result.error_message, logs: debug ? logs : undefined }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (result.faces && result.faces.length > 0) {
      const score = result.faces[0].attributes.beauty.male_score;
      return new Response(JSON.stringify({ score, logs: debug ? logs : undefined }), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      logs.push("⚠️ [WARN] 没有检测到人脸");
      return new Response(JSON.stringify({ error: "没有检测到人脸喵～", logs: debug ? logs : undefined }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    logs.push(`❌ [ERROR] Face++ 调用异常: ${e.message}`);
    return new Response(JSON.stringify({ error: "Face++ 调用失败喵～", detail: e.message, logs: debug ? logs : undefined }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
