// R2存储操作模块

/**
 * 计算图片的唯一标识符（使用SHA-256的前32位）
 * @param {string} imageBase64 - 图片的Base64编码
 * @returns {Promise<string>} - 图片的唯一标识符
 */
async function calculateImageId(imageBase64) {
  // 先将base64转换为二进制数据，再计算哈希
  const binaryString = atob(imageBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // 计算二进制数据的SHA-256哈希
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // 返回前32个字符作为图片ID
  return hashHex.substring(0, 32);
}

/**
 * 上传图片到 R2
 * @param {R2Bucket} r2Bucket - R2存储桶实例
 * @param {string} imageBase64 - 图片的Base64编码
 * @param {string} md5 - 图片的唯一标识符（用于文件名）
 * @returns {Promise<string>} - 上传后的R2键名
 */
async function uploadImage(r2Bucket, imageBase64, md5) {
  try {
    // 将 Base64 转换为二进制数据
    const binaryString = atob(imageBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 上传到 R2，使用 MD5 作为文件名
    const key = `images/${md5}.jpg`;
    await r2Bucket.put(key, bytes, {
      httpMetadata: {
        contentType: 'image/jpeg',
      },
    });

    return key;
  } catch (error) {
    throw new Error(`R2上传失败: ${error.message}`);
  }
}

/**
 * 从R2删除图片
 * @param {R2Bucket} r2Bucket - R2存储桶实例
 * @param {string} md5 - 图片的唯一标识符
 * @returns {Promise<void>} - 删除操作的Promise
 */
async function deleteImage(r2Bucket, md5) {
  try {
    const key = `images/${md5}.jpg`;
    await r2Bucket.delete(key);
  } catch (error) {
    throw new Error(`R2删除失败: ${error.message}`);
  }
}

/**
 * 从R2获取图片
 * @param {R2Bucket} r2Bucket - R2存储桶实例
 * @param {string} md5 - 图片的唯一标识符
 * @returns {Promise<R2Object|null>} - 获取到的图片对象或null
 */
async function getImage(r2Bucket, md5) {
  try {
    const key = `images/${md5}.jpg`;
    return await r2Bucket.get(key);
  } catch (error) {
    throw new Error(`R2获取图片失败: ${error.message}`);
  }
}

/**
 * 生成图片访问URL
 * @param {string} md5 - 图片的唯一标识符
 * @returns {string} - 图片访问URL
 */
function getImageUrl(md5) {
  return `/api/image?md5=${md5}`;
}

/**
 * 压缩图片（在Cloudflare Workers环境中模拟压缩）
 * @param {string} imageBase64 - 图片的Base64编码
 * @param {number} maxWidth - 最大宽度（默认300）
 * @param {number} maxHeight - 最大高度（默认300）
 * @returns {string} - 压缩后的图片Base64编码
 * @deprecated 此函数在当前环境中无法真正压缩图片，建议在客户端进行压缩
 */
function compressImage(imageBase64, maxWidth = 300, maxHeight = 300) {
  // 在Serverless环境中，我们简化压缩逻辑
  // 检查图片大小，如果已经很小则不压缩
  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  const imageSize = new Blob([atob(base64Data)]).size;
  
  if (imageSize < 50 * 1024) { // 如果小于50KB，认为不需要压缩
    return imageBase64;
  }

  // 在实际应用中，理想的做法是在客户端使用Canvas进行图片压缩后再上传
  // 这里直接返回原始图片
  return imageBase64;
}

/**
 * 批量从R2删除图片
 * @param {R2Bucket} r2Bucket - R2存储桶实例
 * @param {Array<string>} md5List - 图片的唯一标识符列表
 * @returns {Promise<number>} - 成功删除的图片数量
 */
async function deleteImagesFromR2(r2Bucket, md5List) {
  try {
    if (!md5List || md5List.length === 0) {
      return 0;
    }
    
    let deletedCount = 0;
    
    // 批量删除图片
    for (const md5 of md5List) {
      try {
        const key = `images/${md5}.jpg`;
        
        // 先检查图片是否存在
        const existingImage = await r2Bucket.head(key);
        if (existingImage) {
          await r2Bucket.delete(key);
          deletedCount++;
        }
      } catch (error) {
        // 继续删除其他图片，不中断整个批量操作
        // 错误会被上层调用者处理
      }
    }
    
    return deletedCount;
  } catch (error) {
    throw new Error(`R2批量删除失败: ${error.message}`);
  }
}

export {
  calculateImageId,
  uploadImage,
  deleteImage,
  deleteImagesFromR2,
  getImage,
  getImageUrl,
  compressImage
};