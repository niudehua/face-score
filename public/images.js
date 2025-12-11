// images.js

// 全局变量
let currentPage = 1;
let totalPages = 1;
let totalCount = 0;
let limit = 10;
let sortBy = 'timestamp';
let sortOrder = 'desc';
let dateFrom = '';
let dateTo = '';
let selectedImages = new Set();
let deleteMode = false;

// DOM元素
const imageGrid = document.getElementById('image-grid');
const loading = document.getElementById('loading');
const empty = document.getElementById('empty');
const pagination = document.getElementById('pagination');
const dateFromInput = document.getElementById('date-from');
const dateToInput = document.getElementById('date-to');
const sortBySelect = document.getElementById('sort-by');
const orderSelect = document.getElementById('order');
const limitSelect = document.getElementById('limit');
const applyFilterBtn = document.getElementById('apply-filter');
const resetFilterBtn = document.getElementById('reset-filter');
const selectAllCheckbox = document.getElementById('select-all');
const batchDeleteBtn = document.getElementById('batch-delete');
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
  limitSelect.addEventListener('input', (e) => {
    // 验证输入值在1-100之间
    let value = parseInt(e.target.value);
    if (isNaN(value) || value < 1) {
      value = 1;
    } else if (value > 100) {
      value = 100;
    }
    e.target.value = value;
    limit = value;
  });
  limitSelect.addEventListener('change', (e) => {
    loadImages(1); // 重置到第一页
  });
  
  // 批量操作事件
  selectAllCheckbox.addEventListener('change', handleSelectAll);
  batchDeleteBtn.addEventListener('click', enterDeleteMode);
  confirmSelectionBtn.addEventListener('click', handleConfirmSelection);
  cancelDeleteBtn.addEventListener('click', exitDeleteMode);
  
  // 事件委托：监听图片复选框点击
  imageGrid.addEventListener('change', (e) => {
    if (e.target.classList.contains('image-checkbox')) {
      const id = e.target.dataset.id;
      if (e.target.checked) {
        selectedImages.add(id);
      } else {
        selectedImages.delete(id);
      }
      updateSelectAllStatus();
    }
  });
  
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
    
    // 未登录或登录失败，跳转到登录页面
    window.location.href = '/login.html';
    return false;
  } catch (error) {
    console.error('验证登录失败:', error);
    window.location.href = '/login.html';
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
    
    // 登出成功，跳转到登录页面
    window.location.href = '/login.html';
  } catch (error) {
    console.error('登出失败:', error);
    alert('登出失败，请稍后重试');
  }
}

