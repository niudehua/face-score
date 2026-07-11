// 导入模块
import { calculateImageId, uploadImage, getImageUrl } from '../lib/storage.js';
import { insertOrUpdateScore } from '../lib/db.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { rateLimit } from '../lib/rate-limit.js';
import { createSuccessResponse, createErrorResponse, handleOptionsRequest } from '../lib/response.js';
import { createLogger } from '../lib/logger.js';
import { validateBase64Image } from '../lib/validator.js';
import { RATE_LIMIT_CONFIG, HTTP_STATUS } from '../lib/constants.js';
import { getTemperamentPrompt, formatPrompt } from '../lib/prompts.js';

export async function onRequestOptions(context) {
  return handleOptionsRequest();
}

export async function onRequestPost(context) {
  const { FACEPP_KEY, FACEPP_SECRET, TURNSTILE_SECRET_KEY } = context.env;
  const hasTurnstileSecret = typeof TURNSTILE_SECRET_KEY === 'string' && TURNSTILE_SECRET_KEY.trim().length > 0;
  const logger = createLogger('fortune-api');
  const debug = false;

  try {
    // 检查必需的环境变量
    if (!FACEPP_KEY || !FACEPP_SECRET) {
      logger.error('Face++ API密钥未配置');
      return createErrorResponse('服务器配置错误', { status: HTTP_STATUS.INTERNAL_SERVER_ERROR });
    }

    // 1. 实施限流 (复用SCORE的限流规则，或者新建)
    const rateLimitResult = await rateLimit(context.request, context, {
      path: '/api/fortune',
      ...RATE_LIMIT_CONFIG.SCORE // 复用评分接口的限流阈值
    });

    if (rateLimitResult.limited) {
      return rateLimitResult.response;
    }

    const AI_MODEL_ID = context.env.AI_MODEL_ID || "@cf/meta/llama-3-8b-instruct";

    // 2. 解析请求
    let body;
    try {
      body = await context.request.json();
    } catch (err) {
      return createErrorResponse('请求体格式错误', { status: HTTP_STATUS.BAD_REQUEST });
    }

    const { image: imageBase64, debug: requestDebug = false } = body;
    const isDebugMode = requestDebug;

    // 3. 验证图片
    if (!imageBase64) {
      return createErrorResponse('缺少 image 字段', { status: HTTP_STATUS.BAD_REQUEST });
    }
    const imageValidation = validateBase64Image(imageBase64);
    if (!imageValidation.valid) {
      return createErrorResponse(imageValidation.error || '图片格式无效', { status: HTTP_STATUS.BAD_REQUEST });
    }

    // 4. Turnstile 验证 (逻辑同 score.js)
    let isMiniProgram = false;
    if (body.app_type === 'miniprogram' || context.request.headers.get('X-App-Type') === 'miniprogram') {
      isMiniProgram = true;
    }

    if (hasTurnstileSecret && !isMiniProgram) {
      const turnstileToken = body.turnstile_response;

      const isVerified = await verifyTurnstile(turnstileToken, TURNSTILE_SECRET_KEY);

      if (!isVerified) {
        return createErrorResponse('验证失败，请检查您的请求', { status: HTTP_STATUS.FORBIDDEN });
      }
    } else {
      // logger.debug(`跳过 Turnstile 验证: hasSecret=${hasTurnstileSecret}, isMiniProgram=${isMiniProgram}`);
    }

    // 5. 调用 Face++
    const formData = new FormData();
    formData.append("api_key", FACEPP_KEY);
    formData.append("api_secret", FACEPP_SECRET);
    formData.append("image_base64", imageBase64);
    // 请求相同的属性用于分析
    formData.append("return_attributes", "age,gender,smiling,headpose,facequality,eyestatus,emotion,ethnicity,beauty,skinstatus");

    const resp = await fetch("https://api-us.faceplusplus.com/facepp/v3/detect", {
      method: "POST",
      body: formData,
    });

    const result = await resp.json();

    if (!resp.ok) {
      logger.error('Face++ 接口响应错误', result);
      return createErrorResponse(result.error_message || "Face++ 接口响应错误", { status: HTTP_STATUS.INTERNAL_SERVER_ERROR });
    }

    if (result.faces && result.faces.length > 0) {
      const face = result.faces[0];
      const {
        gender,
        age,
        smile,
        facequality,
        eyestatus,
        emotion,
        skinstatus,
        beauty,
      } = face.attributes;

      // --- 美学特征映射开始 ---

      const genderText = gender.value === "Male" ? "男施主" : "女施主";

      // 气色 (Skin Status)
      const healthScore = skinstatus.health || 50;
      let qiSe = "气色一般";
      if (healthScore > 80) qiSe = "红光满面，气色极佳";
      else if (healthScore > 60) qiSe = "面色红润";
      else qiSe = "略显疲态，需注意休息";

      // 眼神 (Eye Status) - 睁眼程度代表精气神
      const leftEyeOpen = (100 - (eyestatus.left_eye_status.no_glass_eye_close || 0)).toFixed(1);
      const rightEyeOpen = (100 - (eyestatus.right_eye_status.no_glass_eye_close || 0)).toFixed(1);
      let eyeSpirit = "眼神柔和";
      if (parseFloat(leftEyeOpen) > 90) eyeSpirit = "目光如炬，炯炯有神";

      // 笑容 (Smile) - 人缘
      const smileValue = smile.value || 0;
      let socialLuck = "人缘平稳";
      if (smileValue > 80) socialLuck = "笑口常开，桃花运旺盛";
      else if (smileValue > 50) socialLuck = "面带善意，贵人运佳";
      else socialLuck = "神情庄重，不怒自威";

      // 情绪 (Emotion)
      const specificEmotion = Object.entries(emotion).sort((a, b) => b[1] - a[1])[0][0]; // 取概率最高的情绪

      // 构建提示词
      const promptTemplate = getTemperamentPrompt(context.env);
      const prompt = formatPrompt(promptTemplate, {
        gender: genderText,
        age: age.value,
        healthScore: healthScore.toFixed(1),
        qiSe: qiSe,
        eyeSpirit: eyeSpirit,
        specificEmotion: specificEmotion,
        smileValue: smileValue.toFixed(1),
        socialLuck: socialLuck,
        beautyScore: beauty.gender === 'Male' ? beauty.male_score : beauty.female_score
      });

      let fortuneReport = "分析师正在生成报告，请稍后再试...";

      try {
        const ai = context.env.AI;
        if (ai) {
          const aiRes = await ai.run(AI_MODEL_ID, {
            messages: [{ role: "user", content: prompt }],
          });
          if (aiRes && aiRes.choices && aiRes.choices[0].message) {
            fortuneReport = aiRes.choices[0].message.content.trim();
          } else if (aiRes && aiRes.response) {
            fortuneReport = aiRes.response.trim();
          }
        }
      } catch (e) {
        logger.error('AI 调用失败', e);
      }

      let storedKey = null;
      let imageUrl = null;
      const d1 = context.env.FACE_SCORE_DB;
      const r2 = context.env.FACE_IMAGES;

      if (r2) {
        logger.debug('R2已绑定，准备存储图片');
        try {
          const imageId = await calculateImageId(imageBase64);
          const id = `face_${imageId}`;
          logger.debug(`图片ID生成: ${imageId}`);

          const r2Key = await uploadImage(r2, imageBase64, imageId);
          imageUrl = getImageUrl(imageId);
          logger.debug(`图片已成功上传到R2: ${r2Key}`);

          if (isDebugMode) {
            const imageSize = new Blob([atob(imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64)]).size;
            logger.debug('图片存储详情', { imageId, size: `${(imageSize / 1024).toFixed(2)}KB`, r2Key });
          }

          const timestamp = new Date().toISOString();
          const scoreData = {
            id,
            score: parseFloat(beauty.gender === 'Male' ? beauty.male_score : beauty.female_score),
            comment: `【气质分析】${fortuneReport}`,
            gender: genderText === '男施主' ? '帅气小哥哥' : '漂亮小姐姐',
            age: age.value,
            timestamp,
            image_url: imageUrl,
            md5: imageId
          };

          if (d1) {
            logger.debug('D1已绑定，准备存储元数据');
            try {
              const d1Result = await insertOrUpdateScore(d1, scoreData);
              storedKey = scoreData.id;
              logger.debug('数据已成功存储到D1', { id: scoreData.id, changes: d1Result.changes || 0 });
            } catch (d1Error) {
              if (d1Error.message.includes('duration')) {
                logger.warn('遇到Cloudflare内部D1错误（duration），这是本地开发环境bug');
              } else if (d1Error.message.includes('no such table')) {
                logger.warn('表不存在，可能创建失败', { error: d1Error.message });
              } else {
                logger.error('D1存储错误', d1Error);
              }
            }
          } else {
            logger.warn('D1未绑定，跳过元数据存储');
          }
        } catch (storageError) {
          logger.error('存储错误', storageError);
        }
      } else {
        logger.warn('R2未绑定，跳过图片存储');
        if (d1) logger.warn('由于R2未绑定，跳过D1存储');
      }

      return createSuccessResponse({
        type: 'fortune',
        title: '气质分析报告',
        comment: fortuneReport,
        image_url: imageUrl,
        key: storedKey,
        traits: {
          gender: genderText,
          age: age.value,
          health_score: healthScore
        }
      }, {
        rateLimitInfo: rateLimitResult,
        logs: isDebugMode ? logger.getLogs() : undefined,
        debug: isDebugMode
      });

    } else {
      return createErrorResponse('未检测到人脸，请上传清晰的面部照片', { status: HTTP_STATUS.BAD_REQUEST });
    }

  } catch (e) {
    logger.error('Fortune API error', e);
    return createErrorResponse('天机不可泄露（服务器出错了）', { status: HTTP_STATUS.INTERNAL_SERVER_ERROR });
  }
}
