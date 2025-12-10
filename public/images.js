// images.js

// 全局变量
let currentPage = 1;
let totalPages = 1;
let limit = 10;
let sortBy = 'timestamp';
let sortOrder = 'desc';
let dateFrom = '';
let dateTo = '';

// DOM元素
const imageGrid = document.getElementById('image-grid');
const loading = document.getElementById('loading');
const empty = document.getElementById('empty');
const pagination = document.getElementById('pagination');
const dateFromInput = document.getElementById('date-from');
const dateToInput = document.getElementById('date-to');
const sortBySelect = document.getElementById('sort-by');
const orderSelect = document.getElementById('order');
const applyFilterBtn = document.getElementById('apply-filter');
const resetFilterBtn = document.getElementById('reset-filter');

// 初始化事件监听
function initEventListeners() {
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
}

// 格式化时间
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN');
}

// 加载图片列表
async function loadImages(page = 1) {
  currentPage = page;
  
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
    const response = await fetch(url);
    const data = await response.json();
    
    // 处理响应
    if (data.data && Array.isArray(data.data)) {
      const images = data.data;
      totalPages = data.pagination.total_pages;
      
      if (images.length === 0) {
        // 显示空状态
        loading.style.display = 'none';
        empty.style.display = 'block';
      } else {
        // 渲染图片网格
        renderImageGrid(images);
        
        // 渲染分页
        renderPagination();
        
        // 隐藏加载状态
        loading.style.display = 'none';
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
    
    // 添加图片点击事件
    imageItem.addEventListener('click', () => {
      // 点击图片可以预览
      const modal = createImageModal(image.image_url, image);
      document.body.appendChild(modal);
    });
    
    imageItem.innerHTML = `
      <img src="${image.image_url}" alt="颜值图片">
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
  
  dateFrom = '';
  dateTo = '';
  sortBy = 'timestamp';
  sortOrder = 'desc';
  
  loadImages(1);
}

// 初始化
function init() {
  initEventListeners();
  loadImages();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
