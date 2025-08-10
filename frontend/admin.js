const API_BASE = window.location.origin;

let works = [];
let currentWork = null;
let workToDelete = null;
let selectedImages = [];
let existingImages = [];

// ========================================
// IMAGE PREPARATION (CLIENT-SIDE)
// ========================================

async function prepareImageForUpload(file) {
    // Fallback: if not an image or canvas unsupported, return original
    if (!file || (file.type && !file.type.startsWith('image/'))) return file;
    try {
        const url = URL.createObjectURL(file);
        const img = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = url;
        });
        URL.revokeObjectURL(url);

        // Target max edge to keep size reasonable before server-side processing
        const maxEdge = 3000; // large but tames 8K photos
        let { width, height } = img;
        if (width === 0 || height === 0) return file;

        let targetWidth = width;
        let targetHeight = height;
        if (Math.max(width, height) > maxEdge) {
            const scale = maxEdge / Math.max(width, height);
            targetWidth = Math.round(width * scale);
            targetHeight = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const blob = await new Promise((resolve) => {
            canvas.toBlob(
                (b) => resolve(b || file),
                'image/jpeg',
                0.9
            );
        });

        if (!(blob instanceof Blob)) return file;
        // Wrap into File to keep a filename (backend ignores it anyway)
        const filename = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], filename, { type: 'image/jpeg' });
    } catch (e) {
        console.warn('prepareImageForUpload fallback to original due to error:', e);
        return file;
    }
}

// Helper: upload single image to specific work
async function uploadImageToWork(workId, file) {
    const prepared = await prepareImageForUpload(file);
    const fd = new FormData();
    fd.append('image', prepared);
    const resp = await fetch(`${API_BASE}/api/works/${workId}/images`, {
        method: 'POST',
        credentials: 'include',
        body: fd
    });
    if (!resp.ok) {
        let errText = '';
        try { const j = await resp.json(); errText = j.error || j.message || ''; } catch {}
        throw new Error(errText || `HTTP ${resp.status}`);
    }
    return resp.json();
}

function renderImagePreview() {
    const imagePreview = document.getElementById('imagePreview');
    if (!imagePreview) return;
    const existingHtml = existingImages.map((filename, idx) => `
        <div class="image-preview-item">
            <img src="${API_BASE}/uploads/${filename}" alt="Изображение" class="image-preview-img">
            <button type="button" class="image-preview-remove" onclick="removeExistingImage(${idx})">&times;</button>
        </div>
    `).join('');
    const selectedHtml = selectedImages.map((file, idx) => {
        const url = URL.createObjectURL(file);
        return `
            <div class="image-preview-item">
                <img src="${url}" alt="Новое изображение" class="image-preview-img">
                <button type="button" class="image-preview-remove" onclick="removeSelectedImage(${idx})">&times;</button>
            </div>
        `;
    }).join('');
    imagePreview.innerHTML = existingHtml + selectedHtml;
}

// ========================================
// AUTHENTICATION FUNCTIONS
// ========================================

let isAuthenticated = false;

async function checkAuthStatus() {
    try {
        const response = await fetch(`${API_BASE}/api/auth/status`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            isAuthenticated = data.authenticated;
            
            if (isAuthenticated) {
                showAdminSection(data.user);
                loadWorks();
            } else {
                showLoginSection();
            }
        } else {
            showLoginSection();
        }
    } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        showLoginSection();
    }
}

function showLoginSection() {
    document.getElementById('loginSection').style.display = 'flex';
    document.getElementById('adminSection').style.display = 'none';
    isAuthenticated = false;
}

function showAdminSection(username) {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('adminSection').style.display = 'block';
    
    if (username) {
        document.getElementById('userInfo').textContent = `Привет, ${username}!`;
    }
    
    isAuthenticated = true;
}