// 动态调整图片大小
function adjustImageSize() {
  const imageGrid = document.getElementById('image-grid');
  let columns = 4; // 默认4列
  
  // 根据limit调整列数
  if (limit === 20) {
    columns = 5;
  } else if (limit === 50) {
    columns = 6;
  } else if (limit === 100) {
    columns = 8;
  }
  
  // 设置grid-template-columns
  imageGrid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${Math.floor(100 / columns)}%, 1fr))`;
}

// 加载图片列表
async function loadImages(page = 1) {
  currentPage = page;
  selectedImages.clear(); // 清空选择
  selectAllCheckbox.checked = false; // 取消全选
  
  // 显示加载状态
  imageGrid.innerHTML = '';
  loading.style.display = 'block';
  empty.style.display = 'none';
  pagination.innerHTML = '';
  
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
      totalPages = data.pagination.total_pages;
      totalCount = data.pagination.total;
      
      // 显示总条数
      totalCountDisplay.textContent = `共 ${totalCount} 条记录`;
      
      if (images.length === 0) {
        // 显示空状态
        loading.style.display = 'none';
        empty.style.display = 'block';
      } else {
        // 调整图片大小
        adjustImageSize();
        
        // 渲染图片网格
        renderImageGrid(images);
        
        // 渲染分页
        renderPagination();
        
        // 隐藏加载状态
        loading.style.display = 'none';
      }
    } else if (data.error) {
      loading.style.display = 'none';
      if (data.error === '未登录' || data.error === '会话已过期') {
        // 未登录或会话过期，跳转到登录页面
        window.location.href = '/login.html';
      } else {
        alert(data.error);
      }
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    console.error('加载图片失败:', error);
    loading.style.display = 'none';
    empty.style.display = 'block';
  }
}

// 渲染图片网格
function renderImageGrid(images) {
  images.forEach(image => {
    const imageItem = document.createElement('div');
    imageItem.className = 'image-item';
    
    // 添加图片点击事件（预览）
    imageItem.addEventListener('click', () => {
      // 点击图片可以预览
      const modal = createImageModal(image.image_url, image);
      document.body.appendChild(modal);
    });
    
    // 渲染HTML
    imageItem.innerHTML = `
      <div style="position: relative;">
        <img src="${image.image_url}" alt="颜值图片">
        <div style="position: absolute; top: 10px; left: 10px; z-index: 10;">
          <input type="checkbox" class="image-checkbox" data-id="${image.id}" style="width: 20px; height: 20px; cursor: pointer;">
        </div>
      </div>
      <div class="image-info">
        <h3>颜值: ${image.score.toFixed(1)}</h3>
        <p>性别: ${image.gender}</p>
        <p>年龄: ${image.age}</p>
        <p>${formatTime(image.timestamp)}</p>
      </div>
    `;
    
    imageGrid.appendChild(imageItem);
  });
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
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;
  
  modal.innerHTML = `
    <div style="background: white; padding: 20px; border-radius: 12px; max-width: 90%; max-height: 90%; overflow: auto;">
      <img src="${imageUrl}" style="max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 20px;">
      <div style="margin-bottom: 20px;">
        <h2>颜值: ${imageData.score.toFixed(1)}</h2>
        <p>性别: ${imageData.gender}</p>
        <p>年龄: ${imageData.age}</p>
        <p>时间: ${formatTime(imageData.timestamp)}</p>
        <p>点评: ${imageData.comment}</p>
      </div>
      <button id="close-modal" style="
        background: #e85d75;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 16px;
      ">关闭</button>
    </div>
  `;
  
  // 添加关闭事件
  const closeBtn = modal.querySelector('#close-modal');
  closeBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  // 点击模态框背景关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
  
  return modal;
}

// 渲染分页
function renderPagination() {
  if (totalPages <= 1) {
    return;
  }
  
  // 上一页按钮
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '上一页';
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      loadImages(currentPage - 1);
    }
  });
  pagination.appendChild(prevBtn);
  
  // 页码按钮
  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);
  
  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.textContent = i;
    pageBtn.className = i === currentPage ? 'active' : '';
    pageBtn.addEventListener('click', () => {
      loadImages(i);
    });
    pagination.appendChild(pageBtn);
  }
  
  // 下一页按钮
  const nextBtn = document.createElement('button');
  nextBtn.textContent = '下一页';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      loadImages(currentPage + 1);
    }
  });
  pagination.appendChild(nextBtn);
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
  limitSelect.value = '10';
  
  dateFrom = '';
  dateTo = '';
  sortBy = 'timestamp';
  sortOrder = 'desc';
  limit = 10;
  
  loadImages(1);
}

// 处理全选
function handleSelectAll() {
  const isChecked = selectAllCheckbox.checked;
  const checkboxes = document.querySelectorAll('.image-checkbox');
  
  checkboxes.forEach(checkbox => {
    checkbox.checked = isChecked;
    const id = checkbox.dataset.id;
    if (isChecked) {
      selectedImages.add(id);
    } else {
      selectedImages.delete(id);
    }
  });
}

// 更新全选状态
function updateSelectAllStatus() {
  const checkboxes = document.querySelectorAll('.image-checkbox');
  const total = checkboxes.length;
  const checked = selectedImages.size;
  
  selectAllCheckbox.checked = total > 0 && checked === total;
  selectAllCheckbox.indeterminate = checked > 0 && checked < total;
}

// 进入删除模式
function enterDeleteMode() {
  deleteMode = true;
  // 显示确认选择和取消按钮，隐藏批量删除按钮
  batchDeleteBtn.style.display = 'none';
  confirmSelectionBtn.style.display = 'inline-block';
  cancelDeleteBtn.style.display = 'inline-block';
  // 清空之前的选择
  selectedImages.clear();
  selectAllCheckbox.checked = false;
  // 更新所有复选框状态
  document.querySelectorAll('.image-checkbox').forEach(checkbox => {
    checkbox.checked = false;
  });
  // 显示操作提示
  alert('已进入删除模式，请选择要删除的图片');
}

// 退出删除模式
function exitDeleteMode() {
  deleteMode = false;
  // 恢复批量删除按钮，隐藏确认和取消按钮
  batchDeleteBtn.style.display = 'inline-block';
  confirmSelectionBtn.style.display = 'none';
  cancelDeleteBtn.style.display = 'none';
  // 清空选择
  selectedImages.clear();
  selectAllCheckbox.checked = false;
  selectAllCheckbox.indeterminate = false;
  // 更新所有复选框状态
  document.querySelectorAll('.image-checkbox').forEach(checkbox => {
    checkbox.checked = false;
  });
}

// 确认选择的图片
async function handleConfirmSelection() {
  if (selectedImages.size === 0) {
    alert('请选择要删除的图片');
    return;
  }
  
  // 第一次确认：确认选择的图片数量
  if (!confirm(`您已选择 ${selectedImages.size} 张图片，确定要继续吗？`)) {
    return;
  }
  
  // 第二次确认：最终确认删除
  if (!confirm(`确定要删除选中的 ${selectedImages.size} 张图片吗？删除后不可恢复！`)) {
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
      alert(`成功删除 ${data.deletedFromD1} 张图片`);
      exitDeleteMode();
      loadImages(); // 重新加载当前页
    } else {
      alert(data.error || '批量删除失败');
    }
  } catch (error) {
    console.error('批量删除失败:', error);
    alert('批量删除失败，请稍后重试');
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
  loadImages();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
