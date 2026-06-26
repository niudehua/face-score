import { calculateImageId, uploadImage, getImageUrl } from '../lib/storage.js';
import { insertOrUpdateCoupleMatch } from '../lib/db.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { rateLimit } from '../lib/rate-limit.js';
import { createSuccessResponse, createErrorResponse, handleOptionsRequest } from '../lib/response.js';
import { createLogger } from '../lib/logger.js';
import { validateBase64Image } from '../lib/validator.js';
import { RATE_LIMIT_CONFIG, HTTP_STATUS, DEFAULT_FACEPP_API_URL } from '../lib/constants.js';
import { getCouplePrompt, formatPrompt } from '../lib/prompts.js';

export async function onRequestOptions(context) {
  return handleOptionsRequest();
}

export async function onRequestPost(context) {
  const { FACEPP_KEY, FACEPP_SECRET, TURNSTILE_SECRET_KEY, FACE_SCORE_DB } = context.env;
  const hasTurnstileSecret = typeof TURNSTILE_SECRET_KEY === 'string' && TURNSTILE_SECRET_KEY.trim().length > 0;
  const logger = createLogger('couple-api');

  try {
    if (!FACEPP_KEY || !FACEPP_SECRET) {
      logger.error('Face++ API密钥未配置');
      return createErrorResponse('服务器配置错误', { status: HTTP_STATUS.INTERNAL_SERVER_ERROR });
    }

    const rateLimitResult = await rateLimit(context.request, context, {
      path: '/api/couple',
      ...RATE_LIMIT_CONFIG.COUPLE
    });

    if (rateLimitResult.limited) {
      return rateLimitResult.response;
    }

    const AI_MODEL_ID = context.env.AI_MODEL_ID || "@cf/meta/llama-3-8b-instruct";
    const FACEPP_API_URL = context.env.FACEPP_API_URL || DEFAULT_FACEPP_API_URL;
    logger.debug(`使用 Face++ API: ${FACEPP_API_URL}`);

    let body;
    try {
      body = await context.request.json();
    } catch (err) {
      return createErrorResponse('请求体格式错误', { status: HTTP_STATUS.BAD_REQUEST });
    }

    const { imageA: imageBase64A, imageB: imageBase64B, debug: requestDebug = false } = body;
    const isDebugMode = requestDebug;

    if (!imageBase64A || !imageBase64B) {
      return createErrorResponse('缺少 imageA 或 imageB 字段', { status: HTTP_STATUS.BAD_REQUEST });
    }

    const validationA = validateBase64Image(imageBase64A);
    const validationB = validateBase64Image(imageBase64B);
    if (!validationA.valid) {
      return createErrorResponse('图片A格式无效: ' + (validationA.error || '无效图片'), { status: HTTP_STATUS.BAD_REQUEST });
    }
    if (!validationB.valid) {
      return createErrorResponse('图片B格式无效: ' + (validationB.error || '无效图片'), { status: HTTP_STATUS.BAD_REQUEST });
    }

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
    }

    async function analyzeFace(imageBase64) {
      const formData = new FormData();
      formData.append("api_key", FACEPP_KEY);
      formData.append("api_secret", FACEPP_SECRET);
      formData.append("image_base64", imageBase64);
      formData.append("return_attributes", "gender,age,beauty,emotion,skinstatus,eyestatus,mouthstatus,ethnicity,facequality,blur,pose,smile,glass");

      const response = await fetch(FACEPP_API_URL, {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error_message: 'Face++请求失败' }));
        throw new Error(`Face++ API错误: ${errorData.error_message || '未知错误'}`);
      }

      const data = await response.json();
      if (!data.faces || data.faces.length === 0) {
        throw new Error('未检测到人脸');
      }

      return data.faces[0];
    }

    logger.debug('开始分析图片A...');
    let faceA, faceB;
    try {
      faceA = await analyzeFace(imageBase64A);
      logger.debug('图片A分析完成');
      faceB = await analyzeFace(imageBase64B);
      logger.debug('图片B分析完成');
    } catch (error) {
      logger.error('人脸分析失败', error);
      return createErrorResponse(error.message || '人脸检测失败，请确保图片清晰且包含人脸', { status: HTTP_STATUS.BAD_REQUEST });
    }

    const attributesA = faceA.attributes;
    const attributesB = faceB.attributes;

    const genderA = attributesA.gender.value === 'Male' ? '男' : '女';
    const ageA = attributesA.age.value;
    const scoreA = attributesA.beauty.male_score > attributesA.beauty.female_score
      ? attributesA.beauty.male_score
      : attributesA.beauty.female_score;

    const genderB = attributesB.gender.value === 'Male' ? '男' : '女';
    const ageB = attributesB.age.value;
    const scoreB = attributesB.beauty.male_score > attributesB.beauty.female_score
      ? attributesB.beauty.male_score
      : attributesB.beauty.female_score;

    const smileA = attributesA.smile.value;
    const smileB = attributesB.smile.value;
    const emotionA = Object.entries(attributesA.emotion).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    const emotionB = Object.entries(attributesB.emotion).reduce((a, b) => a[1] > b[1] ? a : b)[0];

    let temperamentA = '';
    if (smileA >= 80) temperamentA += '亲和力强 ';
    else if (smileA >= 40) temperamentA += '温和友善 ';
    else temperamentA += '高冷气质 ';

    let temperamentB = '';
    if (smileB >= 80) temperamentB += '亲和力强 ';
    else if (smileB >= 40) temperamentB += '温和友善 ';
    else temperamentB += '高冷气质 ';

    const promptTemplate = getCouplePrompt(context.env);
    const prompt = formatPrompt(promptTemplate, {
      genderA,
      ageA,
      scoreA,
      temperamentA: temperamentA || '自然气质',
      genderB,
      ageB,
      scoreB,
      temperamentB: temperamentB || '自然气质'
    });

    const aiResponse = await context.env.AI.run(AI_MODEL_ID, {
      messages: [{ role: "user", content: prompt }]
    });

    let aiContent = typeof aiResponse === 'object' && aiResponse.response
      ? aiResponse.response
      : typeof aiResponse === 'string'
        ? aiResponse
        : JSON.stringify(aiResponse);

    let matchScore = 0, grade = '', highlights = '', notes = '', tags = '';
    
    const scoreMatch = aiContent.match(/匹配分\s*[：:]\s*(\d+)/);
    if (scoreMatch) matchScore = parseInt(scoreMatch[1]);

    const gradeMatch = aiContent.match(/等级\s*[：:]\s*([^\n]+)/);
    if (gradeMatch) grade = gradeMatch[1].trim();

    const highlightsMatch = aiContent.match(/亮点\s*[：:]\s*([^\n]+)/);
    if (highlightsMatch) highlights = highlightsMatch[1].trim();

    const notesMatch = aiContent.match(/注意\s*[：:]\s*([^\n]+)/);
    if (notesMatch) notes = notesMatch[1].trim();

    const tagsMatch = aiContent.match(/标签\s*[：:]\s*(.+)/);
    if (tagsMatch) tags = tagsMatch[1].trim();

    if (!matchScore || matchScore === 0) {
      matchScore = Math.round((scoreA + scoreB) / 2);
    }
    if (!grade) {
      if (matchScore >= 90) grade = '天作之合';
      else if (matchScore >= 80) grade = '神仙眷侣';
      else if (matchScore >= 70) grade = '欢喜冤家';
      else if (matchScore >= 60) grade = '互补型恋人';
      else if (matchScore >= 50) grade = '相爱相杀';
      else grade = '需要磨合';
    }

    const timestamp = new Date().toISOString();
    const matchId = `${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

    let imageUrlA = '';
    let imageUrlB = '';
    let md5A = '';
    let md5B = '';

    try {
      const imageIdA = await calculateImageId(imageBase64A);
      md5A = imageIdA;
      await uploadImage(context.env.FACE_IMAGES, imageBase64A, imageIdA, timestamp);
      imageUrlA = getImageUrl(context.env.FACE_IMAGES, imageIdA);

      const imageIdB = await calculateImageId(imageBase64B);
      md5B = imageIdB;
      await uploadImage(context.env.FACE_IMAGES, imageBase64B, imageIdB, timestamp);
      imageUrlB = getImageUrl(context.env.FACE_IMAGES, imageIdB);
    } catch (storageError) {
      logger.warn('图片上传失败', storageError);
    }

    if (FACE_SCORE_DB) {
      try {
        await insertOrUpdateCoupleMatch(FACE_SCORE_DB, {
          id: matchId,
          score: matchScore,
          grade,
          highlights,
          notes,
          tags,
          genderA,
          ageA,
          scoreA,
          genderB,
          ageB,
          scoreB,
          timestamp,
          image_url_a: imageUrlA,
          image_url_b: imageUrlB,
          md5_a: md5A,
          md5_b: md5B
        });
      } catch (dbError) {
        logger.warn('数据库保存失败', dbError);
      }
    }

    return createSuccessResponse({
      score: matchScore,
      grade,
      highlights,
      notes,
      tags,
      ai_comment: aiContent,
      type: 'couple',
      personA: {
        gender: genderA,
        age: ageA,
        score: scoreA,
        image_url: imageUrlA
      },
      personB: {
        gender: genderB,
        age: ageB,
        score: scoreB,
        image_url: imageUrlB
      }
    }, { rateLimitInfo: rateLimitResult });

  } catch (error) {
    logger.error('CP契合度分析失败', error);
    return createErrorResponse('分析失败，请稍后重试', { status: HTTP_STATUS.INTERNAL_SERVER_ERROR });
  }
}