async function handleLogin(event) {
    event.preventDefault();
    
    const loginButton = document.getElementById('loginButton');
    const loginText = loginButton.querySelector('.login-text');
    const loginLoading = loginButton.querySelector('.login-loading');
    const loginError = document.getElementById('loginError');
    
    // Показываем состояние загрузки
    loginButton.disabled = true;
    loginText.style.display = 'none';
    loginLoading.style.display = 'inline';
    loginError.style.display = 'none';
    
    const formData = new FormData(event.target);
    const credentials = {
        username: formData.get('username'),
        password: formData.get('password')
    };
    
    try {
        const response = await fetch(`${API_BASE}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(credentials)
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showAdminSection(data.user);
            loadWorks();
            showNotification('Авторизация успешна!');
        } else {
            loginError.textContent = data.message || 'Неверный логин или пароль';
            loginError.style.display = 'block';
        }
    } catch (error) {
        console.error('Ошибка авторизации:', error);
        loginError.textContent = 'Ошибка соединения с сервером';
        loginError.style.display = 'block';
    } finally {
        // Возвращаем кнопку в исходное состояние
        loginButton.disabled = false;
        loginText.style.display = 'inline';
        loginLoading.style.display = 'none';
    }
}

async function logout() {
    try {
        console.log('Выполняется выход из системы...');
        
        const response = await fetch(`${API_BASE}/api/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Ответ сервера на logout:', response.status);
        
        // Даже если сервер вернул ошибку, все равно выходим локально
        showLoginSection();
        showNotification('Вы вышли из системы');
        
        // Очищаем данные
        works = [];
        isAuthenticated = false;
        
        // Очищаем форму входа
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.reset();
        }
        
    } catch (error) {
        console.error('Ошибка выхода:', error);
        // Даже при ошибке сети выходим локально
        showLoginSection();
        showNotification('Вы вышли из системы');
        works = [];
        isAuthenticated = false;
    }
}

// Show notification
function showNotification(message, isError = false) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `toast ${isError ? 'error' : 'success'} show`;
    
    // Автоматически скрываем уведомления об ошибках через 5 секунд, успешные - через 3
    const hideTimeout = isError ? 5000 : 3000;
    
    setTimeout(() => {
        notification.className = 'toast';
    }, hideTimeout);
    
    // Логируем в консоль для отладки
    if (isError) {
        console.error('Admin Error:', message);
    } else {
        console.log('Admin Success:', message);
    }
}

// Modal management
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

