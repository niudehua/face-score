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

    log(`🐾 [DEBUG] 开始执行数据清理任务...`);

    // 计算6个月前的日期作为 cutoff
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);
    const cutoffTimestamp = cutoffDate.toISOString();
    
    log(`📅 [DEBUG] 清理截止日期: ${cutoffDate.toLocaleString()}`);
    log(`📅 [DEBUG] 清理截止时间戳: ${cutoffTimestamp}`);

    // 开始事务
    await d1.exec("BEGIN TRANSACTION;");
    
    try {
      // 获取要删除的记录数量（用于日志）
      const countResult = await d1.prepare(
        "SELECT COUNT(*) as count FROM face_scores WHERE timestamp < ?"
      )
      .bind(cutoffTimestamp)
      .first();
      
      const recordCount = countResult?.count || 0;
      log(`📊 [DEBUG] 准备删除 ${recordCount} 条旧记录`);
      
      // 执行删除操作
      const deleteResult = await d1.prepare(
        "DELETE FROM face_scores WHERE timestamp < ?"
      )
      .bind(cutoffTimestamp)
      .run();
      
      // 提交事务
      await d1.exec("COMMIT;");
      
      const deletedCount = deleteResult.changes || 0;
      log(`✅ [INFO] 数据清理完成，成功删除 ${deletedCount} 条记录`);
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: `数据清理完成，成功删除 ${deletedCount} 条记录`,
        deletedCount,
        cutoffDate: cutoffDate.toISOString(),
        logs 
      }), { headers: { "Content-Type": "application/json" } });
      
    } catch (transactionError) {
      // 回滚事务
      await d1.exec("ROLLBACK;");
      log(`❌ [ERROR] 事务执行失败，已回滚: ${transactionError.message}`);
      throw transactionError;
    }
    
  } catch (error) {
    log(`❌ [ERROR] 数据清理任务失败: ${error.message}`);
    return new Response(JSON.stringify({ 
      error: "数据清理任务失败", 
      detail: error.message, 
      logs 
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
