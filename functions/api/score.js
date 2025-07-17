export async function onRequestPost(context) {
  const { FACEPP_KEY, FACEPP_SECRET } = context.env;
  const logs = [];

  function log(msg) {
    logs.push(msg);
    console.log(msg);  // 这里打印到 Workers 控制台
  }

  log(`🐾 [DEBUG] FACEPP_KEY: ${FACEPP_KEY ? "已设置" : "未设置"}`);
  log(`🐾 [DEBUG] FACEPP_SECRET: ${FACEPP_SECRET ? "已设置" : "未设置"}`);

  let body;
  try {
    body = await context.request.json();
    log(`🐾 [DEBUG] 接收到请求 body: ${JSON.stringify(body)}`);
  } catch (err) {
    log(`❌ [ERROR] 解析 JSON body 失败: ${err.message}`);
    return new Response(JSON.stringify({ error: "请求体不是有效 JSON 喵～", logs }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { image: imageBase64, debug } = body;

  if (!imageBase64) {
    log("⚠️ [WARN] image 字段为空");
    return new Response(JSON.stringify({ error: "缺少 image 字段喵～", logs }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const formData = new FormData();
  formData.append("api_key", FACEPP_KEY);
  formData.append("api_secret", FACEPP_SECRET);
  formData.append("image_base64", imageBase64);
  formData.append("return_attributes", "age,gender,smiling,headpose,facequality,blur,eyestatus,emotion,ethnicity,beauty,mouthstatus,eyegaze,skinstatus");

  try {
    log(`🐾 [DEBUG] 正在请求 Face++ 接口...`);
    const resp = await fetch("https://api-us.faceplusplus.com/facepp/v3/detect", {
      method: "POST",
      body: formData,
    });

    log(`📡 [DEBUG] 返回状态码: ${resp.status}`);
    const result = await resp.json();
    log(`✅ [DEBUG] Face++ 返回结果: ${JSON.stringify(result)}`);

    if (!resp.ok) {
      log(`❌ [ERROR] 接口非正常响应: HTTP ${resp.status}`);
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
      const face = result.faces[0];
      const {
        beauty,
        gender,
        age,
        smile,
        headpose,
        facequality,
        blur,
        eyestatus,
        emotion,
        ethnicity,
        mouthstatus,
        eyegaze,
        skinstatus,
      } = face.attributes;
      
      // 颜值分数（这里选对性别的分）
      const score = gender.value === "Male" ? beauty.male_score : beauty.female_score;
      
      // 性别映射
      const genderCn =
        gender.value === "Male"
          ? "帅气小哥哥"
          : gender.value === "Female"
          ? "漂亮小姐姐"
          : "萌萌猫猫";
      
      // 表情描述，取概率最高的两个
      const emotionDesc = Object.entries(emotion)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}(${(v * 100).toFixed(1)}%)`)
        .slice(0, 2)
        .join("，");
      
      // 眼睛闭合概率（no_glass_eye_close 是闭眼概率）
      const leftEyeClosed = eyestatus.left_eye_status.no_glass_eye_close ?? 0;
      const rightEyeClosed = eyestatus.right_eye_status.no_glass_eye_close ?? 0;
      const eyeStatusDesc = `左眼闭合度 ${(leftEyeClosed * 100).toFixed(1)}%，右眼闭合度 ${(rightEyeClosed * 100).toFixed(1)}%`;
      
      // 嘴巴状态，mouthstatus 里几个字段简单拼接
      const mouthOpen = mouthstatus.open ?? 0;
      const mouthClose = mouthstatus.close ?? 0;
      const mouthStatusDesc = `嘴巴张开概率 ${(mouthOpen * 100).toFixed(1)}%，闭合概率 ${(mouthClose * 100).toFixed(1)}%`;
      
      // 种族信息，有可能是空字符串
      const ethnicityDesc = ethnicity.value ? `种族：${ethnicity.value}` : "种族信息未知";
      
      // 眼睛注视方向，取左右眼的坐标平均值
      const leftGaze = eyegaze.left_eye_gaze;
      const rightGaze = eyegaze.right_eye_gaze;
      const avgGazeX = ((leftGaze.position_x_coordinate + rightGaze.position_x_coordinate) / 2).toFixed(3);
      const avgGazeY = ((leftGaze.position_y_coordinate + rightGaze.position_y_coordinate) / 2).toFixed(3);
      const eyeGazeDesc = `眼睛注视方向坐标约为 (X: ${avgGazeX}, Y: ${avgGazeY})`;
      
      // 皮肤状态，防止没数据报错
      const skinHealth = skinstatus.health ?? 0;
      const skinStain = skinstatus.stain ?? 0;
      const skinDarkCircle = skinstatus.dark_circle ?? 0;
      const skinAcne = skinstatus.acne ?? 0;
      const skinStatusDesc = `皮肤健康度${skinHealth.toFixed(1)}，斑点${skinStain.toFixed(1)}，黑眼圈${skinDarkCircle.toFixed(1)}，痘痘${skinAcne.toFixed(1)}`;
      
      // 笑容概率
      const smileValue = smile.value ?? 0;
      
      // 头部姿态
      const yaw = headpose.yaw_angle ?? 0;
      const pitch = headpose.pitch_angle ?? 0;
      const roll = headpose.roll_angle ?? 0;
      
      // 模糊度 blur 对象里的 blurness
      const blurLevel = blur.blurness?.value ?? 0;
      
      // 脸部质量分
      const faceQualityValue = facequality.value ?? 0;
      
      // 拼提示词
      const prompt = `喵喵～检测到一位${genderCn}，大约${age.value}岁，颜值评分${score.toFixed(
        1
      )}分！Ta正${smileValue > 50 ? "笑得灿烂" : "表情平静"}，脸部质量分${faceQualityValue.toFixed(
        2
      )}，模糊度${blurLevel.toFixed(2)}，情绪主要是${emotionDesc}。头部朝向 yaw:${yaw.toFixed(
        1
      )}，pitch:${pitch.toFixed(1)}，roll:${roll.toFixed(1)}。${skinStatusDesc}。${eyeStatusDesc}，${mouthStatusDesc}，${ethnicityDesc}，${eyeGazeDesc}。请用20～50字写一段有趣的中文颜值点评，语言要俏皮、接地气，既能夸得人心花怒放，也能调侃得人忍俊不禁。不许搬数字，要用风趣、形象的词汇来形容颜值，比如“自带美颜Buff”、“长在我笑点上”、“帅得像Bug一样难复现”，要让人一看就嘴角上扬，想转发给朋友笑一笑！`;
      
      log(`🎨 [DEBUG] 生成点评 prompt: ${prompt}`);

      const ai = context.env.AI;
      const aiRes = await ai.run("@cf/meta/llama-3-8b-instruct", {
        messages: [{ role: "user", content: prompt }],
      });

      log(`✨ [DEBUG] AI 返回结果: ${JSON.stringify(aiRes)}`);

      let comment = "颜值点评生成失败了喵～";

      if (aiRes) {
        if (Array.isArray(aiRes.choices) && aiRes.choices.length > 0 && aiRes.choices[0].message && aiRes.choices[0].message.content) {
          comment = aiRes.choices[0].message.content;
        } else if (typeof aiRes.response === "string") {
          comment = aiRes.response;
        }
      }

      return new Response(JSON.stringify({ score, comment, logs: debug ? logs : undefined }), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      log("⚠️ [WARN] 没有检测到人脸");
      return new Response(JSON.stringify({ error: "没有检测到人脸喵～", logs: debug ? logs : undefined }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

  } catch (e) {
    log(`❌ [ERROR] Face++ 调用异常: ${e.message}`);
    return new Response(JSON.stringify({ error: "Face++ 调用失败喵～", detail: e.message, logs: debug ? logs : undefined }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
