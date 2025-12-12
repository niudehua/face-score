// images.js

// 全局变量
let currentPage = 1;
let totalPages = 1;
let totalCount = 0;
let limit = 20;
let sortBy = 'timestamp';
let sortOrder = 'desc';
let dateFrom = '';
let dateTo = '';
let selectedImages = new Set();
let deleteMode = false;
let isLoading = false;
let hasMore = true;

// DOM元素
const imageGrid = document.getElementById('image-grid');
const loading = document.getElementById('loading');
const empty = document.getElementById('empty');
const loadMoreTrigger = document.getElementById('load-more-trigger');
const loadMoreStatus = document.getElementById('load-more-status');
const noMoreData = document.getElementById('no-more-data');

const dateFromInput = document.getElementById('date-from');
const dateToInput = document.getElementById('date-to');
const sortBySelect = document.getElementById('sort-by');
const orderSelect = document.getElementById('order');

const applyFilterBtn = document.getElementById('apply-filter');
const resetFilterBtn = document.getElementById('reset-filter');
const batchDeleteBtn = document.getElementById('batch-delete');
const selectionActions = document.getElementById('selection-actions'); // New container
const confirmSelectionBtn = document.getElementById('confirm-selection');
const cancelDeleteBtn = document.getElementById('cancel-delete');
const totalCountDisplay = document.getElementById('total-count');
const usernameDisplay = document.getElementById('username-display');
const logoutBtn = document.getElementById('logout-btn');

// 初始化事件监听
function initEventListeners() {
  // 筛选和排序事件
  applyFilterBtn.addEventListener('click', applyFilter);
  resetFilterBtn.addEventListener('click', resetFilter);
  sortBySelect.addEventListener('change', (e) => {
    sortBy = e.target.value;
    loadImages();
  });
  orderSelect.addEventListener('change', (e) => {
    sortOrder = e.target.value;
    loadImages();
  });


  // 批量操作事件
  batchDeleteBtn.addEventListener('click', enterDeleteMode);
  confirmSelectionBtn.addEventListener('click', handleConfirmSelection);
  cancelDeleteBtn.addEventListener('click', exitDeleteMode);

  // 登录登出事件
  logoutBtn.addEventListener('click', handleLogout);
}

// 格式化时间
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN');
}

// 验证登录状态
async function verifyLogin() {
  try {
    const response = await fetch('/api/auth', {
      method: 'GET',
      credentials: 'include'
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        // 登录成功，显示用户名
        usernameDisplay.textContent = `欢迎，${data.data.username}`;
        return true;
      }
    }

    // 未登录或登录失败，跳转到GitHub登录页面
    window.location.href = '/api/auth/github';
    return false;
  } catch (error) {
    console.error('验证登录失败:', error);
    window.location.href = '/api/auth/github';
    return false;
  }
}

// 登出
async function handleLogout() {
  try {
    await fetch('/api/auth', {
      method: 'DELETE',
      credentials: 'include'
    });

    // 登出成功，跳转到首页
    window.location.href = '/';
  } catch (error) {
    console.error('登出失败:', error);
    alert('登出失败，请稍后重试');
  }
}


// 加载图片列表


