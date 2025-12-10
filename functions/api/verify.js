export async function onRequestGet(context) {
  const logs = [];
  
  function log(msg) {
    logs.push(msg);
    console.log(msg);
  }

  try {
    const d1 = context.env.FACE_SCORE_DB;
    if (!d1) {
      return new Response(JSON.stringify({ 
        error: "D1 database not configured", 
        logs 
      }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const url = new URL(context.request.url);
    const action = url.searchParams.get('action') || 'retention';
    
    log(`🐾 [DEBUG] 开始执行验证任务，操作类型: ${action}`);

    if (action === 'retention') {
      // 验证数据保留策略
      return await verifyRetentionPolicy(d1, log);
    } else if (action === 'stats') {
      // 获取数据库统计信息
      return await getDatabaseStats(d1, log);
    } else if (action === 'cleanup-status') {
      // 获取清理状态（简化版，实际可扩展为存储清理历史）
      return await getCleanupStatus(d1, log);
    } else {
      return new Response(JSON.stringify({ 
        error: `Invalid action: ${action}`, 
        logs 
      }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    
  } catch (error) {
    log(`❌ [ERROR] 验证任务失败: ${error.message}`);
    return new Response(JSON.stringify({ 
      error: "验证任务失败", 
      detail: error.message, 
      logs 
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// 验证数据保留策略
async function verifyRetentionPolicy(d1, log) {
  const logs = [];
  
  // 计算6个月前的日期
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 6);
  const cutoffTimestamp = cutoffDate.toISOString();
  
  logs.push(`📅 [DEBUG] 验证截止日期: ${cutoffDate.toLocaleString()}`);
  logs.push(`📅 [DEBUG] 验证截止时间戳: ${cutoffTimestamp}`);
  
  // 检查是否存在超过6个月的记录
  const oldRecordsResult = await d1.prepare(
    "SELECT COUNT(*) as count, MIN(timestamp) as oldestRecord FROM face_scores WHERE timestamp < ?"
  )
  .bind(cutoffTimestamp)
  .first();
  
  const oldRecordCount = oldRecordsResult?.count || 0;
  const oldestRecord = oldRecordsResult?.oldestRecord;
  
  logs.push(`📊 [DEBUG] 超过6个月的记录数量: ${oldRecordCount}`);
  if (oldestRecord) {
    logs.push(`📅 [DEBUG] 最早记录时间: ${new Date(oldestRecord).toLocaleString()}`);
  }
  
  // 检查最近6个月的记录
  const recentRecordsResult = await d1.prepare(
    "SELECT COUNT(*) as count, MAX(timestamp) as newestRecord FROM face_scores WHERE timestamp >= ?"
  )
  .bind(cutoffTimestamp)
  .first();
  
  const recentRecordCount = recentRecordsResult?.count || 0;
  const newestRecord = recentRecordsResult?.newestRecord;
  
  logs.push(`📊 [DEBUG] 最近6个月的记录数量: ${recentRecordCount}`);
  if (newestRecord) {
    logs.push(`📅 [DEBUG] 最新记录时间: ${new Date(newestRecord).toLocaleString()}`);
  }
  
  // 获取总记录数
  const totalResult = await d1.prepare("SELECT COUNT(*) as count FROM face_scores").first();
  const totalCount = totalResult?.count || 0;
  
  logs.push(`📊 [DEBUG] 总记录数: ${totalCount}`);
  
  const isCompliant = oldRecordCount === 0;
  
  return new Response(JSON.stringify({ 
    success: true, 
    action: "retention",
    compliant: isCompliant,
    message: isCompliant ? "数据保留策略符合要求" : "存在超过6个月的旧记录",
    statistics: {
      totalRecords: totalCount,
      recentRecords: recentRecordCount,
      oldRecords: oldRecordCount,
      oldestRecord,
      newestRecord,
      cutoffDate: cutoffDate.toISOString()
    },
    logs 
  }), { headers: { "Content-Type": "application/json" } });
}

// 获取数据库统计信息
async function getDatabaseStats(d1, log) {
  const logs = [];
  
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
  
  logs.push(`📊 [DEBUG] 数据库统计信息获取完成`);
  
  return new Response(JSON.stringify({ 
    success: true, 
    action: "stats",
    statistics: {
      totalRecords: totalCount,
      newestRecord,
      oldestRecord,
      recordsToday: todayCount,
      recordsThisMonth: monthCount
    },
    logs 
  }), { headers: { "Content-Type": "application/json" } });
}

// 获取清理状态（简化版）
async function getCleanupStatus(d1, log) {
  const logs = [];
  
  // 计算6个月前的日期
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 6);
  const cutoffTimestamp = cutoffDate.toISOString();
  
  // 获取超过6个月的记录数量（即下次清理将删除的记录数）
  const pendingResult = await d1.prepare(
    "SELECT COUNT(*) as count FROM face_scores WHERE timestamp < ?"
  )
  .bind(cutoffTimestamp)
  .first();
  
  const pendingDeletion = pendingResult?.count || 0;
  
  logs.push(`📊 [DEBUG] 清理状态检查完成`);
  logs.push(`📊 [DEBUG] 待删除记录数量: ${pendingDeletion}`);
  
  return new Response(JSON.stringify({ 
    success: true, 
    action: "cleanup-status",
    status: "ready",
    pendingDeletion,
    nextCleanupCutoff: cutoffDate.toISOString(),
    logs 
  }), { headers: { "Content-Type": "application/json" } });
}
