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
    logs.push(`🐾 [DEBUG] 正在请求 Face++ 接口...`);
    const resp = await fetch("https://api-us.faceplusplus.com/facepp/v3/detect", {
      method: "POST",
      body: formData,
    });

    logs.push(`📡 [DEBUG] 返回状态码: ${resp.status}`);
    const result = await resp.json();
    logs.push(`✅ [DEBUG] Face++ 返回结果: ${JSON.stringify(result)}`);

    if (!resp.ok) {
      logs.push(`❌ [ERROR] 接口非正常响应: HTTP ${resp.status}`);
      return new Response(JSON.stringify({
        error: "Face++ 接口响应错误喵～",
        status: resp.status,
        detail: result.error_message || "未知错误",
        logs: debug ? logs : undefined,
      }), {
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
