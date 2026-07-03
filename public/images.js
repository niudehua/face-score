let currentPage = 1;
let limit = 30;
let hasMore = true;
let isLoading = false;
let deleteMode = false;
let selectedImages = new Set();
let totalCount = 0;

const imageGrid = document.getElementById('image-grid');
const loading = document.getElementById('loading');
const empty = document.getElementById('empty');
const loadMoreTrigger = document.getElementById('load-more-trigger');
const loadMoreStatus = document.getElementById('load-more-status');
const totalCountDisplay = document.getElementById('total-count');
const manageBtn = document.getElementById('manage-btn');
const bottomBar = document.getElementById('bottom-bar');
const selectionCountDisplay = document.getElementById('selection-count');
const deleteBtn = document.getElementById('delete-btn');

const previewModal = document.getElementById('preview-modal');
const previewImage = document.getElementById('preview-image');
const previewScore = document.querySelector('.preview-score');
const previewDate = document.querySelector('.preview-date');
const previewComment = document.getElementById('preview-comment');

document.addEventListener('DOMContentLoaded', async () => {
  const isLoggedIn = await verifyLogin();
  if (!isLoggedIn) return;

  initEventListeners();
  initInfiniteScroll();
  loadImages();
});

function initEventListeners() {
  manageBtn.addEventListener('click', toggleManageMode);
  deleteBtn.addEventListener('click', handleDelete);
}

