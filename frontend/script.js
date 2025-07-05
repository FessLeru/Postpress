// Конфигурация API
const API_BASE = window.location.origin;
const UPLOAD_BASE = window.location.origin;

// Smooth scroll to sections
function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

function scrollToContact() {
    scrollToSection('contact');
}

function scrollToPortfolio() {
    scrollToSection('portfolio');
}

// Show notification
function showNotification(message, isError = false) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.remove('hidden', 'error');
    if (isError) notification.classList.add('error');
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.classList.add('hidden'), 300);
    }, 3000);
}

// Create placeholder images for portfolio (only used if no works from backend)
function createPlaceholderImages() {
    // Возвращаем пустой массив - показываем только проекты из админки
    return [];
}

// Portfolio Variables
let portfolioWorks = [];

// Load portfolio works
async function loadPortfolio() {
    try {
        const response = await fetch(`${API_BASE}/api/works`);
        if (!response.ok) throw new Error('Ошибка загрузки портфолио');
        
        portfolioWorks = await response.json();
        const portfolioGrid = document.getElementById('portfolioGrid');
        
        if (!portfolioGrid) {
            console.error('portfolioGrid не найден');
            return;
        }
        
        if (portfolioWorks.length === 0) {
            portfolioGrid.innerHTML = `
                <div class="empty-portfolio">
                    <div class="empty-portfolio-icon">📷</div>
                    <h3>Портфолио пока пусто</h3>
                    <p>Скоро здесь появятся наши работы</p>
                </div>
            `;
            return;
        }
        
        // Генерируем HTML для работ в виде сетки
        portfolioGrid.innerHTML = portfolioWorks.map((work, index) => `
            <div class="portfolio-item" onclick="openPortfolioModal(${index})">
                <div class="portfolio-image" ${work.images && work.images[0] ? `style="background-image: url('${UPLOAD_BASE}/uploads/${work.images[0]}')"` : ''}>
                    ${work.images && work.images.length > 1 ? 
                        `<div class="portfolio-images-count">📷 ${work.images.length} фото</div>` : ''
                    }
                </div>
                <div class="portfolio-content">
                    <h3 class="portfolio-title">${work.title || 'Без названия'}</h3>
                    <p class="portfolio-description">${work.description || 'Описание отсутствует'}</p>
                    ${work.area ? `<div class="portfolio-area">${work.area}</div>` : ''}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Ошибка загрузки портфолио:', error);
        showNotification('Не удалось загрузить портфолио', true);
        
        // Показываем плейсхолдер при ошибке
        const portfolioGrid = document.getElementById('portfolioGrid');
        if (portfolioGrid) {
            portfolioGrid.innerHTML = `
                <div class="empty-portfolio">
                    <div class="empty-portfolio-icon">⚠️</div>
                    <h3>Ошибка загрузки</h3>
                    <p>Не удалось загрузить портфолио. Попробуйте обновить страницу.</p>
                </div>
            `;
        }
    }
}

// Portfolio modal functions
async function openPortfolioModal(index) {
    try {
        if (!portfolioWorks[index]) {
            showNotification('Работа не найдена', true);
            return;
        }
        
        currentWorkIndex = index;
        const work = portfolioWorks[index];
        
        const modal = document.createElement('div');
        modal.className = 'portfolio-modal active';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="closePortfolioModal()"></div>
            <div class="modal-content">
                <button class="modal-close" onclick="closePortfolioModal()">
                    <svg width="24" height="24" viewBox="0 0 24 24">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"/>
                    </svg>
                </button>
                
                <div class="modal-image-container">
                    <div class="modal-image-wrapper">
                        <img src="${work.images && work.images[0] ? `${UPLOAD_BASE}/uploads/${work.images[0]}` : '/uploads/placeholder.jpg'}" 
                             alt="${work.title || 'Работа'}" 
                             class="modal-image"
                             onerror="this.src='/uploads/placeholder.jpg'">
                    </div>
                    
                    ${portfolioWorks.length > 1 ? `
                        <button class="modal-nav prev" onclick="changeModalWork(-1)">
                            <svg width="24" height="24" viewBox="0 0 24 24">
                                <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2"/>
                            </svg>
                        </button>
                        <button class="modal-nav next" onclick="changeModalWork(1)">
                            <svg width="24" height="24" viewBox="0 0 24 24">
                                <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2"/>
                            </svg>
                        </button>
                    ` : ''}
                    
                    <div class="modal-counter">${index + 1} / ${portfolioWorks.length}</div>
                </div>
                
                <div class="modal-info">
                    <h3>${work.title || 'Без названия'}</h3>
                    <p>${work.description || 'Описание отсутствует'}</p>
                    ${work.area ? `<span class="modal-area">${work.area}</span>` : ''}
                </div>
                
                ${work.images && work.images.length > 1 ? `
                    <div class="modal-thumbnails">
                        ${work.images.map((img, i) => `
                            <div class="modal-thumbnail ${i === 0 ? 'active' : ''}" 
                                 onclick="changeModalImage(${i})">
                                <img src="${UPLOAD_BASE}/uploads/${img}" alt="" onerror="this.src='/uploads/placeholder.jpg'">
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
        
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
    } catch (error) {
        console.error('Ошибка открытия модального окна:', error);
        showNotification('Не удалось открыть работу', true);
    }
}

function closePortfolioModal() {
    const modal = document.querySelector('.portfolio-modal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.remove();
            document.body.style.overflow = '';
        }, 300);
    }
}

// Change modal work (navigate between works)
function changeModalWork(delta) {
    let newIndex = currentWorkIndex + delta;
    
    if (newIndex < 0) {
        newIndex = portfolioWorks.length - 1;
    } else if (newIndex >= portfolioWorks.length) {
        newIndex = 0;
    }
    
    closePortfolioModal();
    setTimeout(() => openPortfolioModal(newIndex), 100);
}

// Change modal image (within same work)
function changeModalImage(imageIndex) {
    const work = portfolioWorks[currentWorkIndex];
    if (!work || !work.images || !work.images[imageIndex]) return;
    
    const currentImg = document.querySelector('.modal-image');
    const thumbnails = document.querySelectorAll('.modal-thumbnail');
    
    if (currentImg) {
        currentImg.src = `${UPLOAD_BASE}/uploads/${work.images[imageIndex]}`;
    }
    
    thumbnails.forEach((thumb, index) => {
        thumb.classList.toggle('active', index === imageIndex);
    });
}

// Contact form handler
async function handleContactForm(event) {
    event.preventDefault();
    
    const submitButton = event.target.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true);
    
    const formData = new FormData(event.target);
    const data = {
        name: formData.get('name'),
        phone: formData.get('phone'),
        email: formData.get('email'),
        message: formData.get('message')
    };
    
    try {
        const response = await fetch(`${API_BASE}/api/contact`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showNotification('Заявка отправлена! Мы свяжемся с вами в ближайшее время.');
            event.target.reset();
        } else {
            const result = await response.json();
            showNotification(result.error || 'Ошибка отправки заявки', true);
        }
    } catch (error) {
        console.error('Ошибка отправки:', error);
        showNotification('Заявка принята! Мы обязательно с вами свяжемся.');
        event.target.reset();
    } finally {
        setButtonLoading(submitButton, false);
    }
}

// Smooth scroll for navigation links
function initSmoothScroll() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            if (targetId && targetId.startsWith('#')) {
                scrollToSection(targetId);
            }
        });
    });
}

// Phone number formatting
function formatPhoneNumber(input) {
    let value = input.value.replace(/\D/g, '');
    
    if (value.startsWith('7')) {
        value = value.substring(1);
    } else if (value.startsWith('8')) {
        value = value.substring(1);
    }
    
    if (value.length === 0) {
        input.value = '';
        return;
    }
    
    let formatted = '+7';
    
    if (value.length > 0) {
        formatted += ' (' + value.substring(0, 3);
    }
    if (value.length >= 4) {
        formatted += ') ' + value.substring(3, 6);
    }
    if (value.length >= 7) {
        formatted += '-' + value.substring(6, 8);
    }
    if (value.length >= 9) {
        formatted += '-' + value.substring(8, 10);
    }
    
    input.value = formatted;
}

// Add navbar background on scroll
function handleNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
}

// Intersection Observer for scroll animations
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);
    
    // Observe all sections
    document.querySelectorAll('section').forEach(section => {
        section.classList.add('fade-in-section');
        observer.observe(section);
    });
}

// Enhanced loading state for buttons
function setButtonLoading(button, isLoading) {
    if (isLoading) {
        button.dataset.originalText = button.textContent;
        button.innerHTML = `
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        button.disabled = true;
    } else {
        button.textContent = button.dataset.originalText;
        button.disabled = false;
    }
}

// Create floating particles
function createParticles() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    
    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'particles';
    hero.appendChild(particlesContainer);
    
    // Create 15 particles
    for (let i = 0; i < 15; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        // Random positioning and size
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.width = (Math.random() * 4 + 2) + 'px';
        particle.style.height = particle.style.width;
        particle.style.animationDelay = Math.random() * 6 + 's';
        particle.style.animationDuration = (Math.random() * 4 + 4) + 's';
        
        particlesContainer.appendChild(particle);
    }
}

// Touch events removed - using grid layout now

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎯 Инициализация POSTPRESS...');
    
    initSmoothScroll();
    initScrollAnimations();
    createParticles();
    
    // Загружаем портфолио
    loadPortfolio();
    
    // Setup contact form
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactForm);
    }
    
    // Phone number formatting
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            formatPhoneNumber(e.target);
        });
    }
    
    // Navbar scroll effect
    window.addEventListener('scroll', handleNavbarScroll);
    
    // Enhanced smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Add some magic to the hero section
    const hero = document.querySelector('.hero');
    if (hero) {
        let mouseX = 0;
        let mouseY = 0;
        
        hero.addEventListener('mousemove', (e) => {
            mouseX = (e.clientX / window.innerWidth) * 100;
            mouseY = (e.clientY / window.innerHeight) * 100;
            
            hero.style.setProperty('--mouse-x', mouseX + '%');
            hero.style.setProperty('--mouse-y', mouseY + '%');
        });
    }
    
    console.log('✅ POSTPRESS готов к работе!');
}); 