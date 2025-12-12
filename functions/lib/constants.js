// 常量定义模块

// HTTP状态码
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500
};

// 限流配置
export const RATE_LIMIT_CONFIG = {
  SCORE: { limit: 10, windowSeconds: 60 },
  IMAGE: { limit: 50, windowSeconds: 60 },
  IMAGES: { limit: 50, windowSeconds: 60 },
  CLEANUP: { limit: 5, windowSeconds: 60 },
  VERIFY: { limit: 5, windowSeconds: 60 },
  AUTH: { limit: 20, windowSeconds: 60 }
};

// 数据保留策略（月）
export const DATA_RETENTION_MONTHS = 6;

// 会话过期时间（秒）
export const SESSION_TTL = 7 * 24 * 60 * 60; // 7天

// 批量操作批次大小
export const BATCH_SIZE = 20;

// 日志级别
export const LOG_LEVEL = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

// 错误消息
export const ERROR_MESSAGES = {
  INVALID_REQUEST: '请求格式错误',
  MISSING_PARAMETER: '缺少必需参数',
  UNAUTHORIZED: '未授权访问',
  FORBIDDEN: '访问被拒绝',
  NOT_FOUND: '资源不存在',
  RATE_LIMIT_EXCEEDED: '请求过于频繁，请稍后再试',
  INTERNAL_ERROR: '服务器内部错误',
  DATABASE_ERROR: '数据库操作失败',
  STORAGE_ERROR: '存储操作失败',
  VALIDATION_FAILED: '数据验证失败'
};