async function verifyLogin() {
  const MAX_RETRIES = 3;
  const WINDOW_MS = 30000;

  const now = Date.now();
  let authState = JSON.parse(sessionStorage.getItem('auth_state') || '{"count": 0, "start": 0}');

  if (now - authState.start > WINDOW_MS) {
    authState = { count: 0, start: now };
  }

  if (authState.count >= MAX_RETRIES) {
    console.error('Too many auth redirects detected, stopping loop.');
    document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#333;padding:20px;text-align:center;">
        <h2 style="margin-bottom:10px;">认证重试次数过多</h2>
        <p style="margin-bottom:20px;color:#666;">检测到登录循环。请尝试清除浏览器 Cookie 或稍后重试。</p>
        <button onclick="sessionStorage.removeItem('auth_state');window.location.reload();" style="padding:10px 20px;background:#000;color:#fff;border:none;border-radius:6px;cursor:pointer;">重试</button>
        <a href="/" style="margin-top:15px;color:#666;text-decoration:none;font-size:14px;">返回首页</a>
      </div>
    `;
    return false;
  }

  try {
    const res = await fetch('/api/auth', { credentials: 'include' });

    if (res.status === 429) {
      console.warn('Auth check rate limited');
      return false;
    }

    const data = await res.json();
    if (data.success) {
      sessionStorage.removeItem('auth_state');
      return true;
    }

    authState.count++;
    sessionStorage.setItem('auth_state', JSON.stringify(authState));

    window.location.href = '/api/auth/github';
    return false;
  } catch (e) {
    console.error('Auth verification error:', e);
    authState.count++;
    sessionStorage.setItem('auth_state', JSON.stringify(authState));

    window.location.href = '/api/auth/github';
    return false;
  }
}

async function loadImages(page = 1, isAppend = false) {
  if (isLoading) return;
  if (isAppend && !hasMore) return;

  isLoading = true;
  if (!isAppend) {
    imageGrid.innerHTML = '';
    loading.style.display = 'block';
    empty.style.display = 'none';
    loadMoreTrigger.style.display = 'none';
  } else {
    loadMoreStatus.style.display = 'block';
  }

  try {
    const res = await fetch(`/api/images?page=${page}&limit=${limit}&sort_by=timestamp&order=desc`, {
      credentials: 'include'
    });
    const data = await res.json();

    if (data.data) {
      totalCount = data.pagination.total;
      totalCountDisplay.textContent = `${totalCount} 张照片`;

      if (data.data.length === 0 && !isAppend) {
        loading.style.display = 'none';
        empty.style.display = 'block';
      } else {
        renderImages(data.data);

        if (data.data.length < limit) {
          hasMore = false;
          loadMoreTrigger.style.display = 'none';
        } else {
          hasMore = true;
          loadMoreTrigger.style.display = 'block';
        }

        currentPage = page;
        loading.style.display = 'none';
        loadMoreStatus.style.display = 'none';
      }
    }
  } catch (e) {
    console.error(e);
    loading.style.display = 'none';
  } finally {
    isLoading = false;
  }
}

function renderImages(images) {
  const fragment = document.createDocumentFragment();

  images.forEach(img => {
    const card = document.createElement('div');
    card.className = 'image-card';
    if (deleteMode) card.classList.add('deleting');
    if (selectedImages.has(img.id)) card.classList.add('selected');

    card.dataset.id = img.id;

    card.innerHTML = `
      <div class="image-wrapper">
        <img src="${img.image_url}" loading="lazy">
      </div>
      <div class="selection-overlay"></div>
    `;

    card.addEventListener('click', () => handleCardClick(img));
    fragment.appendChild(card);
  });

  imageGrid.appendChild(fragment);
}

function handleCardClick(img) {
  if (deleteMode) {
    const card = document.querySelector(`.image-card[data-id="${img.id}"]`);
    if (selectedImages.has(img.id)) {
      selectedImages.delete(img.id);
      card.classList.remove('selected');
    } else {
      selectedImages.add(img.id);
      card.classList.add('selected');
    }
    updateSelectionUI();
  } else {
    showPreview(img);
  }
}

function toggleManageMode() {
  deleteMode = !deleteMode;

  if (deleteMode) {
    manageBtn.textContent = '完成';
    bottomBar.classList.add('visible');
    document.querySelectorAll('.image-card').forEach(c => c.classList.add('deleting'));
  } else {
    manageBtn.textContent = '管理';
    bottomBar.classList.remove('visible');
    document.querySelectorAll('.image-card').forEach(c => {
      c.classList.remove('deleting');
      c.classList.remove('selected');
    });
    selectedImages.clear();
    updateSelectionUI();
  }
}

function updateSelectionUI() {
  selectionCountDisplay.textContent = `已选择 ${selectedImages.size} 张`;
  deleteBtn.disabled = selectedImages.size === 0;
}

async function handleDelete() {
  if (selectedImages.size === 0) return;

  const count = selectedImages.size;
  if (!confirm(`确定要删除这 ${count} 张照片吗？`)) return;

  try {
    deleteBtn.textContent = '删除中...';
    deleteBtn.disabled = true;

    const res = await fetch('/api/images', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedImages) })
    });

    const data = await res.json();

    if (data.success) {
      selectedImages.forEach(id => {
        const card = document.querySelector(`.image-card[data-id="${id}"]`);
        if (card) card.remove();
      });

      toggleManageMode();

      totalCount -= count;
      totalCountDisplay.textContent = `${totalCount} 张照片`;

      if (totalCount === 0) {
        empty.style.display = 'block';
      }

      alert(`成功删除 ${count} 张照片`);
    } else {
      alert('删除失败: ' + data.error);
    }
  } catch (e) {
    alert('操作失败');
  } finally {
    deleteBtn.textContent = '删除';
    deleteBtn.disabled = false;
  }
}

function showPreview(img) {
  previewImage.src = img.image_url;
  previewScore.textContent = img.score ? img.score.toFixed(1) : '0.0';
  previewDate.textContent = new Date(img.timestamp).toLocaleString();
  previewComment.textContent = img.comment || '';
  previewModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

window.closePreview = function() {
  previewModal.style.display = 'none';
  document.body.style.overflow = '';
}

function initInfiniteScroll() {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMore && !isLoading) {
      loadImages(currentPage + 1, true);
    }
  });
  observer.observe(loadMoreTrigger);
}