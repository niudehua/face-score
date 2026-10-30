import { validateBase64Image } from '../validator.js';
import { checkImageSecurity } from '../wechat-security.js';
import { DEFAULT_FACEPP_API_URL } from '../constants.js';
import { McpError, readLimited } from './http.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const fileSchema = {
  type: 'object', properties: {
    download_url: { type: 'string', description: 'ChatGPT 为用户明确选择的照片提供的 HTTPS 临时下载地址；不要猜测地址。', maxLength: 8192 },
    file_id: { type: 'string', maxLength: 512 }, mime_type: { type: 'string' }, file_name: { type: 'string' }
  }, required: ['download_url', 'file_id'], additionalProperties: false
};
const resultSchema = { type: 'object', properties: {
  analysis_type: { type: 'string' }, people: { type: 'array', items: { type: 'object' } },
  interpretation_guidance: { type: 'string' }, privacy: { type: 'object' }
}, required: ['analysis_type', 'people', 'interpretation_guidance', 'privacy'], additionalProperties: false };
const securitySchemes = [{ type: 'oauth2', scopes: ['face:analyze'] }];
function descriptor(name, title, description, count) {
  return {
    name, title, description: description + ' 仅在用户明确要求且已授权发送照片给 Face++ 时使用。只接收用户主动选择的图片；每张最多 2 MiB，支持 JPEG/PNG。结果不含 AI 文案，由 ChatGPT 生成简体中文娱乐解读。',
    inputSchema: { type: 'object', properties: { photos: { type: 'array', items: fileSchema, minItems: count, maxItems: count } }, required: ['photos'], additionalProperties: false },
    outputSchema: resultSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    securitySchemes, _meta: { securitySchemes, 'openai/fileParams': ['photos'] }
  };
}
export const tools = [
  descriptor('analyze_face', '照片趣味颜值分析', '检测一张照片中的人脸属性和第三方娱乐颜值分，不识别身份。', 1),
  descriptor('analyze_temperament', '照片气质印象分析', '检测一张照片的表情和拍摄状态，供描述照片印象。不能用于推断人格、健康、族裔或运势。', 1),
  descriptor('analyze_couple', '双人合照氛围分析', '分别检测两张各含一张人脸的照片，供比较表情氛围；不测量真实恋爱关系或相容性，不预设两人是情侣。', 2)
];
function permittedUrl(raw, env) {
  let url;
  try { url = new URL(raw); } catch { throw new McpError('图片下载地址无效，请重新选择照片'); }
  const hosts = (env.MCP_FILE_HOSTS || 'files.oaiusercontent.com,files.openai.com').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') ||
      !hosts.includes(url.hostname.toLowerCase()) || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') || url.hostname.endsWith('.internal') ||
      /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) throw new McpError(`图片下载域名未被允许（${url.hostname.slice(0, 255)}），请让管理员核对 MCP_FILE_HOSTS；不要提供内网或任意图片 URL`);
  return url;
}
function validFile(file) {
  return file && typeof file === 'object' && !Array.isArray(file) &&
    Object.keys(file).every(k => ['download_url', 'file_id', 'mime_type', 'file_name'].includes(k)) &&
    typeof file.download_url === 'string' && file.download_url.length <= 8192 && typeof file.file_id === 'string' && file.file_id.length > 0 && file.file_id.length <= 512 &&
    ['mime_type', 'file_name'].every(k => file[k] === undefined || typeof file[k] === 'string');
}
async function download(file, env) {
  if (file.mime_type && !['image/jpeg', 'image/png'].includes(file.mime_type)) throw new McpError('请提供 JPEG 或 PNG 照片');
  const url = permittedUrl(file.download_url, env);
  let response;
  try { response = await fetch(url.href, { redirect: 'error', signal: AbortSignal.timeout(15000) }); }
  catch { throw new McpError('照片下载失败或发生重定向，请重新上传照片获取新链接', 502); }
  if (!response.ok) { await response.body?.cancel(); throw new McpError('照片链接已失效或下载失败，请重新上传照片', 502); }
  const length = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > MAX_IMAGE_BYTES) { await response.body?.cancel(); throw new McpError('照片超过 2 MiB，请压缩后重新上传', 413); }
  const bytes = await readLimited(response.body, MAX_IMAGE_BYTES);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const base64 = btoa(binary), validation = validateBase64Image(base64);
  if (!validation.valid || !['image/jpeg', 'image/png'].includes(validation.contentType)) throw new McpError('文件不是受支持的 JPEG/PNG 照片');
  return base64;
}
async function safety(image, env) {
  const secret = env.WECHAT_APPSECRET || env.WECHAT_PRIVATE_KEY;
  if (env.REQUIRE_IMAGE_SECURITY === 'true' || (env.WECHAT_APPID && secret)) {
    if (!env.WECHAT_APPID || !secret) throw new McpError('内容安全服务未配置', 503);
    let result;
    try { result = await checkImageSecurity(image, env.WECHAT_APPID, secret); }
    catch { throw new McpError('图片内容检查暂时不可用，请稍后重试', 503); }
    if (!result.safe) throw new McpError('图片未通过内容安全检查', 403);
  }
}
const numeric = value => Number.isFinite(value) ? value : null;
const numbers = object => Object.fromEntries(Object.entries(object && typeof object === 'object' ? object : {}).filter(([, value]) => Number.isFinite(value)));
async function detect(image, env) {
  if (!env.FACEPP_KEY || !env.FACEPP_SECRET) throw new McpError('Face++ 服务未配置', 503);
  const form = new FormData();
  form.set('api_key', env.FACEPP_KEY); form.set('api_secret', env.FACEPP_SECRET); form.set('image_base64', image);
  form.set('return_attributes', 'age,gender,smiling,headpose,facequality,blur,eyestatus,emotion,beauty,skinstatus');
  let response, result;
  try {
    response = await fetch(env.FACEPP_API_URL || DEFAULT_FACEPP_API_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) });
    result = await response.json();
  } catch { throw new McpError('人脸检测服务暂时不可用', 502); }
  if (!response.ok || result.error_message) throw new McpError('人脸检测失败，请稍后重试或检查 Face++ 配额', 502);
  if (!Array.isArray(result.faces) || result.faces.length === 0) throw new McpError('没有检测到人脸，请换一张清晰照片');
  if (result.faces.length !== 1) throw new McpError('每张照片需要仅包含一张人脸，请裁剪后重试');
  const a = result.faces[0].attributes;
  if (!a || !Number.isFinite(a.beauty?.male_score) || !Number.isFinite(a.beauty?.female_score)) throw new McpError('人脸服务未返回完整属性，请重试', 502);
  const score = a.gender?.value === 'Male' ? a.beauty.male_score : a.gender?.value === 'Female' ? a.beauty.female_score : null;
  return {
    beauty_score: numeric(score), estimated_age: numeric(a.age?.value),
    smile_intensity: numeric(a.smile?.value ?? a.smiling?.value), expression_estimates: numbers(a.emotion),
    pose_degrees: numbers(a.headpose), face_quality: numeric(a.facequality?.value), blur: numeric(a.blur?.blurness?.value),
    eye_state_estimates: { left: numbers(a.eyestatus?.left_eye_status), right: numbers(a.eyestatus?.right_eye_status) },
    skin_algorithm_estimates: numbers(a.skinstatus)
  };
}
export async function analyze(name, args, env) {
  const definition = tools.find(t => t.name === name);
  if (!definition) throw new McpError('未知分析工具');
  const count = definition.inputSchema.properties.photos.minItems;
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => k !== 'photos') ||
      !Array.isArray(args.photos) || args.photos.length !== count || !args.photos.every(validFile)) throw new McpError(`请通过 photos 传入 ${count} 张 ChatGPT 文件对象`);
  // Validate all destinations before any request, then check all images before Face++.
  for (const photo of args.photos) permittedUrl(photo.download_url, env);
  const images = [];
  for (const photo of args.photos) { const image = await download(photo, env); await safety(image, env); images.push(image); }
  const people = [];
  for (const image of images) people.push(await detect(image, env));
  return {
    analysis_type: name, people,
    interpretation_guidance: name === 'analyze_couple'
      ? '用中文描述两张照片表情的呼应或反差，给一条合照建议。未测量恋爱契合度，不从年龄、颜值或性别推断真实关系、人格或相容性；不预设情侣身份。明确仅供娱乐。'
      : name === 'analyze_temperament'
        ? '用中文生成约百字照片印象与拍摄建议，只依据可靠表情和拍摄状态，不推断人格、健康、运势或社交能力；缺失值为 null，不代表零分。皮肤指标不是医学结论。'
        : '用中文生成二十五至五十字友好的娱乐点评，不复述分数，不编造五官、穿搭，不把算法分数当作人的价值。需要展示分数时标注第三方娱乐参考。',
    privacy: { photos_stored: false, analysis_records_stored: false, workers_ai_called: false, processor: 'Face++', safety_processor: (env.REQUIRE_IMAGE_SECURITY === 'true' || (env.WECHAT_APPID && (env.WECHAT_APPSECRET || env.WECHAT_PRIVATE_KEY))) ? 'WeChat' : null }
  };
}
