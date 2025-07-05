const API_BASE = window.location.origin;

let works = [];
let currentWork = null;
let workToDelete = null;
let selectedImages = [];
let existingImages = [];

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
        
        const response = await fetch(`${API_BASE}/api/works`);
        
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

function handleImageSelection(event) {
    const files = Array.from(event.target.files);
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];
    const maxSize = 32 * 1024 * 1024; // 32MB
    
    files.forEach(file => {
        // Проверяем тип файла
        if (!allowedTypes.includes(file.type)) {
            showNotification(`Файл "${file.name}" имеет неподдерживаемый формат. Разрешены: JPG, PNG, GIF, WebP, BMP, TIFF`, true);
            return;
        }
        
        // Проверяем размер файла
        if (file.size > maxSize) {
            showNotification(`Файл "${file.name}" слишком большой. Максимальный размер: 32MB`, true);
            return;
        }
        
        if (file.size === 0) {
            showNotification(`Файл "${file.name}" поврежден или пуст`, true);
            return;
        }
        
        // Проверяем количество изображений
        if (selectedImages.length >= 10) {
            showNotification('Максимальное количество изображений: 10', true);
            return;
        }
        
        selectedImages.push(file);
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const imagePreview = document.getElementById('imagePreview');
            const index = selectedImages.length - 1;
            
            const imageItem = document.createElement('div');
            imageItem.className = 'image-preview-item';
            imageItem.innerHTML = `
                <img src="${e.target.result}" alt="Новое изображение" class="image-preview-img">
                <button type="button" class="image-preview-remove" onclick="removeSelectedImage(${index})">&times;</button>
                <div class="image-info">
                    <small>${file.name}</small>
                    <small>${(file.size / 1024 / 1024).toFixed(2)} MB</small>
                </div>
            `;
            
            imagePreview.appendChild(imageItem);
        };
        
        reader.onerror = () => {
            showNotification(`Ошибка чтения файла "${file.name}"`, true);
        };
        
        reader.readAsDataURL(file);
    });
    
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
                method: 'DELETE'
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
            const image = selectedImages[i];
            const imageFormData = new FormData();
            imageFormData.append('image', image);
            
            try {
                const uploadResponse = await fetch(`${API_BASE}/api/works/${workId}/images`, {
                    method: 'POST',
                    body: imageFormData
                });
                
                if (uploadResponse.ok) {
                    const result = await uploadResponse.json();
                    uploadedCount++;
                    console.log(`Загружено изображение: ${result.filename}`);
                } else {
                    const error = await uploadResponse.json();
                    console.error(`Ошибка загрузки изображения "${image.name}":`, error.error);
                    showNotification(`Ошибка загрузки "${image.name}": ${error.error}`, true);
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
            method: 'DELETE'
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
    loadWorks();
    
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