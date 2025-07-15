async function fetchWithRetry(url, options, retries = 3, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🐾 [DEBUG] 第 ${i + 1} 次调用 Face++ 接口`);
      const resp = await fetch(url, options);
      if (!resp.ok) {
        console.warn(`⚠️ [WARN] 请求失败，状态码: ${resp.status}`);
        throw new Error(`HTTP ${resp.status}`);
      }
      return resp;
    } catch (err) {
      console.error(`❌ [ERROR] 第 ${i + 1} 次调用失败:`, err.message);
      if (i < retries - 1) {
        console.log(`⏳ 等待 ${delayMs}ms 后重试...`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        console.log("🚫 重试次数用完啦～");
        throw err;
      }
    }
  }
}

export async function onRequestPost(context) {
  const { FACEPP_KEY, FACEPP_SECRET } = context.env;
  console.log("🐾 [DEBUG] FACEPP_KEY:", FACEPP_KEY ? "已设置" : "未设置");
  console.log("🐾 [DEBUG] FACEPP_SECRET:", FACEPP_SECRET ? "已设置" : "未设置");

  let body;
  try {
    body = await context.request.json();
    console.log("🐾 [DEBUG] 接收到请求 body:", body);
  } catch (err) {
    console.error("❌ [ERROR] 解析 JSON body 失败:", err);
    return new Response(JSON.stringify({ error: "请求体不是有效 JSON 喵～" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const imageBase64 = body.image;
  if (!imageBase64) {
    console.warn("⚠️ [WARN] image 字段为空");
    return new Response(JSON.stringify({ error: "缺少 image 字段喵～" }), {
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
    }, 3, 1000); // 重试3次，间隔1秒

    const result = await resp.json();
    console.log("✅ [DEBUG] Face++ 返回结果:", result);

    if (result.error_message) {
      console.error("❌ [ERROR] Face++ 返回错误:", result.error_message);
      return new Response(JSON.stringify({ error: "Face++ 接口错误喵～", detail: result.error_message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (result.faces && result.faces.length > 0) {
      const score = result.faces[0].attributes.beauty.male_score;
      return new Response(JSON.stringify({ score }), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      console.warn("⚠️ [WARN] 没有检测到人脸");
      return new Response(JSON.stringify({ error: "没有检测到人脸喵～" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("❌ [ERROR] Face++ 调用异常:", e);
    return new Response(JSON.stringify({ error: "Face++ 调用失败喵～", detail: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
