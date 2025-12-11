// miniprogram-ci 配置文件
// 用于GitHub Actions自动化部署小程序

const path = require('path');

// 从环境变量获取配置
// 敏感信息必须从环境变量获取，不允许有硬编码默认值
const APPID = process.env.APPID;
if (!APPID) {
  console.error('❌ 环境变量 APPID 未配置');
  throw new Error('环境变量 APPID 未配置');
}

// 私钥路径由CI workflow生成，固定为./private.key
const PRIVATE_KEY_PATH = './private.key';

// 非敏感配置可以有默认值
const VERSION = process.env.VERSION || `${Date.now()}`; // 版本号
const DESC = process.env.DESC || '自动部署'; // 版本描述
const ROBOT = process.env.ROBOT || 1; // 机器人编号

// 导出CI配置
module.exports = {
  // 项目基本信息
  projectPath: path.resolve(__dirname), // 小程序项目路径
  appid: APPID,
  type: 'miniProgram',
  privateKeyPath: PRIVATE_KEY_PATH,
  ignores: ['node_modules/**/*', '.git/**/*', '.github/**/*', 'config/**/*'], // 忽略的文件
  
  // 上传配置
  upload: {
    version: VERSION,
    desc: DESC,
    robot: ROBOT,
    setting: {
      es6: true,
      minify: true,
      codeProtect: true,
      ignoreUploadUnusedFiles: true
    },
    onProgressUpdate: (info) => {
      console.log(`上传进度: ${info.precent}%`);
      console.log(`正在处理文件: ${info.filePath}`);
    }
  },
  
  // 预览配置
  preview: {
    version: VERSION,
    desc: DESC,
    robot: ROBOT,
    setting: {
      es6: true,
      minify: true
    },
    qrcodeFormat: 'image',
    qrcodeOutputDest: path.resolve(__dirname, 'preview-qrcode.jpg'),
    onProgressUpdate: (info) => {
      console.log(`预览进度: ${info.precent}%`);
    }
  }
};
