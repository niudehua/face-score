// images.js - Minimalist Version

// State
let currentPage = 1;
let limit = 30; // Higher density
let hasMore = true;
let isLoading = false;
let deleteMode = false;
let selectedImages = new Set();
let totalCount = 0;

// DOM Elements
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

// Init
document.addEventListener('DOMContentLoaded', async () => {
  // Auth Check
  const isLoggedIn = await verifyLogin();
  if (!isLoggedIn) return;

  initEventListeners();
  initInfiniteScroll();
  loadImages();
});

// Event Listeners
function initEventListeners() {
  manageBtn.addEventListener('click', toggleManageMode);
  deleteBtn.addEventListener('click', handleDelete);
}

// Auth
async function verifyLogin() {
  try {
    const res = await fetch('/api/auth', { credentials: 'include' });
    const data = await res.json();
    if (data.success) return true;
    window.location.href = '/api/auth/github';
    return false;
  } catch {
    window.location.href = '/api/auth/github';
    return false;
  }
}

// Data Loading
async function loadImages(page = 1, isAppend = false) {
  if (isLoading) return;
  if (isAppend && !hasMore) return;

  isLoading = true;
  if (!isAppend) {
    // Reset
    imageGrid.innerHTML = '';
    loading.style.display = 'block';
    empty.style.display = 'none';
    loadMoreTrigger.style.display = 'none';
  } else {
    loadMoreStatus.style.display = 'flex';
  }

  try {
    // Simplified URL (Sort by timestamp desc default)
    const res = await fetch(`/api/images?page=${page}&limit=${limit}&sort_by=timestamp&order=desc`, {
      credentials: 'include'
    });
    const data = await res.json();

    if (data.data) {
      totalCount = data.pagination.total;
      // Update counts
      totalCountDisplay.textContent = `${totalCount} 张照片`; // Simple count display

      if (data.data.length === 0 && !isAppend) {
        loading.style.display = 'none';
        empty.style.display = 'block';
      } else {
        renderImages(data.data);

        // Pagination Logic
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

// Rendering
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
                <div class="selection-overlay"></div>
            </div>
        `;

    card.addEventListener('click', () => handleCardClick(img));
    fragment.appendChild(card);
  });

  imageGrid.appendChild(fragment);
}

// Interaction
function handleCardClick(img) {
  if (deleteMode) {
    // Selection Logic
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
    // Preview Logic (Simplified Modal)
    showPreview(img);
  }
}

// Manage Mode
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

  // Update button text style based on state
  if (selectedImages.size > 0) {
    deleteBtn.style.opacity = '1';
  } else {
    deleteBtn.style.opacity = '0.5';
  }
}

// Delete Logic
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
      // Remove from UI immediately for snapiness
      selectedImages.forEach(id => {
        const card = document.querySelector(`.image-card[data-id="${id}"]`);
        if (card) card.remove();
      });

      toggleManageMode(); // Exit mode

      // Reload to sync (optional, or just update count)
      // loadImages(1); 
      totalCount -= count;
      totalCountDisplay.textContent = `${totalCount} 张照片`;

      if (totalCount === 0) {
        empty.style.display = 'block';
      }

      alert(`成功删除 ${count} 张照片`); // Use simple alert or toast
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

// Preview (Reusing the modal style but injecting dynamically)
function showPreview(img) {
  const modal = document.createElement('div');
  modal.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 2000;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        animation: fadeIn 0.2s ease;
    `;

  modal.innerHTML = `
        <img src="${img.image_url}" style="max-width:100%; max-height:80vh; object-fit:contain;">
        <div style="margin-top: 20px; color: white; text-align: center;">
            <div style="font-size: 24px; font-weight: bold; color: #ff6b81;">${img.score.toFixed(1)}</div>
            <div style="font-size: 14px; opacity: 0.8; margin-top: 5px;">${new Date(img.timestamp).toLocaleString()}</div>
            <p style="margin-top: 15px; max-width: 80%; line-height: 1.5; font-size: 15px;">${img.comment || ''}</p>
        </div>
        <button style="position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.2); 
            border: none; color: white; width: 32px; height: 32px; border-radius: 50%; font-size: 18px;">✕</button>
    `;

  modal.onclick = () => modal.remove();
  document.body.appendChild(modal);
}

// Infinite Scroll
function initInfiniteScroll() {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && hasMore && !isLoading) {
      loadImages(currentPage + 1, true);
    }
  });
  observer.observe(loadMoreTrigger);
}
