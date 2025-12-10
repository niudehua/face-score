// 导入模块
import { getRetentionStats, getStats, getCleanupStatus } from '../lib/db.js';

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
      return await getCleanupStatusApi(d1, log);
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
  
  // 检查数据保留策略
  const stats = await getRetentionStats(d1, cutoffTimestamp);
  
  logs.push(`📊 [DEBUG] 超过6个月的记录数量: ${stats.oldRecords}`);
  if (stats.oldestRecord) {
    logs.push(`📅 [DEBUG] 最早记录时间: ${new Date(stats.oldestRecord).toLocaleString()}`);
  }
  
  logs.push(`📊 [DEBUG] 最近6个月的记录数量: ${stats.recentRecords}`);
  if (stats.newestRecord) {
    logs.push(`📅 [DEBUG] 最新记录时间: ${new Date(stats.newestRecord).toLocaleString()}`);
  }
  
  logs.push(`📊 [DEBUG] 总记录数: ${stats.totalRecords}`);
  
  const isCompliant = stats.oldRecords === 0;
  
  return new Response(JSON.stringify({ 
    success: true, 
    action: "retention",
    compliant: isCompliant,
    message: isCompliant ? "数据保留策略符合要求" : "存在超过6个月的旧记录",
    statistics: {
      totalRecords: stats.totalRecords,
      recentRecords: stats.recentRecords,
      oldRecords: stats.oldRecords,
      oldestRecord: stats.oldestRecord,
      newestRecord: stats.newestRecord,
      cutoffDate: cutoffDate.toISOString()
    },
    logs 
  }), { headers: { "Content-Type": "application/json" } });
}

// 获取数据库统计信息
async function getDatabaseStats(d1, log) {
  const logs = [];
  
  // 获取基本统计信息
  const stats = await getStats(d1);
  
  logs.push(`📊 [DEBUG] 数据库统计信息获取完成`);
  
  return new Response(JSON.stringify({ 
    success: true, 
    action: "stats",
    statistics: {
      totalRecords: stats.totalRecords,
      newestRecord: stats.newestRecord,
      oldestRecord: stats.oldestRecord,
      recordsToday: stats.recordsToday,
      recordsThisMonth: stats.recordsThisMonth
    },
    logs 
  }), { headers: { "Content-Type": "application/json" } });
}

// 获取清理状态（简化版）
async function getCleanupStatusApi(d1, log) {
  const logs = [];
  
  // 计算6个月前的日期
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 6);
  const cutoffTimestamp = cutoffDate.toISOString();
  
  // 获取超过6个月的记录数量（即下次清理将删除的记录数）
  const cleanupStatus = await getCleanupStatus(d1, cutoffTimestamp);
  
  logs.push(`📊 [DEBUG] 清理状态检查完成`);
  logs.push(`📊 [DEBUG] 待删除记录数量: ${cleanupStatus.pendingDeletion}`);
  
  return new Response(JSON.stringify({ 
    success: true, 
    action: "cleanup-status",
    status: "ready",
    pendingDeletion: cleanupStatus.pendingDeletion,
    nextCleanupCutoff: cutoffDate.toISOString(),
    logs 
  }), { headers: { "Content-Type": "application/json" } });
}
