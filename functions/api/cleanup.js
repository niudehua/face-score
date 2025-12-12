// 导入模块
import { getOldRecords, deleteOldRecords } from '../lib/db.js';
import { deleteImage } from '../lib/storage.js';
import { rateLimit } from '../lib/rate-limit.js';
import { createSuccessResponse, createErrorResponse } from '../lib/response.js';
import { createLogger } from '../lib/logger.js';
import { RATE_LIMIT_CONFIG, HTTP_STATUS, DATA_RETENTION_MONTHS } from '../lib/constants.js';

export async function onRequestGet(context) {
  const logger = createLogger('cleanup-api');
  
  // 实施限流 - 管理端点，限制更严格
  const rateLimitResult = await rateLimit(context.request, context, {
    path: '/api/cleanup',
    ...RATE_LIMIT_CONFIG.CLEANUP
  });

  if (rateLimitResult.limited) {
    logger.warn('请求被限流', { ip: context.request.headers.get('CF-Connecting-IP') });
    return rateLimitResult.response;
  }

  try {
    const d1 = context.env.FACE_SCORE_DB;
    const r2 = context.env.FACE_IMAGES;
    
    if (!d1) {
      logger.error('D1数据库未配置');
      return createErrorResponse('D1数据库未配置', {
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        rateLimitInfo: rateLimitResult
      });
    }
    
    if (!r2) {
      logger.warn('R2存储桶未配置，跳过图片清理');
    }

    logger.info('开始执行数据清理任务');

    // 计算数据保留期限前的日期作为 cutoff
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - DATA_RETENTION_MONTHS);
    const cutoffTimestamp = cutoffDate.toISOString();
    
    logger.debug('清理截止日期', { 
      date: cutoffDate.toISOString(),
      retentionMonths: DATA_RETENTION_MONTHS
    });

    // 获取要删除的记录及其MD5
    const recordsToDelete = await getOldRecords(d1, cutoffTimestamp);
    const recordCount = recordsToDelete.length;
    logger.debug('准备删除旧记录', { count: recordCount });
    
    // 如果有R2绑定，先删除对应的图片
    let deletedImages = 0;
    let failedImages = 0;
    
    if (r2 && recordCount > 0) {
      logger.debug('开始清理R2中的旧图片');
      
      // 批量删除R2图片
      for (const record of recordsToDelete) {
        const md5 = record.md5;
        
        try {
          await deleteImage(r2, md5);
          deletedImages++;
        } catch (r2Error) {
          failedImages++;
          logger.error('删除R2图片失败', { md5, error: r2Error.message });
          // 继续处理其他图片
        }
      }
      
      logger.debug('R2图片清理完成', { 
        deleted: deletedImages, 
        failed: failedImages 
      });
    }
    
    // 执行删除操作
    const deleteResult = await deleteOldRecords(d1, cutoffTimestamp);
    const deletedCount = deleteResult.changes || 0;
    
    logger.info('数据清理完成', { 
      deletedRecords: deletedCount,
      deletedImages,
      failedImages
    });
    
    return createSuccessResponse({ 
      success: true, 
      message: `数据清理完成，成功删除 ${deletedCount} 条记录`,
      deletedCount,
      deletedImages,
      failedImages,
      cutoffDate: cutoffDate.toISOString()
    }, {
      rateLimitInfo: rateLimitResult
    });
    
  } catch (error) {
    logger.error('数据清理任务失败', error);
    return createErrorResponse('数据清理任务失败', {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      rateLimitInfo: rateLimitResult,
      logs: logger.getLogs(),
      debug: true
    });
  }
}