async function loadImages(page = 1, isAppend = false) {
  // 如果正在加载或没有更多数据（且不是重新加载），则忽略
  if (isLoading) return;
  if (!hasMore && isAppend) return;

  isLoading = true;

  if (!isAppend) {
    // 如果是重新加载（第一页），清空列表和状态
    currentPage = 1;
    hasMore = true;
    imageGrid.innerHTML = '';
    selectedImages.clear();
    loading.style.display = 'block';
    empty.style.display = 'none';
    noMoreData.style.display = 'none';
    loadMoreStatus.style.display = 'none';
    // 隐藏sentinel以防初次加载太少触发
    loadMoreTrigger.style.display = 'none';
  } else {
    // 如果是加载更多
    loadMoreStatus.style.display = 'block';
    loadMoreTrigger.style.display = 'block';
  }

  try {
    // 构建请求URL
    let url = `/api/images?page=${page}&limit=${limit}&sort_by=${sortBy}&order=${sortOrder}`;

    // 添加时间筛选
    if (dateFrom) {
      url += `&date_from=${dateFrom}T00:00:00.000Z`;
    }
    if (dateTo) {
      url += `&date_to=${dateTo}T23:59:59.999Z`;
    }

    // 发送请求
    const response = await fetch(url, {
      credentials: 'include'
    });
    const data = await response.json();

    // 处理响应
    if (data.data && Array.isArray(data.data)) {
      const images = data.data;
      totalCount = data.pagination.total;

      // 更新总数显示
      totalCountDisplay.textContent = `共 ${totalCount} 条记录`;

      if (images.length === 0) {
        if (!isAppend) {
          loading.style.display = 'none';
          empty.style.display = 'block';
          loadMoreTrigger.style.display = 'none';
        } else {
          hasMore = false;
          loadMoreStatus.style.display = 'none';
          noMoreData.style.display = 'block';
        }
      } else {
        // 渲染图片网格
        renderImageGrid(images);

        // 更新当前页码
        currentPage = page;

        // 检查是否还有更多数据
        if (images.length < limit) {
          hasMore = false;
          noMoreData.style.display = 'block';
          loadMoreTrigger.style.display = 'none'; // 停止观察
        } else {
          hasMore = true;
          loadMoreTrigger.style.display = 'block'; // 确保sentinel可见
        }

        loading.style.display = 'none';
        loadMoreStatus.style.display = 'none';
      }
    } else if (data.error) {
      loading.style.display = 'none';
      loadMoreStatus.style.display = 'none';
      if (data.error === '未登录' || data.error === '会话已过期') {
        window.location.href = '/api/auth/github';
      } else {
        alert(data.error);
      }
    }
  } catch (error) {
    console.error('加载图片失败:', error);
    loading.style.display = 'none';
    loadMoreStatus.style.display = 'none';
    if (!isAppend) empty.style.display = 'block';
  } finally {
    isLoading = false;
  }
}

// 初始化无限滚动观察器
function initInfiniteScroll() {
  const observer = new IntersectionObserver((entries) => {
    // 如果sentinel可见，且有更多数据，且不在加载中
    if (entries[0].isIntersecting && hasMore && !isLoading) {
      loadImages(currentPage + 1, true);
    }
  }, {
    root: null,
    rootMargin: '100px', // 提前加载
    threshold: 0.1
  });

  if (loadMoreTrigger) {
    observer.observe(loadMoreTrigger);
  }
}

// 渲染图片网格
function renderImageGrid(images) {
  images.forEach(image => {
    const imageItem = document.createElement('div');
    imageItem.className = 'image-card';
    imageItem.dataset.id = image.id;

    // 渲染HTML
    imageItem.innerHTML = `
      <div class="image-wrapper">
        <img src="${image.image_url}" alt="颜值图片" loading="lazy">
        <div class="score-badge">${image.score.toFixed(1)}</div>
        <div class="selection-overlay"></div>
      </div>
      <div class="card-info">
        <div class="info-header">
          <span class="info-time">${formatTime(image.timestamp)}</span>
        </div>
        <div class="info-tags">
          <span class="tag">${image.gender}</span>
          <span class="tag">${image.age}岁</span>
        </div>
      </div>
    `;

    // 添加图片项点击事件
    imageItem.addEventListener('click', () => {
      // 如果是删除模式，切换选中状态
      if (deleteMode) {
        // 更新selectedImages集合
        const id = imageItem.dataset.id;
        const isSelected = selectedImages.has(id);

        if (isSelected) {
          selectedImages.delete(id);
        } else {
          selectedImages.add(id);
        }

        // 更新卡片样式
        updateImageItemStyle(imageItem, !isSelected);
      } else {
        // 非删除模式，显示预览
        const modal = createImageModal(image.image_url, image);
        document.body.appendChild(modal);
      }
    });

    imageGrid.appendChild(imageItem);
  });
}

// 更新图片项样式 (Now handled by CSS class .selected)
function updateImageItemStyle(imageItem, isSelected) {
  if (isSelected) {
    imageItem.classList.add('selected');
  } else {
    imageItem.classList.remove('selected');
  }
}