// Load works
async function loadWorks() {
    try {
        const worksGrid = document.getElementById('worksGrid');
        worksGrid.innerHTML = '<div class="loading">Загрузка работ...</div>';
        
        const response = await fetch(`${API_BASE}/api/works`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        works = Array.isArray(data) ? data : [];
        renderWorks();
        
        if (works.length === 0) {
            showNotification('Портфолио пусто. Добавьте первую упаковку!');
        } else {
            showNotification(`Загружено ${works.length} образец(ов) упаковки`);
        }
    } catch (error) {
        console.error('Ошибка загрузки работ:', error);
        showNotification(`Ошибка загрузки работ: ${error.message}`, true);
        document.getElementById('worksGrid').innerHTML = `
            <div class="empty-portfolio">
                <div class="empty-portfolio-icon">❌</div>
                <h3>Ошибка загрузки</h3>
                <p>Не удалось загрузить список работ</p>
                <button class="btn btn-primary" onclick="loadWorks()">Повторить попытку</button>
            </div>
        `;
    }
}

// Render works
function renderWorks() {
    const worksGrid = document.getElementById('worksGrid');
    
    if (works.length === 0) {
        worksGrid.innerHTML = `
            <div class="empty-portfolio">
                <div class="empty-portfolio-icon">📦</div>
                <h3>Пока нет упаковки</h3>
                <p>Добавьте первую упаковку, нажав кнопку "Добавить новую упаковку"</p>
            </div>
        `;
        return;
    }
    
            worksGrid.innerHTML = works.map(work => {
        const imageUrl = work.images && work.images.length > 0 
            ? `${API_BASE}/uploads/${work.images[0]}`
            : null;
        const imageCount = work.images ? work.images.length : 0;
            
        return `
            <div class="portfolio-item">
                <div class="portfolio-image" ${imageUrl ? `style="background-image: url('${imageUrl}')"` : ''}>
                    ${imageCount > 0 ? `<div class="portfolio-images-count">📷 ${imageCount} фото</div>` : ''}
                </div>
                <div class="portfolio-content">
                    <h3 class="portfolio-title">${work.title || 'Без названия'}</h3>
                    <p class="portfolio-description">${work.description || 'Нет описания'}</p>
                    <div class="portfolio-area">${work.area || ''}</div>
                    <div class="portfolio-actions">
                        <button class="btn btn-secondary btn-sm" onclick="editWork('${work.id}')">Редактировать</button>
                        <button class="btn btn-danger btn-sm" onclick="showDeleteModal('${work.id}')">Удалить</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Show add work modal
function showAddWorkModal() {
    currentWork = null;
    selectedImages = [];
    existingImages = [];
    
    document.getElementById('modalTitle').textContent = 'Добавить новую упаковку';
    document.getElementById('workForm').reset();
    document.getElementById('workId').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('saveButton').textContent = 'Сохранить упаковку';
    
    showModal('workModal');
}

// Edit work
function editWork(workId) {
    const work = works.find(w => w.id === workId);
    if (!work) return;
    
    currentWork = work;
    selectedImages = [];
    existingImages = [...work.images];
    
    document.getElementById('modalTitle').textContent = 'Редактировать упаковку';
    document.getElementById('workId').value = work.id;
    document.getElementById('workTitle').value = work.title || '';
    document.getElementById('workDescription').value = work.description || '';
    document.getElementById('workArea').value = work.area || '';
    document.getElementById('saveButton').textContent = 'Сохранить изменения';
    
    // Show existing images
    const imagePreview = document.getElementById('imagePreview');
    imagePreview.innerHTML = existingImages.map((filename, index) => `
        <div class="image-preview-item">
            <img src="${API_BASE}/uploads/${filename}" alt="Изображение" class="image-preview-img">
            <button type="button" class="image-preview-remove" onclick="removeExistingImage(${index})">&times;</button>
        </div>
    `).join('');
    
    showModal('workModal');
}

// Hide work modal
function hideWorkModal() {
    hideModal('workModal');
    currentWork = null;
    selectedImages = [];
    existingImages = [];
}

// Handle image selection (инициализация перенесена в основной блок DOMContentLoaded)

async function handleImageSelection(event) {
    const files = Array.from(event.target.files);
    const maxSize = 32 * 1024 * 1024; // 32MB
    for (const file of files) {
        if (file.size > maxSize) {
            showNotification(`Файл "${file.name}" слишком большой. Максимальный размер: 32MB`, true);
            continue;
        }
        if (file.size === 0) {
            showNotification(`Файл "${file.name}" поврежден или пуст`, true);
            continue;
        }
        if (!currentWork) {
            if (selectedImages.length >= 10) {
                showNotification('Максимальное количество изображений: 10', true);
                continue;
            }
            selectedImages.push(file);
            renderImagePreview();
        } else {
            try {
                const result = await uploadImageToWork(currentWork.id, file);
                existingImages.push(result.filename);
                renderImagePreview();
                showNotification('Изображение добавлено');
            } catch (e) {
                console.error('Ошибка загрузки:', e);
                showNotification(`Ошибка загрузки "${file.name}": ${e.message}`, true);
            }
        }
    }
    event.target.value = '';
}

// Remove selected image
function removeSelectedImage(index) {
    selectedImages.splice(index, 1);
    
    // Re-render image preview
    const imagePreview = document.getElementById('imagePreview');
    const existingImagesHtml = existingImages.map((filename, idx) => `
        <div class="image-preview-item">
            <img src="${API_BASE}/uploads/${filename}" alt="Изображение" class="image-preview-img">
            <button type="button" class="image-preview-remove" onclick="removeExistingImage(${idx})">&times;</button>
        </div>
    `).join('');
    
    const selectedImagesHtml = selectedImages.map((file, idx) => {
        const url = URL.createObjectURL(file);
        return `
            <div class="image-preview-item">
                <img src="${url}" alt="Новое изображение" class="image-preview-img">
                <button type="button" class="image-preview-remove" onclick="removeSelectedImage(${idx})">&times;</button>
            </div>
        `;
    }).join('');
    
    imagePreview.innerHTML = existingImagesHtml + selectedImagesHtml;
}

// Remove existing image
async function removeExistingImage(index) {
    const filename = existingImages[index];
    
    if (currentWork) {
        try {
            const response = await fetch(`${API_BASE}/api/works/${currentWork.id}/images/${filename}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            if (response.ok) {
                existingImages.splice(index, 1);
                
                // Re-render image preview
                const imagePreview = document.getElementById('imagePreview');
                const existingImagesHtml = existingImages.map((filename, idx) => `
                    <div class="image-preview-item">
                        <img src="${API_BASE}/uploads/${filename}" alt="Изображение" class="image-preview-img">
                        <button type="button" class="image-preview-remove" onclick="removeExistingImage(${idx})">&times;</button>
                    </div>
                `).join('');
                
                const selectedImagesHtml = selectedImages.map((file, idx) => {
                    const url = URL.createObjectURL(file);
                    return `
                        <div class="image-preview-item">
                            <img src="${url}" alt="Новое изображение" class="image-preview-img">
                            <button type="button" class="image-preview-remove" onclick="removeSelectedImage(${idx})">&times;</button>
                        </div>
                    `;
                }).join('');
                
                imagePreview.innerHTML = existingImagesHtml + selectedImagesHtml;
                
                showNotification('Изображение удалено');
            } else {
                throw new Error('Ошибка удаления изображения');
            }
        } catch (error) {
            console.error('Ошибка удаления изображения:', error);
            showNotification('Ошибка удаления изображения', true);
        }
    } else {
        existingImages.splice(index, 1);
    }
}

// Handle work save
async function handleWorkSave(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const workData = {
        title: formData.get('title').trim(),
        description: formData.get('description').trim(),
        area: formData.get('area').trim()
    };
    
    // Валидация данных
    if (!workData.title) {
        showNotification('Название проекта обязательно для заполнения', true);
        return;
    }
    
    if (workData.title.length < 3) {
        showNotification('Название проекта должно содержать минимум 3 символа', true);
        return;
    }
    
    if (workData.title.length > 100) {
        showNotification('Название проекта слишком длинное (максимум 100 символов)', true);
        return;
    }
    
    const saveButton = document.getElementById('saveButton');
    const originalText = saveButton.textContent;
    saveButton.textContent = 'Сохранение...';
    saveButton.disabled = true;
    
    try {
        let workId;
        
        if (currentWork) {
            // Update existing work
            const response = await fetch(`${API_BASE}/api/works/${currentWork.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(workData)
            });
            
            if (!response.ok) throw new Error('Ошибка обновления работы');
            workId = currentWork.id;
        } else {
            // Create new work
            const response = await fetch(`${API_BASE}/api/works`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(workData)
            });
            
            if (!response.ok) throw new Error('Ошибка создания работы');
            const newWork = await response.json();
            workId = newWork.id;
        }
        
        // Upload new images with proper error handling
        let uploadedCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < selectedImages.length; i++) {
            const originalImage = selectedImages[i];
            const image = await prepareImageForUpload(originalImage);
            const imageFormData = new FormData();
            imageFormData.append('image', image);
            
            try {
                const uploadResponse = await fetch(`${API_BASE}/api/works/${workId}/images`, {
                    method: 'POST',
                    credentials: 'include',
                    body: imageFormData
                });
                
                if (uploadResponse.ok) {
                    const result = await uploadResponse.json();
                    uploadedCount++;
                    console.log(`Загружено изображение: ${result.filename}`);
                } else {
                    let errorText = '';
                    try {
                        const error = await uploadResponse.json();
                        errorText = error && (error.error || error.message) || '';
                    } catch (_) {
                        errorText = await uploadResponse.text();
                    }
                    console.error(`Ошибка загрузки изображения "${image.name}":`, errorText);
                    showNotification(`Ошибка загрузки "${image.name}": ${errorText || 'Неизвестная ошибка'}`, true);
                    errorCount++;
                }
            } catch (error) {
                console.error(`Критическая ошибка загрузки "${image.name}":`, error);
                showNotification(`Критическая ошибка загрузки "${image.name}"`, true);
                errorCount++;
            }
        }
        
        // Показываем итоговое уведомление
        if (uploadedCount > 0 && errorCount === 0) {
            showNotification(`Все изображения загружены успешно (${uploadedCount})`);
        } else if (uploadedCount > 0 && errorCount > 0) {
            showNotification(`Загружено: ${uploadedCount}, ошибок: ${errorCount}`, true);
        } else if (errorCount > 0) {
            showNotification(`Все изображения загружены с ошибками (${errorCount})`, true);
        }
        
        showNotification(currentWork ? 'Работа обновлена' : 'Работа добавлена');
        hideWorkModal();
        loadWorks();
        
    } catch (error) {
        console.error('Ошибка сохранения работы:', error);
        showNotification('Ошибка сохранения работы', true);
    } finally {
        saveButton.textContent = originalText;
        saveButton.disabled = false;
    }
}

// Show delete modal
function showDeleteModal(workId) {
    workToDelete = workId;
    showModal('deleteModal');
}

// Hide delete modal
function hideDeleteModal() {
    hideModal('deleteModal');
    workToDelete = null;
}

// Confirm delete
async function confirmDelete() {
    if (!workToDelete) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/works/${workToDelete}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Ошибка удаления работы');
        
        showNotification('Работа удалена');
        hideDeleteModal();
        loadWorks();
        
    } catch (error) {
        console.error('Ошибка удаления работы:', error);
        showNotification('Ошибка удаления работы', true);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Админ-панель загружена');
    
    // Setup login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Setup logout button with event listener (backup to onclick)
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Logout button clicked via event listener');
            logout();
        });
    }
    
    // Check authentication status
    checkAuthStatus();
    
    // Add event listeners for form
    const imageInput = document.getElementById('imageInput');
    if (imageInput) {
        imageInput.addEventListener('change', handleImageSelection);
    }
    
    const workForm = document.getElementById('workForm');
    if (workForm) {
        workForm.addEventListener('submit', handleWorkSave);
    }
}); 