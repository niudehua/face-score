// 导入模块
import { calculateImageId, uploadImage, getImageUrl } from '../lib/storage.js';
import { insertOrUpdateScore } from '../lib/db.js';
import { verifyTurnstile, extractTurnstileToken } from '../lib/turnstile.js';
import { rateLimit } from '../lib/rate-limit.js';
import { createSuccessResponse, createErrorResponse } from '../lib/response.js';
import { createLogger } from '../lib/logger.js';
import { validateBase64Image } from '../lib/validator.js';
import { RATE_LIMIT_CONFIG, HTTP_STATUS } from '../lib/constants.js';

export async function onRequestPost(context) {
  const { FACEPP_KEY, FACEPP_SECRET, TURNSTILE_SECRET_KEY } = context.env;
  // 将空字符串视为未配置，方便本地跳过
  const hasTurnstileSecret = typeof TURNSTILE_SECRET_KEY === 'string' && TURNSTILE_SECRET_KEY.trim().length > 0;
  const logger = createLogger('score-api');
  const debug = false; // 从请求参数中获取

  try {
    // 检查必需的环境变量
    if (!FACEPP_KEY || !FACEPP_SECRET) {
      logger.error('Face++ API密钥未配置');
      return createErrorResponse('服务器配置错误，请联系管理员', {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        debug
      });
    }

    // 1. 实施限流
    const rateLimitResult = await rateLimit(context.request, context, {
      path: '/api/score',
      ...RATE_LIMIT_CONFIG.SCORE
    });

    if (rateLimitResult.limited) {
      logger.warn('请求被限流', { ip: context.request.headers.get('CF-Connecting-IP') });
      return rateLimitResult.response;
    }

    // 获取AI模型ID，支持通过环境变量配置
    const AI_MODEL_ID = context.env.AI_MODEL_ID || "@cf/meta/llama-3-8b-instruct";
    logger.debug(`使用AI模型: ${AI_MODEL_ID}`);

    // 2. 解析请求体
    let body;
    try {
      body = await context.request.json();
    } catch (err) {
      logger.error('解析请求体失败', err);
      return createErrorResponse('请求体格式错误', {
        status: HTTP_STATUS.BAD_REQUEST,
        rateLimitInfo: rateLimitResult,
        logs: debug ? logger.getLogs() : undefined,
        debug
      });
    }

    const { image: imageBase64, debug: requestDebug = false } = body;
    const isDebugMode = requestDebug;

    // 3. 验证图片数据
    if (!imageBase64) {
      logger.warn('缺少图片数据');
      return createErrorResponse('缺少 image 字段', {
        status: HTTP_STATUS.BAD_REQUEST,
        rateLimitInfo: rateLimitResult,
        logs: isDebugMode ? logger.getLogs() : undefined,
        debug: isDebugMode
      });
    }

    const imageValidation = validateBase64Image(imageBase64);
    if (!imageValidation.valid) {
      logger.warn('图片验证失败', { error: imageValidation.error });
      return createErrorResponse(imageValidation.error || '图片格式无效', {
        status: HTTP_STATUS.BAD_REQUEST,
        rateLimitInfo: rateLimitResult,
        logs: isDebugMode ? logger.getLogs() : undefined,
        debug: isDebugMode
      });
    }

    // 4. Turnstile 验证（小程序请求跳过）
    let isMiniProgram = false;
    
    // 检查请求是否来自小程序
    if (body.app_type === 'miniprogram' || context.request.headers.get('X-App-Type') === 'miniprogram') {
      isMiniProgram = true;
      logger.debug('检测到小程序请求，跳过 Turnstile 验证');
    }
    
    if (hasTurnstileSecret && !isMiniProgram) {
      // 从请求体中直接获取令牌，避免重复读取请求体
      const turnstileToken = body.turnstile_response;
      const isVerified = await verifyTurnstile(turnstileToken, TURNSTILE_SECRET_KEY);
      
      if (!isVerified) {
        logger.warn('Turnstile 验证失败');
        return createErrorResponse('验证失败，请检查您的请求', {
          status: HTTP_STATUS.FORBIDDEN,
          rateLimitInfo: rateLimitResult,
          logs: isDebugMode ? logger.getLogs() : undefined,
          debug: isDebugMode
        });
      }
      
      logger.debug('Turnstile 验证成功');
    } else if (!isMiniProgram) {
      logger.debug('Turnstile 密钥未配置，跳过验证');
    }

    const formData = new FormData();
    formData.append("api_key", FACEPP_KEY);
    formData.append("api_secret", FACEPP_SECRET);
    formData.append("image_base64", imageBase64);
    formData.append("return_attributes", "age,gender,smiling,headpose,facequality,blur,eyestatus,emotion,ethnicity,beauty,mouthstatus,eyegaze,skinstatus");

    logger.debug('正在请求 Face++ 接口');
    const resp = await fetch("https://api-us.faceplusplus.com/facepp/v3/detect", {
      method: "POST",
      body: formData,
    });

    logger.debug(`Face++ 返回状态码: ${resp.status}`);
    const result = await resp.json();

    if (!resp.ok) {
      logger.error('Face++ 接口响应错误', { status: resp.status, error: result.error_message });
      return createErrorResponse(
        result.error_message || "Face++ 接口响应错误",
        {
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
          rateLimitInfo: rateLimitResult,
          logs: isDebugMode ? logger.getLogs() : undefined,
          debug: isDebugMode
        }
      );
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

      logger.debug('生成AI点评提示词');

      let comment = "颜值点评生成失败";
      
      try {
        const ai = context.env.AI;
        if (ai && typeof ai.run === "function") {
          const aiRes = await ai.run(AI_MODEL_ID, {
            messages: [{ role: "user", content: prompt }],
          });
          
          if (aiRes) {
            if (Array.isArray(aiRes.choices) && aiRes.choices.length > 0 && aiRes.choices[0].message && aiRes.choices[0].message.content) {
              comment = aiRes.choices[0].message.content.trim();
            } else if (typeof aiRes.response === "string") {
              comment = aiRes.response.trim();
            }
          }
        } else {
          logger.warn('AI服务未配置或不可用，使用默认评论');
          comment = `哇，颜值评分${score.toFixed(1)}分，太厉害了！`;
        }
      } catch (aiError) {
        logger.error('AI调用失败', aiError);
        comment = `哇，颜值评分${score.toFixed(1)}分，太厉害了！`;
      }

      // 存储数据到 R2 和 D1
      let storedKey = null;
      let imageUrl = null;
      const d1 = context.env.FACE_SCORE_DB;
      const r2 = context.env.FACE_IMAGES;

      if (r2) {
        logger.debug('R2已绑定，准备存储图片');
        try {
          // 计算图片的唯一标识符作为主键
          const imageId = await calculateImageId(imageBase64);
          const id = `face_${imageId}`;
          logger.debug(`图片ID生成: ${imageId}`);

          // 上传图片到 R2
          const r2Key = await uploadImage(r2, imageBase64, imageId);
          imageUrl = getImageUrl(imageId);  // 使用API路径
          logger.debug(`图片已成功上传到R2: ${r2Key}`);

          if (isDebugMode) {
            const imageSize = new Blob([atob(imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64)]).size;
            logger.debug('图片存储详情', { imageId, size: `${(imageSize / 1024).toFixed(2)}KB`, r2Key });
          }

          // 准备插入/更新数据
          const timestamp = new Date().toISOString();
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

          // 尝试存储到D1数据库（可选）
          if (d1) {
            logger.debug('D1已绑定，准备存储元数据');
            try {
              const d1Result = await insertOrUpdateScore(d1, scoreData);
              storedKey = scoreData.id;
              logger.debug('数据已成功存储到D1', { id: scoreData.id, changes: d1Result.changes || 0 });
            } catch (d1Error) {
              // 检查是否为Cloudflare内部的duration错误
              if (d1Error.message.includes('duration')) {
                logger.warn('遇到Cloudflare内部D1错误（duration），这是本地开发环境bug');
              } else if (d1Error.message.includes('no such table')) {
                logger.warn('表不存在，可能创建失败', { error: d1Error.message });
              } else {
                logger.error('D1存储错误', d1Error);
              }
              // 即使D1存储失败，R2存储已经成功，继续执行
            }
          } else {
            logger.warn('D1未绑定，跳过元数据存储');
          }
        } catch (storageError) {
          logger.error('存储错误', storageError);
          // 即使存储失败也继续执行，返回评分结果
        }
      } else {
        logger.warn('R2未绑定，跳过图片存储');
        if (d1) logger.warn('由于R2未绑定，跳过D1存储');
      }

      return createSuccessResponse({
        score,
        comment,
        key: storedKey,
        image_url: imageUrl
      }, {
        rateLimitInfo: rateLimitResult,
        logs: isDebugMode ? logger.getLogs() : undefined,
        debug: isDebugMode
      });
    } else {
      logger.warn('没有检测到人脸');
      return createErrorResponse('没有检测到人脸喵～', {
        status: HTTP_STATUS.BAD_REQUEST,
        rateLimitInfo: rateLimitResult,
        logs: isDebugMode ? logger.getLogs() : undefined,
        debug: isDebugMode
      });
    }

  } catch (e) {
    logger.error('Face++ 调用异常', e);
    return createErrorResponse('Face++ 调用失败喵～', {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      rateLimitInfo: null, // 错误情况下不返回限流信息
      logs: debug ? logger.getLogs() : undefined,
      debug
    });
  }
}