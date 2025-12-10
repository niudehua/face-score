export async function onRequestPost(context) {
  const { FACEPP_KEY, FACEPP_SECRET } = context.env;
  const logs = [];

  function log(msg) {
    logs.push(msg);
    console.log(msg);  // 这里打印到 Workers 控制台
  }

  // 计算字符串的SHA-256哈希值（用于生成唯一ID）
  async function calculateSHA256(data) {
    // 将字符串转换为ArrayBuffer
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    // 计算SHA-256哈希（Cloudflare Workers环境下使用Crypto API）
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

    // 将ArrayBuffer转换为十六进制字符串
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 返回完整的SHA-256哈希值
    return hashHex;
  }

  // 计算图片的唯一标识符（使用SHA-256的前32位）
  async function calculateImageId(imageBase64) {
    // 先将base64转换为二进制数据，再计算哈希
    const binaryString = atob(imageBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // 计算二进制数据的SHA-256哈希
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // 返回前32个字符作为图片ID
    return hashHex.substring(0, 32);
  }

  // 上传图片到 R2
  async function uploadImageToR2(r2Bucket, imageBase64, md5) {
    try {
      // 将 Base64 转换为二进制数据
      const binaryString = atob(imageBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 上传到 R2，使用 MD5 作为文件名
      const key = `images/${md5}.jpg`;
      await r2Bucket.put(key, bytes, {
        httpMetadata: {
          contentType: 'image/jpeg',
        },
      });

      return key;
    } catch (error) {
      throw new Error(`R2上传失败: ${error.message}`);
    }
  }

  // 压缩图片（在Cloudflare Workers环境中模拟压缩）
  function compressImage(imageBase64, maxWidth = 300, maxHeight = 300) {
    // 在Serverless环境中，我们简化压缩逻辑
    // 1. 检查图片大小，如果已经很小则不压缩
    const imageSize = new Blob([atob(imageBase64)]).size;
    if (imageSize < 50 * 1024) { // 如果小于50KB，认为不需要压缩
      return imageBase64;
    }

    // 2. 对于较大的图片，我们可以通过降低Base64编码的质量来模拟压缩
    // 这里简单地保留原始图片但添加注释，表示在客户端应该进行实际压缩
    log(`[DEBUG] 图片大小: ${(imageSize / 1024).toFixed(2)}KB，建议在客户端进行压缩`);

    // 在实际应用中，理想的做法是在客户端使用Canvas进行图片压缩后再上传
    return imageBase64;
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

      // 初始化 D1 数据库（如果不存在则创建表）
      async function initDatabase(d1) {
        try {
          await d1.exec(`
            CREATE TABLE IF NOT EXISTS face_scores (
              id TEXT PRIMARY KEY,
              score REAL NOT NULL,
              comment TEXT NOT NULL,
              gender TEXT NOT NULL,
              age INTEGER NOT NULL,
              timestamp TEXT NOT NULL,
              image_url TEXT NOT NULL,
              md5 TEXT UNIQUE NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE INDEX IF NOT EXISTS idx_face_scores_md5 ON face_scores(md5);
            CREATE INDEX IF NOT EXISTS idx_face_scores_timestamp ON face_scores(timestamp);
            CREATE INDEX IF NOT EXISTS idx_face_scores_created_at ON face_scores(created_at);
          `);
          log(`✅ [DEBUG] D1数据库初始化完成`);
        } catch (err) {
          log(`❌ [ERROR] D1数据库初始化失败: ${err.message}`);
          throw err;
        }
      }

      // 存储数据到 R2 和 D1
      let storedKey = null;
      let imageUrl = null;
      const d1 = context.env.FACE_SCORE_DB;
      const r2 = context.env.FACE_IMAGES;

      if (d1 && r2) {
        log(`✅ [DEBUG] D1和R2已绑定，准备存储数据`);
        try {
          // 初始化数据库
          await initDatabase(d1);
          log(`✅ [DEBUG] 数据库初始化完成`);
          
          // 计算图片的唯一标识符作为主键
          const imageId = await calculateImageId(imageBase64);
          const id = `face_${imageId}`;
          log(`✅ [DEBUG] 图片ID生成: ${imageId}`);

          // 上传图片到 R2
          const r2Key = await uploadImageToR2(r2, imageBase64, imageId);
          imageUrl = `/api/image?md5=${imageId}`;  // 使用API路径
          log(`✅ [DEBUG] 图片已上传到R2: ${r2Key}`);

          if (debug) {
            log(`[DEBUG] 图片ID: ${imageId}`);
            log(`[DEBUG] 原始图片大小: ${(new Blob([atob(imageBase64)]).size / 1024).toFixed(2)}KB`);
            log(`[DEBUG] R2存储路径: ${r2Key}`);
          }

          const timestamp = new Date().toISOString();
          
          // 准备插入/更新数据
          const scoreData = {
            id,
            score,
            comment,
            gender: genderCn,
            age: age.value,
            timestamp,
            image_url: imageUrl,
            md5: imageId
          };
          log(`📋 [DEBUG] 准备存储数据: ${JSON.stringify(scoreData, null, 2)}`);

          // 使用D1插入或更新记录
          const query = `
            INSERT INTO face_scores (id, score, comment, gender, age, timestamp, image_url, md5)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(md5) DO UPDATE SET
              score = excluded.score,
              comment = excluded.comment,
              gender = excluded.gender,
              age = excluded.age,
              timestamp = excluded.timestamp,
              image_url = excluded.image_url,
              created_at = CURRENT_TIMESTAMP
          `;
          
          const d1Result = await d1.prepare(query)
            .bind(
              scoreData.id,
              scoreData.score,
              scoreData.comment,
              scoreData.gender,
              scoreData.age,
              scoreData.timestamp,
              scoreData.image_url,
              scoreData.md5
            )
            .run();
            
          storedKey = scoreData.id;
          log(`✅ [DEBUG] 数据已成功存储到D1 - ID: ${scoreData.id}, 影响行数: ${d1Result.changes || 0}`);
          log(`✅ [DEBUG] 完整存储路径 - R2: ${r2Key}, D1: ${scoreData.id}`);
        } catch (storageError) {
          log(`❌ [ERROR] 存储错误: ${storageError.message}`);
          log(`❌ [ERROR] 错误堆栈: ${storageError.stack || '无堆栈信息'}`);
          // 即使存储失败也继续执行，返回评分结果
        }
      } else {
        if (!d1) log(`⚠️ [WARN] D1未绑定，跳过元数据存储 - 请检查FACE_SCORE_DB绑定`);
        if (!r2) log(`⚠️ [WARN] R2未绑定，跳过图片存储 - 请检查FACE_IMAGES绑定`);
      }

      return new Response(JSON.stringify({
        score,
        comment,
        logs: debug ? logs : undefined,
        key: storedKey,
        image_url: imageUrl
      }), {
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
