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

export {
  init,
  ensureTableExists,
  insertOrUpdateScore,
  getOldRecords,
  deleteOldRecords,
  getStats,
  getRetentionStats,
  getCleanupStatus
};