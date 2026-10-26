// D1数据库操作模块

async function ensureTypedAnalysisTableExists(d1, analysisType) {
  const tableName = analysisType === 'score' ? 'score_analyses'
    : analysisType === 'fortune' ? 'fortune_analyses' : null;
  if (!tableName) throw new Error(`不支持的分析类型: ${analysisType}`);
  await d1.prepare(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id TEXT PRIMARY KEY,
      score REAL NOT NULL,
      comment TEXT NOT NULL,
      gender TEXT NOT NULL,
      age INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      image_url TEXT NOT NULL,
      md5 TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_${tableName}_md5 ON ${tableName}(md5)`).run();
  await d1.prepare(`CREATE INDEX IF NOT EXISTS idx_${tableName}_timestamp ON ${tableName}(timestamp)`).run();
}

async function insertAnalysis(d1, analysisData) {
  try {
    await ensureTypedAnalysisTableExists(d1, analysisData.analysis_type);
    const tableName = analysisData.analysis_type === 'score' ? 'score_analyses' : 'fortune_analyses';
    return await d1.prepare(`
      INSERT INTO ${tableName}
        (id, score, comment, gender, age, timestamp, image_url, md5)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      analysisData.id,
      analysisData.score,
      analysisData.comment,
      analysisData.gender,
      analysisData.age,
      analysisData.timestamp,
      analysisData.image_url,
      analysisData.md5
    ).run();
  } catch (err) {
    throw new Error(`D1插入分析记录失败: ${err.message}`);
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
    await ensureTypedAnalysisTableExists(d1, 'score');
    await ensureTypedAnalysisTableExists(d1, 'fortune');
    const result = await d1.prepare(`
      SELECT id, md5 FROM score_analyses WHERE timestamp < ?
      UNION ALL SELECT id, md5 FROM fortune_analyses WHERE timestamp < ?
    `).bind(cutoffTimestamp, cutoffTimestamp).all();
    return result.results || [];
  } catch (err) {
    throw new Error(`D1获取旧记录失败: ${err.message}`);
  }
}

async function deleteOldRecords(d1, cutoffTimestamp) {
  try {
    await d1.exec('BEGIN TRANSACTION;');
    try {
      await ensureTypedAnalysisTableExists(d1, 'score');
      await ensureTypedAnalysisTableExists(d1, 'fortune');
      const scoreResult = await d1.prepare('DELETE FROM score_analyses WHERE timestamp < ?').bind(cutoffTimestamp).run();
      const fortuneResult = await d1.prepare('DELETE FROM fortune_analyses WHERE timestamp < ?').bind(cutoffTimestamp).run();
      await d1.exec('COMMIT;');
      return { changes: (scoreResult.meta?.changes || scoreResult.changes || 0) + (fortuneResult.meta?.changes || fortuneResult.changes || 0) };
    } catch (error) {
      await d1.exec('ROLLBACK;');
      throw error;
    }
  } catch (err) {
    throw new Error(`D1删除旧记录失败: ${err.message}`);
  }
}

