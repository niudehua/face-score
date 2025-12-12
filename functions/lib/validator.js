// 输入验证模块


/**
 * 验证Base64编码的图片
 * @param {string} base64 - Base64编码字符串
 * @returns {Object} 验证结果 {valid: boolean, error?: string}
 */
export function validateBase64Image(base64) {
  if (!base64 || typeof base64 !== 'string') {
    return { valid: false, error: '图片数据不能为空' };
  }

  // 检查Base64格式（可选：data:image/xxx;base64,前缀）
  const base64Regex = /^(data:image\/(jpeg|jpg|png|gif|webp);base64,)?[A-Za-z0-9+/=]+$/;
  if (!base64Regex.test(base64)) {
    return { valid: false, error: '无效的Base64图片格式' };
  }

  // 检查长度（移除前缀后）
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  if (base64Data.length < 100) {
    return { valid: false, error: '图片数据过小' };
  }

  // 检查最大长度（10MB）
  const maxSize = 10 * 1024 * 1024; // 10MB
  const estimatedSize = (base64Data.length * 3) / 4;
  if (estimatedSize > maxSize) {
    return { valid: false, error: '图片大小超过10MB限制' };
  }

  return { valid: true };
}

/**
 * 验证MD5值
 * @param {string} md5 - MD5值
 * @returns {Object} 验证结果 {valid: boolean, error?: string}
 */
export function validateMD5(md5) {
  if (!md5 || typeof md5 !== 'string') {
    return { valid: false, error: 'MD5值不能为空' };
  }

  // MD5是32位十六进制字符串
  const md5Regex = /^[a-f0-9]{32}$/i;
  if (!md5Regex.test(md5)) {
    return { valid: false, error: '无效的MD5格式' };
  }

  return { valid: true };
}

/**
 * 验证分页参数
 * @param {number} page - 页码
 * @param {number} limit - 每页数量
 * @returns {Object} 验证结果 {valid: boolean, error?: string, page?: number, limit?: number}
 */
export function validatePagination(page, limit) {
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (isNaN(pageNum) || pageNum < 1) {
    return { valid: false, error: '页码必须大于等于1' };
  }

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    return { valid: false, error: '每页数量必须在1-100之间' };
  }

  return { valid: true, page: pageNum, limit: limitNum };
}

/**
 * 验证日期范围
 * @param {string} dateFrom - 开始日期（ISO格式）
 * @param {string} dateTo - 结束日期（ISO格式）
 * @returns {Object} 验证结果 {valid: boolean, error?: string}
 */
export function validateDateRange(dateFrom, dateTo) {
  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    if (isNaN(fromDate.getTime())) {
      return { valid: false, error: '无效的开始日期格式' };
    }
  }

  if (dateTo) {
    const toDate = new Date(dateTo);
    if (isNaN(toDate.getTime())) {
      return { valid: false, error: '无效的结束日期格式' };
    }
  }

  if (dateFrom && dateTo) {
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    if (fromDate > toDate) {
      return { valid: false, error: '开始日期不能晚于结束日期' };
    }
  }

  return { valid: true };
}

/**
 * 验证ID数组
 * @param {Array} ids - ID数组
 * @returns {Object} 验证结果 {valid: boolean, error?: string}
 */
export function validateIds(ids) {
  if (!Array.isArray(ids)) {
    return { valid: false, error: 'IDs必须是数组' };
  }

  if (ids.length === 0) {
    return { valid: false, error: 'IDs数组不能为空' };
  }

  if (ids.length > 100) {
    return { valid: false, error: '单次最多处理100个ID' };
  }

  // 验证每个ID都是字符串且非空
  for (const id of ids) {
    if (typeof id !== 'string' || !id.trim()) {
      return { valid: false, error: 'ID格式无效' };
    }
  }

  return { valid: true };
}

/**
 * 清理和验证字符串输入
 * @param {string} input - 输入字符串
 * @param {Object} options - 选项
 * @param {number} options.maxLength - 最大长度
 * @param {boolean} options.allowEmpty - 是否允许为空
 * @returns {Object} 验证结果 {valid: boolean, error?: string, value?: string}
 */
export function sanitizeString(input, options = {}) {
  const { maxLength = 1000, allowEmpty = false } = options;

  if (typeof input !== 'string') {
    return { valid: false, error: '输入必须是字符串' };
  }

  const trimmed = input.trim();

  if (!allowEmpty && !trimmed) {
    return { valid: false, error: '输入不能为空' };
  }

  if (trimmed.length > maxLength) {
    return { valid: false, error: `输入长度不能超过${maxLength}个字符` };
  }

  return { valid: true, value: trimmed };
}

