import { WECHAT_API_URL } from './constants.js';

let accessToken = null;
let accessTokenExpireTime = 0;

async function getAccessToken(appId, appSecret) {
  const now = Date.now();
  if (accessToken && now < accessTokenExpireTime) {
    return accessToken;
  }

  const response = await fetch(
    `${WECHAT_API_URL.TOKEN}?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`,
    { method: 'GET' }
  );

  const data = await response.json();

  if (data.access_token) {
    accessToken = data.access_token;
    accessTokenExpireTime = now + (data.expires_in - 300) * 1000;
    return accessToken;
  }

  throw new Error(data.errmsg || '获取access_token失败');
}

async function checkImageSecurity(base64Image, appId, appSecret) {
  if (!appId || !appSecret) {
    throw new Error('微信小程序配置未完成');
  }

  const token = await getAccessToken(appId, appSecret);

  const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
  const buffer = Buffer.from(base64Data, 'base64');

  const response = await fetch(
    `${WECHAT_API_URL.IMG_SEC_CHECK}?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: buffer
    }
  );

  const result = await response.json();

  if (result.errcode === 0) {
    return { safe: true, message: '' };
  }

  return { safe: false, message: result.errmsg || '内容安全检查未通过' };
}

async function checkTextSecurity(text, appId, appSecret) {
  if (!appId || !appSecret) {
    throw new Error('微信小程序配置未完成');
  }

  const token = await getAccessToken(appId, appSecret);

  const response = await fetch(
    `${WECHAT_API_URL.MSG_SEC_CHECK}?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content: text })
    }
  );

  const result = await response.json();

  if (result.errcode === 0) {
    return { safe: true, message: '' };
  }

  return { safe: false, message: result.errmsg || '内容安全检查未通过' };
}

export {
  getAccessToken,
  checkImageSecurity,
  checkTextSecurity
};