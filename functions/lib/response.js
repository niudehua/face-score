// 统一响应处理模块

import { HTTP_STATUS } from './constants.js';
import { addRateLimitHeaders } from './rate-limit.js';

// 默认响应头
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8'
};

/**
 * 创建成功响应
 * @param {any} data - 响应数据
 * @param {Object} options - 选项
 * @param {number} options.status - HTTP状态码
 * @param {Object} options.headers - 自定义响应头
 * @param {Object} options.rateLimitInfo - 限流信息
 * @returns {Response}
 */
export function createSuccessResponse(data, options = {}) {
  const {
    status = HTTP_STATUS.OK,
    headers = {},
    rateLimitInfo = null,
    logs = [],
    debug = false
  } = options;

  const responseHeaders = {
    ...DEFAULT_HEADERS,
    ...headers
  };

  // 在调试模式下附加日志，保持兼容性：非对象数据会被包裹为 { data, logs }
  let responseData = data;
  if (debug && Array.isArray(logs) && logs.length > 0) {
    responseData = (data && typeof data === 'object' && !Array.isArray(data))
      ? { ...data, logs }
      : { data, logs };
  }

  let response = new Response(JSON.stringify(responseData), {
    status,
    headers: responseHeaders
  });

  // 添加限流响应头
  if (rateLimitInfo) {
    response = addRateLimitHeaders(response, rateLimitInfo);
  }

  return response;
}

/**
 * 创建错误响应
 * @param {string|Error} error - 错误消息或错误对象
 * @param {Object} options - 选项
 * @param {number} options.status - HTTP状态码
 * @param {Object} options.headers - 自定义响应头
 * @param {Object} options.rateLimitInfo - 限流信息
 * @param {Array} options.logs - 调试日志
 * @param {boolean} options.debug - 是否包含调试信息
 * @returns {Response}
 */
export function createErrorResponse(error, options = {}) {
  const {
    status = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    headers = {},
    rateLimitInfo = null,
    logs = [],
    debug = false
  } = options;

  const errorMessage = error instanceof Error ? error.message : error;
  
  const responseData = {
    success: false,
    error: errorMessage
  };

  // 仅在调试模式下包含日志
  if (debug && logs.length > 0) {
    responseData.logs = logs;
  }

  const responseHeaders = {
    ...DEFAULT_HEADERS,
    ...headers
  };

  let response = new Response(JSON.stringify(responseData), {
    status,
    headers: responseHeaders
  });

  // 添加限流响应头
  if (rateLimitInfo) {
    response = addRateLimitHeaders(response, rateLimitInfo);
  }

  return response;
}

/**
 * 创建CORS响应头
 * @param {string|string[]} allowedOrigins - 允许的源
 * @param {Request} request - 请求对象
 * @returns {Object} CORS响应头
 */
export function createCORSHeaders(allowedOrigins = '*', request = null) {
  // 如果没有请求对象，返回默认CORS头
  if (!request) {
    return {
      'Access-Control-Allow-Origin': Array.isArray(allowedOrigins) ? allowedOrigins[0] || '*' : allowedOrigins,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Turnstile-Response'
    };
  }

  // 获取请求来源
  const origin = request.headers.get('Origin') || '*';
  const origins = Array.isArray(allowedOrigins) ? allowedOrigins : [allowedOrigins];
  const isAllowed = origins.includes(origin);

  if (isAllowed) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Turnstile-Response',
      'Access-Control-Allow-Credentials': 'true'
    };
  }

  // 如果没有匹配的源，返回默认CORS头
  return {
    'Access-Control-Allow-Origin': origins[0] || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Turnstile-Response'
  };
}

/**
 * 处理OPTIONS请求（CORS预检）
 * @param {string|string[]} allowedOrigins - 允许的源
 * @param {Request} request - 请求对象
 * @returns {Response}
 */
export function handleOptionsRequest(allowedOrigins = '*', request = null) {
  const corsHeaders = createCORSHeaders(allowedOrigins, request);
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}