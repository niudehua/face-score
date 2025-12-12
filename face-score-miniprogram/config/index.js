// 小程序配置文件
// 支持多环境配置，从环境变量获取敏感信息

// 基础配置（非敏感信息）
const baseConfig = {
  // 开发环境
  development: {
    // 默认开发环境配置
    debug: true
  },

  // 生产环境
  production: {
    // 默认生产环境配置
    debug: false
  }
};

// 获取当前环境
const getCurrentEnv = () => {
  // 小程序环境变量，在CI构建时设置
  // 开发工具中默认为development
  if (typeof process !== 'undefined' && process.env.NODE_ENV) {
    return process.env.NODE_ENV;
  }
  return 'development';
};

// 从环境变量获取配置
const getEnvConfig = () => {
  const envConfig = {};

  // 从环境变量获取敏感配置
  if (typeof process !== 'undefined') {
    // API地址
    if (process.env.API_URL) {
      envConfig.apiUrl = process.env.API_URL;
    }

    // AppID
    if (process.env.APPID) {
      envConfig.appid = process.env.APPID;
    }
  }

  return envConfig;
};

// 导出当前环境的配置
const currentEnv = getCurrentEnv();
const currentConfig = {
  ...(baseConfig[currentEnv] || baseConfig.development),
  ...getEnvConfig()
};

// 允许通过全局变量覆盖配置（用于调试）
if (typeof globalThis !== 'undefined' && globalThis.__MINIPROGRAM_CONFIG__) {
  Object.assign(currentConfig, globalThis.__MINIPROGRAM_CONFIG__);
}

// 尝试加载本地配置文件 (gitignored)
// 用于本地开发时覆盖配置，无需修改代码
try {
  const localConfig = require('./config.local.js');
  if (localConfig) {
    Object.assign(currentConfig, localConfig);
    console.log('✅ 已加载本地配置文件 config.local.js');
  }
} catch (e) {
  // 本地配置文件不存在是正常的，忽略错误
}

// 确保配置完整
if (!currentConfig.apiUrl) {
  console.error('❌ API_URL环境变量未配置');
  // 开发环境也必须配置API_URL
}

if (!currentConfig.appid) {
  console.error('❌ APPID环境变量未配置');
  // 开发环境也必须配置APPID
}

module.exports = currentConfig;
