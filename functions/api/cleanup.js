// 导入模块
import {
  getOldRecords,
  deleteOldRecords,
  getOldCoupleRecords,
  deleteOldCoupleRecords,
  getReferencedImageIds,
  enqueueImageDeletions,
  getQueuedImageDeletions,
  removeQueuedImageDeletions,
  recordImageDeletionFailures
} from '../lib/db.js';
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
    const coupleRecordsToDelete = await getOldCoupleRecords(d1, cutoffTimestamp);
    const recordCount = recordsToDelete.length;
    logger.debug('准备删除旧记录', {
      scoreRecords: recordCount,
      coupleRecords: coupleRecordsToDelete.length
    });

    const candidateImageIds = [
      ...recordsToDelete.map(record => record.md5),
      ...coupleRecordsToDelete.flatMap(record => [record.md5_a, record.md5_b])
    ];

    // 先持久化待删 MD5，再删分析行。即使任务中断，下一次仍能重试 R2 删除。
    await enqueueImageDeletions(d1, candidateImageIds);

    // 删除过期 D1 引用，再处理队列；共享照片仍会被引用检查拦住。
    const deleteResult = await deleteOldRecords(d1, cutoffTimestamp);
    const coupleDeleteResult = coupleRecordsToDelete.length > 0
      ? await deleteOldCoupleRecords(d1, cutoffTimestamp)
      : { changes: 0, meta: { changes: 0 } };

    // 删除没有剩余引用的 R2 图片；失败项留在队列里供后续重试。
    let deletedImages = 0;
    let failedImages = 0;
    let pendingImageDeletes = 0;

    if (r2) {
      const queuedImageIds = await getQueuedImageDeletions(d1);
      logger.debug('开始清理R2中的旧图片');

      for (const md5 of queuedImageIds) {
        const stillReferenced = await getReferencedImageIds(d1, [md5]);
        if (stillReferenced.includes(md5)) {
          await removeQueuedImageDeletions(d1, [md5]);
          continue;
        }
        try {
          await deleteImage(r2, md5);
          deletedImages++;
          await removeQueuedImageDeletions(d1, [md5]);
        } catch (r2Error) {
          failedImages++;
          pendingImageDeletes++;
          await recordImageDeletionFailures(d1, [md5], r2Error);
          logger.error('删除R2图片失败', { md5, error: r2Error.message });
          // 继续处理其他图片
        }
      }
      
      logger.debug('R2图片清理完成', { 
        deleted: deletedImages, 
        failed: failedImages,
        pending: pendingImageDeletes
      });
      pendingImageDeletes = (await getQueuedImageDeletions(d1)).length;
    } else {
      pendingImageDeletes = (await getQueuedImageDeletions(d1)).length;
    }
    
    const deletedCount = deleteResult.changes || 0;
    const deletedCoupleCount = coupleDeleteResult.changes ?? coupleDeleteResult.meta?.changes ?? 0;
    
    logger.info('数据清理完成', { 
      deletedRecords: deletedCount,
      deletedCoupleRecords: deletedCoupleCount,
      deletedImages,
      failedImages,
      pendingImageDeletes
    });
    
    return createSuccessResponse({ 
      success: true, 
      message: `数据清理完成，成功删除 ${deletedCount} 条记录`,
      deletedCount,
      deletedCoupleCount,
      deletedImages,
      failedImages,
      pendingImageDeletes,
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
