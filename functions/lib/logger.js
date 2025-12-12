// 日志记录模块

import { LOG_LEVEL } from './constants.js';

/**
 * 日志记录器类
 */
class Logger {
  constructor(context = '') {
    this.context = context;
    this.logs = [];
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加元数据
   */
  log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const context = this.context ? `[${this.context}]` : '';
    const logEntry = `[${timestamp}] ${level} ${context} ${message}`;
    
    // 添加到日志数组
    this.logs.push(logEntry);
    
    // 输出到控制台（根据级别使用不同的控制台方法）
    switch (level) {
      case LOG_LEVEL.ERROR:
        console.error(logEntry, meta);
        break;
      case LOG_LEVEL.WARN:
        console.warn(logEntry, meta);
        break;
      case LOG_LEVEL.INFO:
        console.log(logEntry, meta);
        break;
      case LOG_LEVEL.DEBUG:
        // 在生产环境可以考虑不输出DEBUG日志
        console.log(logEntry, meta);
        break;
      default:
        console.log(logEntry, meta);
    }
  }

  /**
   * 记录DEBUG级别日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加元数据
   */
  debug(message, meta = {}) {
    this.log(LOG_LEVEL.DEBUG, message, meta);
  }

  /**
   * 记录INFO级别日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加元数据
   */
  info(message, meta = {}) {
    this.log(LOG_LEVEL.INFO, message, meta);
  }

  /**
   * 记录WARN级别日志
   * @param {string} message - 日志消息
   * @param {Object} meta - 附加元数据
   */
  warn(message, meta = {}) {
    this.log(LOG_LEVEL.WARN, message, meta);
  }

  /**
   * 记录ERROR级别日志
   * @param {string} message - 日志消息
   * @param {Error|Object} error - 错误对象或元数据
   */
  error(message, error = {}) {
    const meta = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      ...error
    } : error;
    this.log(LOG_LEVEL.ERROR, message, meta);
  }

  /**
   * 获取所有日志
   * @returns {Array<string>} 日志数组
   */
  getLogs() {
    return [...this.logs];
  }

  /**
   * 清空日志
   */
  clear() {
    this.logs = [];
  }
}

/**
 * 创建日志记录器实例
 * @param {string} context - 日志上下文
 * @returns {Logger} 日志记录器实例
 */
export function createLogger(context = '') {
  return new Logger(context);
}

/**
 * 创建简化版日志记录器（用于向后兼容）
 * @param {string} context - 日志上下文
 * @returns {Function} 日志记录函数
 */
export function createSimpleLogger(context = '') {
  const logger = createLogger(context);
  return (message) => {
    logger.debug(message);
  };
}

