let currentPage = 1;
let limit = 30;
let hasMore = true;
let isLoading = false;
let deleteMode = false;
let selectedImages = new Set();
let totalCount = 0;
const photoGroups = new Map();

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
const previewContent = document.querySelector('.preview-content');
const previewImage = document.getElementById('preview-image');
const previewImageB = document.getElementById('preview-image-b');
const previewPhotoB = document.getElementById('preview-photo-b');
const previewHeart = document.getElementById('preview-heart');
const previewScore = document.querySelector('.preview-score');
const previewDate = document.querySelector('.preview-date');
const previewComment = document.getElementById('preview-comment');
const previewType = document.getElementById('preview-type');
const previewScoreLabel = document.getElementById('preview-score-label');
const previewTabs = document.getElementById('preview-analysis-tabs');
const deleteAnalysisBtn = document.getElementById('delete-analysis-btn');
let activePreviewGroup = null;
let activePreviewIndex = 0;

function getAnalysisTypeLabel(type) {
  return ({
    score: '颜值评分',
    fortune: '气质解读',
    couple: 'CP匹配'
  })[type] || '分析记录';
}

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
  deleteAnalysisBtn.addEventListener('click', deletePreviewAnalysis);
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
    photoGroups.clear();
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
      totalCountDisplay.textContent = `共 ${totalCount} 条分析 · 已加载 ${photoGroups.size} 张照片`;

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
  images.forEach(img => {
    const type = img.analysis_type || 'score';
    const hashes = type === 'couple' ? [img.md5, img.md5_b].filter(Boolean).sort() : [img.md5].filter(Boolean);
    const key = hashes.length ? `${type}:${hashes.join(':')}` : `${type}:id:${img.id}`;
    let group = photoGroups.get(key);
    if (!group) {
      group = { key, records: [], card: null };
      photoGroups.set(key, group);
    }
    if (group.records.some(record => record.id === img.id)) return;
    group.records.push(img);
    if (!group.card) createPhotoGroupCard(group, img);
    updatePhotoGroupCard(group);
  });
  totalCountDisplay.textContent = `共 ${totalCount} 条分析 · 已加载 ${photoGroups.size} 张照片`;
}

function createPhotoGroupCard(group, img) {
  const card = document.createElement('div');
  card.className = 'image-card';
  if (img.analysis_type === 'couple' && img.image_url_b) card.classList.add('couple-card');
  if (deleteMode) card.classList.add('deleting');
  card.dataset.groupKey = group.key;
  const imageContent = img.analysis_type === 'couple' && img.image_url_b
    ? `<div class="image-wrapper couple-image-wrapper">
         <div class="couple-thumb-person"><img src="${img.image_url}" alt="CP匹配照片 A" loading="lazy"><span class="couple-thumb-label">A</span></div>
         <div class="couple-thumb-person"><img src="${img.image_url_b}" alt="CP匹配照片 B" loading="lazy"><span class="couple-thumb-label">B</span></div>
         <span class="couple-thumb-heart" aria-hidden="true">♥</span>
       </div>`
    : `<div class="image-wrapper"><img src="${img.image_url}" alt="分析照片" loading="lazy"></div>`;
  card.innerHTML = `${imageContent}<div class="analysis-type-badges"></div><div class="selection-overlay"></div>`;
  card.addEventListener('click', () => handleCardClick(group));
  group.card = card;
  imageGrid.appendChild(card);
}

function updatePhotoGroupCard(group) {
  const badgeBox = group.card.querySelector('.analysis-type-badges');
  const types = [...new Set(group.records.map(record => record.analysis_type || 'score'))];
  badgeBox.innerHTML = types.map(type => `<span class="analysis-type-badge">${getAnalysisTypeLabel(type)}</span>`).join('');
  group.card.classList.toggle('selected', group.records.some(record => selectedImages.has(record.id)));
}

