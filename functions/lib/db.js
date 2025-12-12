// D1数据库操作模块

/**
 * 初始化D1数据库（创建表和索引）
 * @param {D1Database} d1 - D1数据库实例
 * @returns {Promise<void>} - 初始化操作的Promise
 */
async function init(d1) {
  try {
    await d1.exec(`
      CREATE TABLE IF NOT EXISTS face_scores (
        id TEXT PRIMARY KEY,
        score REAL NOT NULL,
        comment TEXT NOT NULL,
        gender TEXT NOT NULL,
        age INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        image_url TEXT NOT NULL,
        md5 TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_face_scores_md5 ON face_scores(md5);
      CREATE INDEX IF NOT EXISTS idx_face_scores_timestamp ON face_scores(timestamp);
      CREATE INDEX IF NOT EXISTS idx_face_scores_created_at ON face_scores(created_at);
    `);
  } catch (err) {
    throw new Error(`D1数据库初始化失败: ${err.message}`);
  }
}

/**
 * 检查face_scores表是否存在，如果不存在则创建
 * @param {D1Database} d1 - D1数据库实例
 * @returns {Promise<boolean>} - 表是否存在或创建成功
 */
async function ensureTableExists(d1) {
  try {
    // 检查face_scores表是否存在
    const tableCheck = await d1.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='face_scores'"
    ).first();
    
    if (!tableCheck) {
      // 分步创建表和索引
      // 创建表
      await d1.prepare(`
        CREATE TABLE face_scores (
          id TEXT PRIMARY KEY,
          score REAL NOT NULL,
          comment TEXT NOT NULL,
          gender TEXT NOT NULL,
          age INTEGER NOT NULL,
          timestamp TEXT NOT NULL,
          image_url TEXT NOT NULL,
          md5 TEXT UNIQUE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      
      // 创建索引
      await d1.prepare("CREATE INDEX idx_face_scores_md5 ON face_scores(md5)").run();
      await d1.prepare("CREATE INDEX idx_face_scores_timestamp ON face_scores(timestamp)").run();
      await d1.prepare("CREATE INDEX idx_face_scores_created_at ON face_scores(created_at)").run();
      
      return true;
    }
    
    return true;
  } catch (err) {
    throw new Error(`D1表检查或创建失败: ${err.message}`);
  }
}

/**
 * 插入或更新颜值评分记录
 * @param {D1Database} d1 - D1数据库实例
 * @param {Object} scoreData - 评分数据对象
 * @param {string} scoreData.id - 记录ID
 * @param {number} scoreData.score - 颜值评分
 * @param {string} scoreData.comment - 颜值点评
 * @param {string} scoreData.gender - 性别
 * @param {number} scoreData.age - 年龄
 * @param {string} scoreData.timestamp - 时间戳
 * @param {string} scoreData.image_url - 图片URL
 * @param {string} scoreData.md5 - 图片MD5
 * @returns {Promise<Object>} - 执行结果
 */
async function insertOrUpdateScore(d1, scoreData) {
  try {
    // 确保表存在
    await ensureTableExists(d1);
    
    // 执行插入/更新操作
    const query = `
      INSERT INTO face_scores (id, score, comment, gender, age, timestamp, image_url, md5)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(md5) DO UPDATE SET
        score = excluded.score,
        comment = excluded.comment,
        gender = excluded.gender,
        age = excluded.age,
        timestamp = excluded.timestamp,
        image_url = excluded.image_url,
        created_at = CURRENT_TIMESTAMP
    `;
    
    return await d1.prepare(query)
      .bind(
        scoreData.id,
        scoreData.score,
        scoreData.comment,
        scoreData.gender,
        scoreData.age,
        scoreData.timestamp,
        scoreData.image_url,
        scoreData.md5
      )
      .run();
  } catch (err) {
    throw new Error(`D1插入或更新失败: ${err.message}`);
  }
}

/**
 * 获取超过指定时间的旧记录
 * @param {D1Database} d1 - D1数据库实例
 * @param {string} cutoffTimestamp - 截止时间戳
 * @returns {Promise<Array<Object>>} - 旧记录数组
 */
async function getOldRecords(d1, cutoffTimestamp) {
  try {
    const result = await d1.prepare(
      "SELECT id, md5 FROM face_scores WHERE timestamp < ?"
    )
    .bind(cutoffTimestamp)
    .all();
    
    return result.results || [];
  } catch (err) {
    throw new Error(`D1获取旧记录失败: ${err.message}`);
  }
}

/**
 * 删除超过指定时间的旧记录
 * @param {D1Database} d1 - D1数据库实例
 * @param {string} cutoffTimestamp - 截止时间戳
 * @returns {Promise<Object>} - 删除结果
 */
async function deleteOldRecords(d1, cutoffTimestamp) {
  try {
    // 开始事务
    await d1.exec("BEGIN TRANSACTION;");
    
    try {
      // 执行删除操作
      const result = await d1.prepare(
        "DELETE FROM face_scores WHERE timestamp < ?"
      )
      .bind(cutoffTimestamp)
      .run();
      
      // 提交事务
      await d1.exec("COMMIT;");
      
      return result;
    } catch (transactionError) {
      // 回滚事务
      await d1.exec("ROLLBACK;");
      throw transactionError;
    }
  } catch (err) {
    throw new Error(`D1删除旧记录失败: ${err.message}`);
  }
}

/**
 * 获取数据库统计信息
 * @param {D1Database} d1 - D1数据库实例
 * @returns {Promise<Object>} - 统计信息
 */
async function getStats(d1) {
  try {
    // 获取基本统计信息
    const totalResult = await d1.prepare("SELECT COUNT(*) as count FROM face_scores").first();
    const totalCount = totalResult?.count || 0;
    
    // 获取最近记录
    const recentResult = await d1.prepare(
      "SELECT MAX(timestamp) as newest, MIN(timestamp) as oldest FROM face_scores"
    )
    .first();
    
    const newestRecord = recentResult?.newest;
    const oldestRecord = recentResult?.oldest;
    
    // 获取今天的记录数
    const today = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';
    const todayResult = await d1.prepare(
      "SELECT COUNT(*) as count FROM face_scores WHERE timestamp >= ?"
    )
    .bind(today)
    .first();
    const todayCount = todayResult?.count || 0;
    
    // 获取本月的记录数
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const monthResult = await d1.prepare(
      "SELECT COUNT(*) as count FROM face_scores WHERE timestamp >= ?"
    )
    .bind(thisMonth.toISOString())
    .first();
    const monthCount = monthResult?.count || 0;
    
    return {
      totalRecords: totalCount,
      newestRecord,
      oldestRecord,
      recordsToday: todayCount,
      recordsThisMonth: monthCount
    };
  } catch (err) {
    throw new Error(`D1获取统计信息失败: ${err.message}`);
  }
}

/**
 * 获取数据保留策略统计
 * @param {D1Database} d1 - D1数据库实例
 * @param {string} cutoffTimestamp - 截止时间戳
 * @returns {Promise<Object>} - 保留策略统计
 */
async function getRetentionStats(d1, cutoffTimestamp) {
  try {
    // 检查是否存在超过指定时间的记录
    const oldRecordsResult = await d1.prepare(
      "SELECT COUNT(*) as count, MIN(timestamp) as oldestRecord FROM face_scores WHERE timestamp < ?"
    )
    .bind(cutoffTimestamp)
    .first();
    
    const oldRecordCount = oldRecordsResult?.count || 0;
    const oldestRecord = oldRecordsResult?.oldestRecord;
    
    // 检查最近指定时间内的记录
    const recentRecordsResult = await d1.prepare(
      "SELECT COUNT(*) as count, MAX(timestamp) as newestRecord FROM face_scores WHERE timestamp >= ?"
    )
    .bind(cutoffTimestamp)
    .first();
    
    const recentRecordCount = recentRecordsResult?.count || 0;
    const newestRecord = recentRecordsResult?.newestRecord;
    
    // 获取总记录数
    const totalResult = await d1.prepare("SELECT COUNT(*) as count FROM face_scores").first();
    const totalCount = totalResult?.count || 0;
    
    return {
      totalRecords: totalCount,
      recentRecords: recentRecordCount,
      oldRecords: oldRecordCount,
      oldestRecord,
      newestRecord
    };
  } catch (err) {
    throw new Error(`D1获取保留策略统计失败: ${err.message}`);
  }
}

/**
 * 获取清理状态
 * @param {D1Database} d1 - D1数据库实例
 * @param {string} cutoffTimestamp - 截止时间戳
 * @returns {Promise<Object>} - 清理状态
 */
async function getCleanupStatus(d1, cutoffTimestamp) {
  try {
    // 获取超过指定时间的记录数量（即下次清理将删除的记录数）
    const pendingResult = await d1.prepare(
      "SELECT COUNT(*) as count FROM face_scores WHERE timestamp < ?"
    )
    .bind(cutoffTimestamp)
    .first();
    
    const pendingDeletion = pendingResult?.count || 0;
    
    return {
      pendingDeletion
    };
  } catch (err) {
    throw new Error(`D1获取清理状态失败: ${err.message}`);
  }
}

/**
 * 分页获取图片列表
 * @param {D1Database} d1 - D1数据库实例
 * @param {Object} options - 查询选项
 * @param {number} options.page - 页码，默认1
 * @param {number} options.limit - 每页数量，默认10
 * @param {string} options.sort_by - 排序字段，可选值：timestamp、score，默认timestamp
 * @param {string} options.order - 排序方向，可选值：asc、desc，默认desc
 * @param {string} options.date_from - 开始时间，ISO格式
 * @param {string} options.date_to - 结束时间，ISO格式
 * @returns {Promise<Object>} - 图片列表和分页信息
 */
async function getImages(d1, options = {}) {
  try {
    // 默认参数
    const { 
      page = 1, 
      limit = 10, 
      sort_by = 'timestamp', 
      order = 'desc',
      date_from = null,
      date_to = null
    } = options;
    
    // 验证排序字段
    const validSortFields = ['timestamp', 'score'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'timestamp';
    
    // 验证排序方向
    const orderBy = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    // 计算偏移量
    const offset = (page - 1) * limit;
    
    // 构建查询条件
    let whereClause = '';
    const params = [];
    
    if (date_from && date_to) {
      whereClause = 'WHERE timestamp BETWEEN ? AND ?';
      params.push(date_from, date_to);
    } else if (date_from) {
      whereClause = 'WHERE timestamp >= ?';
      params.push(date_from);
    } else if (date_to) {
      whereClause = 'WHERE timestamp <= ?';
      params.push(date_to);
    }
    
    // 构建查询语句
    const countQuery = `SELECT COUNT(*) as total FROM face_scores ${whereClause}`;
    const dataQuery = `
      SELECT id, score, comment, gender, age, timestamp, image_url, md5 
      FROM face_scores 
      ${whereClause}
      ORDER BY ${sortField} ${orderBy}
      LIMIT ? OFFSET ?
    `;
    
    // 获取总记录数
    const countResult = await d1.prepare(countQuery)
      .bind(...params)
      .first();
    const total = countResult?.total || 0;
    
    // 获取数据
    const dataParams = [...params, limit, offset];
    const dataResult = await d1.prepare(dataQuery)
      .bind(...dataParams)
      .all();
    const results = dataResult.results || [];
    
    // 计算分页信息
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;
    
    return {
      data: results,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_next: hasNext,
        has_prev: hasPrev
      }
    };
  } catch (err) {
    throw new Error(`D1获取图片列表失败: ${err.message}`);
  }
}

/**
 * 批量删除照片记录
 * @param {D1Database} d1 - D1数据库实例
 * @param {Array<string>} ids - 要删除的照片ID列表
 * @returns {Promise<Object>} - 删除结果
 */
async function deleteImages(d1, ids) {
  try {
    if (!ids || ids.length === 0) {
      return { success: true, deleted: 0 };
    }
    
    let totalDeleted = 0;
    const batchSize = 20;
    
    // 批量删除，分批处理以避免SQL参数限制
    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      const placeholders = batchIds.map(() => '?').join(',');
      const sql = `DELETE FROM face_scores WHERE id IN (${placeholders})`;
      
      const result = await d1.prepare(sql)
        .bind(...batchIds)
        .run();
      
      const batchDeleted = result.meta?.changes || 0;
      totalDeleted += batchDeleted;
    }
    
    return { success: true, deleted: totalDeleted };
  } catch (err) {
    throw new Error(`D1批量删除照片失败: ${err.message}`);
  }
}

/**
 * 根据ID列表获取照片信息
 * @param {D1Database} d1 - D1数据库实例
 * @param {Array<string>} ids - 照片ID列表
 * @returns {Promise<Array<Object>>} - 照片信息列表
 */
async function getImagesByIds(d1, ids) {
  try {
    if (!ids || ids.length === 0) {
      return [];
    }
    
    let allResults = [];
    const batchSize = 20; // 每批处理20个ID，避免IN子句参数限制
    
    // 分批处理
    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      
      // 构建IN子句的参数占位符
      const placeholders = batchIds.map(() => '?').join(',');
      const sql = `SELECT id, md5, image_url FROM face_scores WHERE id IN (${placeholders})`;
      
      // 执行查询
      const result = await d1.prepare(sql)
        .bind(...batchIds)
        .all();
      
      // 确保结果格式正确
      const batchResults = Array.isArray(result.results) ? result.results : [];
      allResults = allResults.concat(batchResults);
    }
    
    return allResults;
  } catch (err) {
    throw new Error(`D1根据ID获取照片失败: ${err.message}`);
  }
}

export {
  init,
  ensureTableExists,
  insertOrUpdateScore,
  getOldRecords,
  deleteOldRecords,
  getStats,
  getRetentionStats,
  getCleanupStatus,
  getImages,
  deleteImages,
  getImagesByIds
};