// 创建图片预览模态框
function createImageModal(imageUrl, imageData) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85); /* Slightly darker for focus */
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;

  modal.innerHTML = `
    <div class="modal-content" style="
      background: white; 
      padding: 0; 
      border-radius: 20px; 
      max-width: 90%; 
      width: 420px; /* Aligned with main container */
      max-height: 90vh; 
      overflow-y: auto; 
      text-align: center; 
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); 
      position: relative;
    ">
      <!-- Close Button -->
      <button id="close-modal-x" style="
        position: absolute;
        top: 15px;
        right: 15px;
        background: rgba(0, 0, 0, 0.1);
        color: #333;
        border: none;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        transition: all 0.2s;
        z-index: 10;
        padding: 0; /* Override default button padding */
      ">✕</button>

      <!-- Image Area -->
      <div style="background: #f9fafb; padding: 20px 20px 0 20px;">
         <img id="modal-image" src="${imageUrl}" style="
           max-width: 100%; 
           max-height: 55vh; 
           border-radius: 12px; 
           object-fit: contain; 
           box-shadow: var(--shadow-md);
           cursor: zoom-out; /* Hint that clicking closes/zooms out */
         ">
         <div style="height: 20px;"></div> <!-- Spacer -->
      </div>

      <!-- Info Area -->
      <div style="padding: 24px; text-align: left;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
           <h2 style="margin: 0; color: var(--text-main); font-size: 1.5rem;">颜值: ${imageData.score.toFixed(1)}</h2>
           <span style="background: #fff1f2; color: var(--primary-color); padding: 4px 12px; border-radius: 999px; font-size: 0.875rem; font-weight: 600;">${formatTime(imageData.timestamp)}</span>
        </div>
        <div style="display: flex; gap: 12px; margin-bottom: 16px; color: var(--text-secondary); font-size: 0.95rem;">
          <span style="background: #f3f4f6; padding: 4px 12px; border-radius: 6px;">${imageData.gender}</span>
          <span style="background: #f3f4f6; padding: 4px 12px; border-radius: 6px;">${imageData.age}岁</span>
        </div>
        <div style="background: #f9fafb; padding: 16px; border-radius: 12px; border: 1px solid #f3f4f6;">
           <p style="margin: 0; color: var(--text-secondary); line-height: 1.6;">${imageData.comment || '暂无点评'}</p>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => {
    document.body.removeChild(modal);
  };

  // Close on X button click
  modal.querySelector('#close-modal-x').addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent modal background click event
    closeModal();
  });

  // Close on Image click
  modal.querySelector('#modal-image').addEventListener('click', (e) => {
    e.stopPropagation();
    closeModal();
  });

  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  return modal;
}



// 应用筛选
function applyFilter() {
  dateFrom = dateFromInput.value;
  dateTo = dateToInput.value;
  loadImages(1);
}

// 重置筛选
function resetFilter() {
  dateFromInput.value = '';
  dateToInput.value = '';
  sortBySelect.value = 'timestamp';
  orderSelect.value = 'desc';


  dateFrom = '';
  dateTo = '';
  sortBy = 'timestamp';
  sortOrder = 'desc';
  limit = 20;

  loadImages(1);
}


// 显示悬浮提示
function showToast(message, duration = 2000) {
  // 创建toast元素
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #e85d75;
    color: white;
    padding: 16px 28px;
    border-radius: 50px;
    font-size: 16px;
    font-weight: 500;
    z-index: 10000;
    box-shadow: 0 8px 24px rgba(232, 93, 117, 0.35);
    animation: slideDownFade 2s ease;
    min-width: 250px;
    text-align: center;
  `;
  toast.textContent = message;

  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDownFade {
      0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      15% { opacity: 1; transform: translateX(-50%) translateY(0); }
      85% { opacity: 1; transform: translateX(-50%) translateY(0); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    }
  `;
  document.head.appendChild(style);

  // 添加到页面
  document.body.appendChild(toast);

  // 自动移除
  setTimeout(() => {
    document.body.removeChild(toast);
    if (document.head.contains(style)) {
      document.head.removeChild(style);
    }
  }, duration);
}

// 显示自定义确认对话框
function showConfirmDialog(title, message, confirmText = '确认', cancelText = '取消') {
  return new Promise((resolve) => {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      justify-content: center;
      align-items: center;
      animation: fadeIn 0.3s ease;
    `;

    // 创建对话框
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 25px;
      max-width: 450px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      animation: slideIn 0.3s ease;
    `;

    // 标题
    const dialogTitle = document.createElement('h3');
    dialogTitle.style.cssText = `
      margin: 0 0 15px 0;
      color: #e85d75;
      font-size: 20px;
      font-weight: 600;
    `;
    dialogTitle.textContent = title;
    dialog.appendChild(dialogTitle);

    // 内容
    const dialogContent = document.createElement('p');
    dialogContent.style.cssText = `
      margin: 0 0 25px 0;
      color: #666;
      font-size: 16px;
      line-height: 1.5;
    `;
    dialogContent.textContent = message;
    dialog.appendChild(dialogContent);

    // 按钮容器
    const buttonsContainer = document.createElement('div');
    buttonsContainer.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    `;
    dialog.appendChild(buttonsContainer);

    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = cancelText;
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      border: 1px solid #ddd;
      border-radius: 8px;
      background: #f0f0f0;
      color: #666;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.3s ease;
    `;
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(false);
    });
    buttonsContainer.appendChild(cancelBtn);

    // 确认按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = confirmText;
    confirmBtn.style.cssText = `
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      background: #e74c3c;
      color: white;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.3s ease;
    `;
    confirmBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(true);
    });
    buttonsContainer.appendChild(confirmBtn);

    // 添加悬停效果
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = '#e0e0e0';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = '#f0f0f0';
    });

    confirmBtn.addEventListener('mouseenter', () => {
      confirmBtn.style.background = '#c0392b';
    });
    confirmBtn.addEventListener('mouseleave', () => {
      confirmBtn.style.background = '#e74c3c';
    });

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideIn {
        from { opacity: 0; transform: translateY(-20px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);

    // 添加到页面
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // 点击遮罩层关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(false);
      }
    });

    // 按ESC键关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(overlay);
        resolve(false);
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  });
}

// 进入删除模式
function enterDeleteMode() {
  deleteMode = true;
  // 显示确认选择和取消按钮，隐藏批量删除按钮
  batchDeleteBtn.style.display = 'none';
  if (selectionActions) selectionActions.style.display = 'flex'; // Show container
  
  // 清空之前的选择
  selectedImages.clear();
  // 更新所有卡片样式
  document.querySelectorAll('.image-card').forEach(item => {
    item.classList.add('deleting'); // Add visual cue for delete mode
    updateImageItemStyle(item, false);
  });
  // 显示操作提示
  showToast('已进入批量管理模式，请选择图片', 2000);
}

// 退出删除模式
function exitDeleteMode() {
  deleteMode = false;
  // 恢复批量删除按钮，隐藏确认和取消按钮
  batchDeleteBtn.style.display = 'inline-flex';
  if (selectionActions) selectionActions.style.display = 'none'; // Hide container

  // 清空选择
  selectedImages.clear();
  // 更新所有卡片样式
  document.querySelectorAll('.image-card').forEach(item => {
    item.classList.remove('deleting'); // Remove visual cue
    updateImageItemStyle(item, false);
  });
}

// 确认选择的图片
async function handleConfirmSelection() {
  if (selectedImages.size === 0) {
    showToast('请选择要删除的图片', 2000);
    return;
  }

  // 输出选中的ID，便于调试
  console.log('准备删除的图片ID:', Array.from(selectedImages));
  console.log('选中的图片数量:', selectedImages.size);

  // 第一次确认：确认选择的图片数量
  const firstConfirm = await showConfirmDialog(
    '确认选择',
    `您已选择 ${selectedImages.size} 张图片，确定要继续吗？`,
    '继续删除',
    '取消选择'
  );

  if (!firstConfirm) {
    return;
  }

  // 第二次确认：最终确认删除
  const secondConfirm = await showConfirmDialog(
    '最终确认',
    `确定要删除选中的 ${selectedImages.size} 张图片吗？删除后不可恢复！`,
    '确认删除',
    '取消删除'
  );

  if (!secondConfirm) {
    return;
  }

  // 执行删除操作
  try {
    const response = await fetch('/api/images', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ ids: Array.from(selectedImages) })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showToast(`成功删除 ${data.deletedFromD1} 张图片`, 2000);
      exitDeleteMode();
      loadImages(); // 重新加载当前页
    } else {
      showToast(data.error || '批量删除失败', 2000);
    }
  } catch (error) {
    console.error('批量删除失败:', error);
    showToast('批量删除失败，请稍后重试', 2000);
  }
}

// 处理批量删除（保留原函数名，防止调用错误）
async function handleBatchDelete() {
  // 兼容旧调用，直接进入删除模式
  enterDeleteMode();
}

// 初始化
async function init() {
  // 验证登录状态
  const isLoggedIn = await verifyLogin();
  if (!isLoggedIn) {
    return;
  }

  initEventListeners();
  initInfiniteScroll();
  loadImages();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
