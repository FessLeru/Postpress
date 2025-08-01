# POSTPRESS - Элитная упаковка

Веб-приложение для демонстрации элитной упаковки с админ-панелью для управления контентом.

## 🚀 Быстрый запуск через Portainer

### 1. Подготовка файлов

Убедитесь, что у вас есть все необходимые файлы:
- `docker-compose.yml` - основная конфигурация
- `nginx-proxy.conf` - конфигурация nginx прокси
- `backend/` - Python Flask backend
- `frontend/` - статические файлы (HTML, CSS, JS)
- `data/works.json` - данные о работах

### 2. Загрузка в Portainer

1. Откройте Portainer
2. Перейдите в **Stacks**
3. Нажмите **Add stack**
4. Введите имя: `postpress`
5. Скопируйте содержимое `docker-compose.yml` в поле **Web editor**
6. Нажмите **Deploy the stack**

### 3. Переменные окружения (опционально)

Создайте файл `.env` в корне проекта или настройте переменные в Portainer:

```env
# Основные настройки
LOGIN=admin
PASSWORD=admin123
DEBUG=true
LOG_LEVEL=info
SECRET_KEY=postpress-secret-key-2025

# SMTP настройки (опционально)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SENDER_EMAIL=your-email@gmail.com
SENDER_PASSWORD=your-app-password
RECIPIENT_EMAIL=admin@postpress.com
```

### 4. Доступ к приложению

После успешного развертывания:

- **Основной сайт**: `http://your-server:8080`
- **Админ-панель**: `http://your-server:8080/admin`
- **Логин админки**: `admin`
- **Пароль админки**: `admin123`

## 📁 Структура проекта

```
Postpress/
├── docker-compose.yml          # Docker Compose конфигурация
├── nginx-proxy.conf           # Nginx прокси конфигурация
├── backend/                   # Python Flask backend
│   ├── app.py                # Основное приложение
│   ├── Dockerfile            # Backend Dockerfile
│   ├── requirements.txt      # Python зависимости
│   ├── uploads/              # Загруженные изображения
│   └── data/                 # JSON файлы с данными
├── frontend/                 # Статические файлы
│   ├── index.html           # Главная страница
│   ├── admin.html           # Админ-панель
│   ├── style.css            # Основные стили
│   ├── admin.css            # Стили админки
│   ├── script.js            # Основной JavaScript
│   ├── admin.js             # JavaScript админки
│   ├── nginx.conf           # Frontend nginx конфигурация
│   └── Dockerfile           # Frontend Dockerfile
└── data/                    # Исходные данные
    └── works.json           # Данные о работах
```

## 🔧 Технические детали

### Backend (Python Flask)
- **Порт**: 5000 (внутренний)
- **Фреймворк**: Flask + Gunicorn
- **API**: RESTful API для управления работами
- **Аутентификация**: Session-based
- **Файлы**: Загрузка и обработка изображений

### Frontend (Nginx)
- **Порт**: 80 (внутренний)
- **Статические файлы**: HTML, CSS, JavaScript
- **Маршрутизация**: Правильная обработка `/admin`

### Nginx Proxy
- **Порт**: 8080 (внешний)
- **Функции**: 
  - Проксирование API запросов на backend
  - Обслуживание статических файлов
  - Правильная маршрутизация `/admin`
  - CORS поддержка

## 🛠️ Управление

### Просмотр логов
```bash
# Логи backend
docker logs postpress-backend

# Логи frontend
docker logs postpress-frontend

# Логи nginx proxy
docker logs postpress-nginx-proxy
```

### Перезапуск сервисов
```bash
# Перезапуск всех сервисов
docker-compose restart

# Перезапуск конкретного сервиса
docker-compose restart backend
```

### Обновление
```bash
# Остановка
docker-compose down

# Пересборка и запуск
docker-compose up --build -d
```

## 🔒 Безопасность

- Админ-панель защищена аутентификацией
- CORS настроен для безопасной работы
- Файлы загружаются с проверкой расширений
- Изображения обрабатываются и оптимизируются

## 📧 Email функционал

Для работы отправки email настройте SMTP переменные:
- `SENDER_EMAIL` - email отправителя
- `SENDER_PASSWORD` - пароль приложения (для Gmail)
- `RECIPIENT_EMAIL` - email получателя

## 🐛 Устранение неполадок

### Проблема: Админ-панель не открывается
**Решение**: Проверьте, что контейнеры запущены и nginx-proxy.conf правильно настроен.

### Проблема: Изображения не загружаются
**Решение**: Проверьте права доступа к папке `backend/uploads/`.

### Проблема: API не отвечает
**Решение**: Проверьте логи backend контейнера и убедитесь, что Flask приложение запущено.

### Проблема: Порт 8080 занят
**Решение**: Измените порт в `docker-compose.yml` в секции nginx.

## 📝 Лицензия

Проект разработан для демонстрации элитной упаковки. 