function handleCardClick(group) {
  if (deleteMode) {
    const allSelected = group.records.every(record => selectedImages.has(record.id));
    if (allSelected) {
      group.records.forEach(record => selectedImages.delete(record.id));
    } else {
      group.records.forEach(record => selectedImages.add(record.id));
    }
    updatePhotoGroupCard(group);
    updateSelectionUI();
  } else {
    showPreview(group);
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
  selectionCountDisplay.textContent = `已选择 ${selectedImages.size} 条分析`;
  deleteBtn.disabled = selectedImages.size === 0;
}

async function handleDelete() {
  if (selectedImages.size === 0) return;

  const count = selectedImages.size;
  if (!confirm(`确定要删除这 ${count} 条分析记录吗？如果照片仍被其他分析使用，图片文件会保留。`)) return;

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
      for (const [key, group] of photoGroups) {
        group.records = group.records.filter(record => !selectedImages.has(record.id));
        if (!group.records.length) {
          group.card.remove();
          photoGroups.delete(key);
        } else updatePhotoGroupCard(group);
      }

      toggleManageMode();

      totalCount -= count;
      totalCountDisplay.textContent = `共 ${totalCount} 条分析 · 已加载 ${photoGroups.size} 张照片`;

      if (totalCount === 0) {
        empty.style.display = 'block';
      }

      alert(data.message || `成功删除 ${count} 条分析记录`);
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

function showPreview(group, activeIndex = 0) {
  activePreviewGroup = group;
  activePreviewIndex = activeIndex;
  const img = group.records[activeIndex] || group.records[0];
  previewTabs.style.display = group.records.length > 1 ? 'flex' : 'none';
  previewTabs.innerHTML = group.records.map((record, index) => {
    const sameType = group.records.filter(item => item.analysis_type === record.analysis_type);
    const suffix = sameType.length > 1 ? ` · ${new Date(record.timestamp).toLocaleDateString()}` : '';
    return `<button type="button" class="preview-analysis-tab${index === activeIndex ? ' active' : ''}" role="tab" aria-selected="${index === activeIndex}">${getAnalysisTypeLabel(record.analysis_type)}${suffix}</button>`;
  }).join('');
  [...previewTabs.children].forEach((button, index) => button.addEventListener('click', () => showPreview(group, index)));
  previewImage.src = img.image_url;
  const type = img.analysis_type || 'score';
  if (type === 'couple' && img.image_url_b) {
    previewContent.classList.add('couple-preview');
    previewImageB.src = img.image_url_b;
    previewPhotoB.style.display = 'block';
    previewHeart.style.display = 'flex';
  } else {
    previewContent.classList.remove('couple-preview');
    previewImageB.removeAttribute('src');
    previewPhotoB.style.display = 'none';
    previewHeart.style.display = 'none';
  }
  previewType.textContent = getAnalysisTypeLabel(type);
  previewScoreLabel.textContent = type === 'fortune'
    ? '参考颜值分'
    : type === 'couple' ? 'CP匹配分' : '颜值分';
  previewScore.textContent = Number(img.score || 0).toFixed(1);
  previewDate.textContent = new Date(img.timestamp).toLocaleString();
  previewComment.textContent = img.comment || '';
  previewModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

async function deletePreviewAnalysis() {
  if (!activePreviewGroup) return;
  const group = activePreviewGroup;
  const record = group.records[activePreviewIndex];
  if (!record || !confirm(`确定删除这条${getAnalysisTypeLabel(record.analysis_type)}记录吗？`)) return;

  deleteAnalysisBtn.disabled = true;
  deleteAnalysisBtn.textContent = '删除中...';
  try {
    const res = await fetch('/api/images', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [record.id] })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '删除失败');

    group.records.splice(activePreviewIndex, 1);
    totalCount = Math.max(0, totalCount - 1);
    totalCountDisplay.textContent = `共 ${totalCount} 条分析 · 已加载 ${photoGroups.size - (group.records.length ? 0 : 1)} 张照片`;
    if (group.records.length) {
      updatePhotoGroupCard(group);
      showPreview(group, Math.min(activePreviewIndex, group.records.length - 1));
    } else {
      group.card.remove();
      photoGroups.delete(group.key);
      closePreview();
    }
    if (totalCount === 0) empty.style.display = 'block';
    alert(data.message || '分析记录已删除');
  } catch (error) {
    alert(error.message || '删除失败');
  } finally {
    deleteAnalysisBtn.disabled = false;
    deleteAnalysisBtn.textContent = '删除此项分析';
  }
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
