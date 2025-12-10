export async function onRequestGet(context) {
  const logs = [];
  
  function log(msg) {
    logs.push(msg);
    console.log(msg);
  }

  try {
    const d1 = context.env.FACE_SCORE_DB;
    const r2 = context.env.FACE_IMAGES;
    
    if (!d1) {
      return new Response(JSON.stringify({ 
        error: "D1 database not configured", 
        logs 
      }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    
    if (!r2) {
      log(`⚠️ [WARN] R2 bucket not configured, skipping image cleanup`);
    }

    log(`🐾 [DEBUG] 开始执行数据清理任务...`);

    // 计算6个月前的日期作为 cutoff
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 6);
    const cutoffTimestamp = cutoffDate.toISOString();
    
    log(`📅 [DEBUG] 清理截止日期: ${cutoffDate.toLocaleString()}`);
    log(`📅 [DEBUG] 清理截止时间戳: ${cutoffTimestamp}`);

    // 获取要删除的记录及其MD5
    const recordsToDelete = await d1.prepare(
      "SELECT id, md5 FROM face_scores WHERE timestamp < ?"
    )
    .bind(cutoffTimestamp)
    .all();
    
    const recordCount = recordsToDelete.results?.length || 0;
    log(`📊 [DEBUG] 准备删除 ${recordCount} 条旧记录`);
    
    // 如果有R2绑定，先删除对应的图片
    if (r2 && recordCount > 0) {
      log(`📤 [DEBUG] 开始清理R2中的旧图片...`);
      
      let deletedImages = 0;
      let failedImages = 0;
      
      // 批量删除R2图片
      for (const record of recordsToDelete.results) {
        const md5 = record.md5;
        const r2Key = `images/${md5}.jpg`;
        
        try {
          await r2.delete(r2Key);
          deletedImages++;
          log(`🗑️ [DEBUG] 已删除R2图片: ${r2Key}`);
        } catch (r2Error) {
          failedImages++;
          log(`❌ [ERROR] 删除R2图片失败 ${r2Key}: ${r2Error.message}`);
          // 继续处理其他图片
        }
      }
      
      log(`📊 [DEBUG] R2图片清理完成: 成功删除 ${deletedImages} 张图片，失败 ${failedImages} 张`);
    }
    
    // 开始事务删除D1记录
    await d1.exec("BEGIN TRANSACTION;");
    
    try {
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