async function getStats(d1) {
  try {
    await ensureTypedAnalysisTableExists(d1, 'score');
    await ensureTypedAnalysisTableExists(d1, 'fortune');
    await ensureCoupleTableExists(d1);
    const timestampQueries = [
      'SELECT timestamp FROM score_analyses',
      'SELECT timestamp FROM fortune_analyses',
      'SELECT timestamp FROM couple_matches'
    ];
    const recordsQuery = timestampQueries.join(' UNION ALL ');
    const totalResult = await d1.prepare(
      `SELECT COUNT(*) as count FROM (${recordsQuery}) AS records`
    ).first();
    const totalCount = totalResult?.count || 0;
    
    const recentResult = await d1.prepare(
      `SELECT MAX(timestamp) as newest, MIN(timestamp) as oldest FROM (${recordsQuery}) AS records`
    )
    .first();
    
    const newestRecord = recentResult?.newest;
    const oldestRecord = recentResult?.oldest;
    
    const today = new Date().toISOString().split('T')[0] + 'T00:00:00.000Z';
    const todayResult = await d1.prepare(
      `SELECT COUNT(*) as count FROM (${recordsQuery}) AS records WHERE timestamp >= ?`
    )
    .bind(today)
    .first();
    const todayCount = todayResult?.count || 0;
    
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const monthResult = await d1.prepare(
      `SELECT COUNT(*) as count FROM (${recordsQuery}) AS records WHERE timestamp >= ?`
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
    await ensureTypedAnalysisTableExists(d1, 'score');
    await ensureTypedAnalysisTableExists(d1, 'fortune');
    await ensureCoupleTableExists(d1);
    const timestampQueries = [
      'SELECT timestamp FROM score_analyses',
      'SELECT timestamp FROM fortune_analyses',
      'SELECT timestamp FROM couple_matches'
    ];
    const recordsQuery = timestampQueries.join(' UNION ALL ');
    const oldRecordsResult = await d1.prepare(
      `SELECT COUNT(*) as count, MIN(timestamp) as oldestRecord
       FROM (${recordsQuery}) AS records WHERE timestamp < ?`
    )
    .bind(cutoffTimestamp)
    .first();
    
    const oldRecordCount = oldRecordsResult?.count || 0;
    const oldestRecord = oldRecordsResult?.oldestRecord;
    
    const recentRecordsResult = await d1.prepare(
      `SELECT COUNT(*) as count, MAX(timestamp) as newestRecord
       FROM (${recordsQuery}) AS records WHERE timestamp >= ?`
    )
    .bind(cutoffTimestamp)
    .first();
    
    const recentRecordCount = recentRecordsResult?.count || 0;
    const newestRecord = recentRecordsResult?.newestRecord;
    
    const totalResult = await d1.prepare(
      `SELECT COUNT(*) as count FROM (${recordsQuery}) AS records`
    ).first();
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
    await ensureTypedAnalysisTableExists(d1, 'score');
    await ensureTypedAnalysisTableExists(d1, 'fortune');
    await ensureCoupleTableExists(d1);
    const timestampQueries = [
      'SELECT timestamp FROM score_analyses',
      'SELECT timestamp FROM fortune_analyses',
      'SELECT timestamp FROM couple_matches'
    ];
    const recordsQuery = timestampQueries.join(' UNION ALL ');
    const pendingResult = await d1.prepare(
      `SELECT COUNT(*) as count FROM (${recordsQuery}) AS records WHERE timestamp < ?`
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
    
    await ensureTypedAnalysisTableExists(d1, 'score');
    await ensureTypedAnalysisTableExists(d1, 'fortune');
    await ensureCoupleTableExists(d1);
    const recordsQuery = `
      SELECT id, score, comment, gender, age, timestamp, image_url, md5,
        NULL AS image_url_b, NULL AS md5_b, 'score' AS analysis_type
      FROM score_analyses
      UNION ALL
      SELECT id, score, comment, gender, age, timestamp, image_url, md5,
        NULL AS image_url_b, NULL AS md5_b, 'fortune' AS analysis_type
      FROM fortune_analyses
      UNION ALL
      SELECT id, score,
        grade || ' · ' || highlights || ' · ' || notes || ' · ' || tags AS comment,
        genderA || ' / ' || genderB AS gender, ageA AS age, timestamp,
        image_url_a AS image_url, md5_a AS md5, image_url_b, md5_b,
        'couple' AS analysis_type
      FROM couple_matches`;
    const countQuery = `SELECT COUNT(*) as total FROM (${recordsQuery}) AS analysis_records ${whereClause}`;
    const dataQuery = `
      SELECT id, score, comment, gender, age, timestamp, image_url, md5,
        image_url_b, md5_b, analysis_type
      FROM (${recordsQuery}) AS analysis_records
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
    if (!ids?.length) return { success: true, deleted: 0 };
    await ensureTypedAnalysisTableExists(d1, 'score');
    await ensureTypedAnalysisTableExists(d1, 'fortune');
    await ensureCoupleTableExists(d1);
    let totalDeleted = 0;
    const batchSize = 20;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      const placeholders = batchIds.map(() => '?').join(',');
      for (const table of ['score_analyses', 'fortune_analyses', 'couple_matches']) {
        const result = await d1.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).bind(...batchIds).run();
        totalDeleted += result.meta?.changes || result.changes || 0;
      }
    }
    return { success: true, deleted: totalDeleted };
  } catch (err) {
    throw new Error(`D1批量删除分析记录失败: ${err.message}`);
  }
}

async function getImagesByIds(d1, ids) {
  try {
    if (!ids?.length) return [];
    await ensureTypedAnalysisTableExists(d1, 'score');
    await ensureTypedAnalysisTableExists(d1, 'fortune');
    await ensureCoupleTableExists(d1);
    const allResults = [];
    const batchSize = 20;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      const placeholders = batchIds.map(() => '?').join(',');
      const result = await d1.prepare(`
        SELECT id, md5, image_url, NULL AS md5_b, NULL AS image_url_b FROM score_analyses WHERE id IN (${placeholders})
        UNION ALL SELECT id, md5, image_url, NULL AS md5_b, NULL AS image_url_b FROM fortune_analyses WHERE id IN (${placeholders})
        UNION ALL SELECT id, md5_a AS md5, image_url_a AS image_url, md5_b, image_url_b FROM couple_matches WHERE id IN (${placeholders})
      `).bind(...batchIds, ...batchIds, ...batchIds).all();
      for (const row of result.results || []) {
        allResults.push(row);
        if (row.md5_b) allResults.push({ id: row.id, md5: row.md5_b, image_url: row.image_url_b });
      }
    }
    return allResults;
  } catch (err) {
    throw new Error(`D1根据ID获取图片失败: ${err.message}`);
  }
}

async function getReferencedImageIds(d1, md5List) {
  const uniqueIds = [...new Set((md5List || []).filter(Boolean))];
  if (!uniqueIds.length) return [];
  try {
    await ensureTypedAnalysisTableExists(d1, 'score');
    await ensureTypedAnalysisTableExists(d1, 'fortune');
    await ensureCoupleTableExists(d1);
    const referenced = new Set();
    const batchSize = 300;
    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      const batch = uniqueIds.slice(i, i + batchSize);
      const placeholders = batch.map(() => '?').join(',');
      const singleRows = await d1.prepare(`
        SELECT md5 AS image_id FROM score_analyses WHERE md5 IN (${placeholders})
        UNION SELECT md5 AS image_id FROM fortune_analyses WHERE md5 IN (${placeholders})
      `).bind(...batch, ...batch).all();
      for (const row of singleRows.results || []) referenced.add(row.image_id);
      const coupleRows = await d1.prepare(`
        SELECT md5_a AS image_id FROM couple_matches WHERE md5_a IN (${placeholders})
        UNION SELECT md5_b AS image_id FROM couple_matches WHERE md5_b IN (${placeholders})
      `).bind(...batch, ...batch).all();
      for (const row of coupleRows.results || []) referenced.add(row.image_id);
    }
    return [...referenced];
  } catch (err) {
    throw new Error(`D1检查图片引用失败: ${err.message}`);
  }
}

async function ensureImageDeletionQueueExists(d1) {
  await d1.prepare(`
    CREATE TABLE IF NOT EXISTS image_deletion_queue (
      md5 TEXT PRIMARY KEY,
      queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    )
  `).run();
  await d1.prepare(`
    CREATE INDEX IF NOT EXISTS idx_image_deletion_queue_queued_at
    ON image_deletion_queue(queued_at)
  `).run();
}

async function enqueueImageDeletions(d1, md5List) {
  const ids = [...new Set((md5List || []).filter(Boolean))];
  if (!ids.length) return 0;
  await ensureImageDeletionQueueExists(d1);
  let added = 0;
  for (const md5 of ids) {
    const result = await d1.prepare(`
      INSERT INTO image_deletion_queue (md5) VALUES (?)
      ON CONFLICT(md5) DO NOTHING
    `).bind(md5).run();
    added += result.meta?.changes || result.changes || 0;
  }
  return added;
}

async function getQueuedImageDeletions(d1, limit = 500) {
  await ensureImageDeletionQueueExists(d1);
  const result = await d1.prepare(`
    SELECT md5 FROM image_deletion_queue ORDER BY queued_at ASC LIMIT ?
  `).bind(limit).all();
  return (result.results || []).map(row => row.md5);
}

async function removeQueuedImageDeletions(d1, md5List) {
  const ids = [...new Set((md5List || []).filter(Boolean))];
  if (!ids.length) return 0;
  await ensureImageDeletionQueueExists(d1);
  let removed = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const placeholders = batch.map(() => '?').join(',');
    const result = await d1.prepare(`
      DELETE FROM image_deletion_queue WHERE md5 IN (${placeholders})
    `).bind(...batch).run();
    removed += result.meta?.changes || result.changes || 0;
  }
  return removed;
}

async function recordImageDeletionFailures(d1, md5List, error) {
  const ids = [...new Set((md5List || []).filter(Boolean))];
  if (!ids.length) return;
  await ensureImageDeletionQueueExists(d1);
  const message = String(error?.message || error || 'R2删除失败').slice(0, 500);
  for (const md5 of ids) {
    await d1.prepare(`
      UPDATE image_deletion_queue
      SET attempts = attempts + 1, last_error = ?
      WHERE md5 = ?
    `).bind(message, md5).run();
  }
}

async function ensureCoupleTableExists(d1) {
  try {
    const tableCheck = await d1.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='couple_matches'"
    ).first();
    
    if (!tableCheck) {
      await d1.prepare(`
        CREATE TABLE couple_matches (
          id TEXT PRIMARY KEY,
          score REAL NOT NULL,
          grade TEXT NOT NULL,
          highlights TEXT NOT NULL,
          notes TEXT NOT NULL,
          tags TEXT NOT NULL,
          genderA TEXT NOT NULL,
          ageA INTEGER NOT NULL,
          scoreA REAL NOT NULL,
          genderB TEXT NOT NULL,
          ageB INTEGER NOT NULL,
          scoreB REAL NOT NULL,
          timestamp TEXT NOT NULL,
          image_url_a TEXT NOT NULL,
          image_url_b TEXT NOT NULL,
          md5_a TEXT NOT NULL,
          md5_b TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      
      await d1.prepare("CREATE INDEX idx_couple_matches_timestamp ON couple_matches(timestamp)").run();
      await d1.prepare("CREATE INDEX idx_couple_matches_created_at ON couple_matches(created_at)").run();
    }
    
    return true;
  } catch (err) {
    throw new Error(`D1表检查或创建失败(couple_matches): ${err.message}`);
  }
}

async function insertOrUpdateCoupleMatch(d1, matchData) {
  try {
    await ensureCoupleTableExists(d1);
    
    const query = `
      INSERT INTO couple_matches (id, score, grade, highlights, notes, tags,
        genderA, ageA, scoreA, genderB, ageB, scoreB, 
        timestamp, image_url_a, image_url_b, md5_a, md5_b)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        score = excluded.score,
        grade = excluded.grade,
        highlights = excluded.highlights,
        notes = excluded.notes,
        tags = excluded.tags,
        genderA = excluded.genderA,
        ageA = excluded.ageA,
        scoreA = excluded.scoreA,
        genderB = excluded.genderB,
        ageB = excluded.ageB,
        scoreB = excluded.scoreB,
        timestamp = excluded.timestamp,
        image_url_a = excluded.image_url_a,
        image_url_b = excluded.image_url_b,
        created_at = CURRENT_TIMESTAMP
    `;
    
    return await d1.prepare(query)
      .bind(
        matchData.id,
        matchData.score,
        matchData.grade,
        matchData.highlights,
        matchData.notes,
        matchData.tags,
        matchData.genderA,
        matchData.ageA,
        matchData.scoreA,
        matchData.genderB,
        matchData.ageB,
        matchData.scoreB,
        matchData.timestamp,
        matchData.image_url_a,
        matchData.image_url_b,
        matchData.md5_a,
        matchData.md5_b
      )
      .run();
  } catch (err) {
    throw new Error(`D1插入或更新失败(couple_matches): ${err.message}`);
  }
}

async function getOldCoupleRecords(d1, cutoffTimestamp) {
  try {
    const tableCheck = await d1.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='couple_matches'"
    ).first();
    if (!tableCheck) return [];

    const result = await d1.prepare(
      "SELECT id, md5_a, md5_b FROM couple_matches WHERE timestamp < ?"
    )
    .bind(cutoffTimestamp)
    .all();
    
    return result.results || [];
  } catch (err) {
    throw new Error(`D1获取旧记录失败(couple_matches): ${err.message}`);
  }
}

async function deleteOldCoupleRecords(d1, cutoffTimestamp) {
  try {
    await d1.exec("BEGIN TRANSACTION;");
    
    try {
      const result = await d1.prepare(
        "DELETE FROM couple_matches WHERE timestamp < ?"
      )
      .bind(cutoffTimestamp)
      .run();
      
      await d1.exec("COMMIT;");
      
      return result;
    } catch (transactionError) {
      await d1.exec("ROLLBACK;");
      throw transactionError;
    }
  } catch (err) {
    throw new Error(`D1删除旧记录失败(couple_matches): ${err.message}`);
  }
}

export {
  insertAnalysis,
  getOldRecords,
  deleteOldRecords,
  getStats,
  getRetentionStats,
  getCleanupStatus,
  getImages,
  deleteImages,
  getImagesByIds,
  getReferencedImageIds,
  enqueueImageDeletions,
  getQueuedImageDeletions,
  removeQueuedImageDeletions,
  recordImageDeletionFailures,
  ensureCoupleTableExists,
  insertOrUpdateCoupleMatch,
  getOldCoupleRecords,
  deleteOldCoupleRecords
};
