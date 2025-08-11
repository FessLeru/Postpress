from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
import os
import json
from datetime import datetime
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from werkzeug.utils import secure_filename
from werkzeug.datastructures import FileStorage
import uuid
from PIL import Image, ImageOps, ImageFile
import io
import pathlib
import logging
from functools import wraps
import hashlib
from typing import Tuple

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'postpress-secret-key-2025')
CORS(app, supports_credentials=True)

# Настройка логирования с безопасным обращением к файлам
handlers = [logging.StreamHandler()]

# Пытаемся добавить файловое логирование, но не падаем если не получается
try:
    file_handler = logging.FileHandler('app.log', encoding='utf-8')
    handlers.append(file_handler)
    print("Логирование в файл app.log включено")
except (PermissionError, OSError) as e:
    print(f"Предупреждение: Не удалось создать файл логов: {e}")
    print("Логирование будет только в консоль")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=handlers
)
logger = logging.getLogger(__name__)
try:
    Image.MAX_IMAGE_PIXELS = None
    ImageFile.LOAD_TRUNCATED_IMAGES = True  # Позволяет открывать частично поврежденные JPEG
    logger.info("[IMAGES] MAX_IMAGE_PIXELS отключен (разрешены большие изображения)")
except Exception as e:
    logger.warning(f"[IMAGES] Не удалось отключить MAX_IMAGE_PIXELS: {e}")

# Middleware для логирования всех запросов
@app.before_request
def log_request_info():
    logger.info(f"[REQUEST] ===== НОВЫЙ ЗАПРОС =====")
    logger.info(f"[REQUEST] Метод: {request.method}")
    logger.info(f"[REQUEST] URL: {request.url}")
    logger.info(f"[REQUEST] Путь: {request.path}")
    logger.info(f"[REQUEST] Headers: {dict(request.headers)}")
    logger.info(f"[REQUEST] Remote IP: {request.remote_addr}")
    logger.info(f"[REQUEST] User Agent: {request.user_agent}")
    if request.is_json:
        logger.info(f"[REQUEST] JSON данные: {request.get_json()}")
    elif request.form:
        logger.info(f"[REQUEST] Form данные: {dict(request.form)}")
    logger.info(f"[REQUEST] ========================")

@app.after_request
def log_response_info(response):
    logger.info(f"[RESPONSE] ===== ОТВЕТ =====")
    logger.info(f"[RESPONSE] Status Code: {response.status_code}")
    logger.info(f"[RESPONSE] Headers: {dict(response.headers)}")
    if response.is_json:
        logger.info(f"[RESPONSE] JSON ответ: {response.get_json()}")
    logger.info(f"[RESPONSE] =================")
    return response

def log_function_call(func):
    """Декоратор для логирования вызовов функций"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        logger.info(f"[FUNC] Вызов функции: {func.__name__}")
        logger.info(f"[FUNC] Аргументы: args={args}, kwargs={kwargs}")
        try:
            result = func(*args, **kwargs)
            logger.info(f"[FUNC] Функция {func.__name__} выполнена успешно")
            return result
        except Exception as e:
            logger.error(f"[FUNC] Ошибка в функции {func.__name__}: {str(e)}")
            raise
    return wrapper

# Конфигурация
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
DATA_FOLDER = os.path.join(BASE_DIR, 'data')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'avif', 'jfif'}
MAX_CONTENT_LENGTH = 32 * 1024 * 1024  # 32MB
THUMBNAIL_SIZE = (800, 600)  # Фиксированный размер для всех изображений
JPEG_QUALITY = 85  # Оптимальное качество для веба
MIN_IMAGE_SIZE = (400, 300)  # Минимальный размер изображения

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Создаем папки если их нет
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(DATA_FOLDER, exist_ok=True)

# Регистрируем поддержку HEIC/HEIF/AVIF в Pillow, если доступно
try:
    import pillow_heif  # type: ignore
    pillow_heif.register_heif_opener()
    logger.info("[IMAGES] pillow-heif зарегистрирован (HEIC/HEIF/AVIF поддерживаются)")
except Exception as e:
    logger.warning(f"[IMAGES] Не удалось зарегистрировать pillow-heif: {e}")

def allowed_file(filename: str) -> bool:
    """Возвращает True для любых входящих файлов.

    Мы не блокируем расширения на уровне проверки. Фактическая валидация
    и попытка декодирования выполняются позже в процессе обработки.

    Args:
        filename: Имя файла из формы.

    Returns:
        bool: Всегда True, чтобы не блокировать редкие форматы.
    """
    return True

def process_and_convert_image(file: FileStorage) -> tuple[io.BytesIO, tuple[int, int], str]:
    """Безопасно обрабатывает изображение и возвращает JPEG 800×600.

    Включает поддержку EXIF-ориентации, палитровых/прозрачных/CMYK изображений,
    обрезку/вписывание без ошибок и сохранение с приемлемым качеством.

    Если файл невозможно декодировать Pillow, функция возбуждает ValueError,
    а вызывающий код выполнит сохранение «как есть».

    Args:
        file: Файл, полученный из формы (`werkzeug.datastructures.FileStorage`).

    Returns:
        tuple[BytesIO, (int, int), str]: Буфер JPEG, итоговый размер, расширение "jpg".
    """
    try:
        # Читаем байты один раз и работаем из памяти, чтобы избежать проблем с указателем
        file.stream.seek(0)
        data = file.read()
        if not data:
            raise ValueError("Пустой файл")

        img = Image.open(io.BytesIO(data))

        # Авто-поворот по EXIF и материализация пикселей
        try:
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass

        # Приводим к RGB с учетом возможной прозрачности
        if img.mode in ("RGBA", "LA"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[-1])
            img = background
        elif img.mode == "P":
            img = img.convert("RGBA")
            background = Image.new("RGB", img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[-1])
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Вписываем изображение в 800×600 без искажений (letterbox)
        target_w, target_h = THUMBNAIL_SIZE
        img_copy = img.copy()
        img_copy.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)

        canvas = Image.new("RGB", (target_w, target_h), (255, 255, 255))
        paste_x = (target_w - img_copy.width) // 2
        paste_y = (target_h - img_copy.height) // 2
        canvas.paste(img_copy, (paste_x, paste_y))

        # Кодируем в JPEG
        output = io.BytesIO()
        canvas.save(output, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        output.seek(0)
        return output, THUMBNAIL_SIZE, "jpg"

    except Exception as exc:
        raise ValueError(f"Ошибка обработки изображения: {exc}")

@log_function_call
def load_works():
    """Загружает работы из JSON файла"""
    try:
        json_path = os.path.join(DATA_FOLDER, 'works.json')
        logger.info(f"[WORKS] Загружаем работы из {json_path}")
        with open(json_path, 'r', encoding='utf-8') as f:
            works = json.load(f)
        logger.info(f"[WORKS] Загружено {len(works)} работ")
        return works
    except FileNotFoundError:
        logger.warning(f"[WORKS] Файл {json_path} не найден, возвращаем пустой список")
        return []
    except json.JSONDecodeError:
        logger.error(f"[WORKS] Ошибка чтения JSON файла {json_path}, создаем новый")
        return []

@log_function_call
def save_works(works):
    """Сохраняет работы в JSON файл"""
    try:
        json_path = os.path.join(DATA_FOLDER, 'works.json')
        logger.info(f"[SAVE] Сохраняем {len(works)} работ в {json_path}")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(works, f, ensure_ascii=False, indent=2)
        logger.info(f"[SAVE] Работы успешно сохранены")
    except Exception as e:
        logger.error(f"[SAVE] Ошибка сохранения works.json: {e}")
        raise

def hash_password(password):
    """Хеширует пароль с солью"""
    salt = "postpress-salt-2025"
    return hashlib.sha256((password + salt).encode()).hexdigest()

def check_auth():
    """Проверяет авторизацию пользователя"""
    return session.get('authenticated', False)

def require_auth(f):
    """Декоратор для проверки авторизации"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not check_auth():
            return jsonify({'error': 'Требуется авторизация'}), 401
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/login', methods=['POST'])
@log_function_call
def login():
    """Авторизация в админ-панели"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        
        logger.info(f"[AUTH] Попытка входа для пользователя: {username}")
        
        # Получаем учетные данные из .env
        admin_login = os.getenv('LOGIN', 'admin')
        admin_password = os.getenv('PASSWORD', 'admin123')
        
        # Хешируем введенный пароль
        hashed_input_password = hash_password(password)
        hashed_admin_password = hash_password(admin_password)
        
        logger.info(f"[AUTH] Проверка: username={username == admin_login}, password_hash_match={hashed_input_password == hashed_admin_password}")
        
        # Проверяем логин и хешированный пароль
        if username == admin_login and hashed_input_password == hashed_admin_password:
            session['authenticated'] = True
            session['username'] = username
            logger.info(f"[AUTH] Успешная авторизация для {username}")
            return jsonify({
                'success': True,
                'message': 'Авторизация успешна',
                'user': username
            })
        else:
            logger.warning(f"[AUTH] Неудачная попытка входа для {username}")
            return jsonify({
                'success': False,
                'message': 'Неверный логин или пароль'
            }), 401
            
    except Exception as e:
        logger.error(f"[AUTH] Ошибка авторизации: {e}")
        return jsonify({'error': 'Ошибка сервера'}), 500

@app.route('/api/logout', methods=['POST'])
@log_function_call
def logout():
    """Выход из админ-панели"""
    username = session.get('username', 'unknown')
    session.clear()
    logger.info(f"[AUTH] Пользователь {username} вышел из системы")
    return jsonify({'success': True, 'message': 'Выход выполнен'})

@app.route('/api/auth/status', methods=['GET'])
@log_function_call
def auth_status():
    """Проверка статуса авторизации"""
    if check_auth():
        return jsonify({
            'authenticated': True,
            'user': session.get('username')
        })
    else:
        return jsonify({'authenticated': False})

@log_function_call
def send_email(name, phone, email, message=""):
    """
    Отправляет email заявку. Не критично если не работает.
    """
    logger.info(f"[EMAIL] Начинаем отправку email для {name}, {phone}")
    try:
        # Получаем настройки email
        smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.getenv('SMTP_PORT', '587'))
        sender_email = os.getenv('SENDER_EMAIL')
        sender_password = os.getenv('SENDER_PASSWORD')
        recipient_email = os.getenv('RECIPIENT_EMAIL')
        
        logger.info(f"[EMAIL] SMTP настройки - Server: {smtp_server}, Port: {smtp_port}")
        logger.info(f"[EMAIL] Sender: {sender_email}, Recipient: {recipient_email}")
        logger.info(f"[EMAIL] Password set: {bool(sender_password)}")
        
        # Если настройки не заданы, просто логируем заявку
        if not all([sender_email, sender_password, recipient_email]):
            logger.warning(f"[EMAIL] ПРЕДУПРЕЖДЕНИЕ: Email настройки не полные.")
            logger.warning(f"[EMAIL] Sender: {bool(sender_email)}, Password: {bool(sender_password)}, Recipient: {bool(recipient_email)}")
            logger.info(f"[EMAIL] Заявка логируется локально: {name}, {phone}, {message}")
            return False
            
        logger.info(f"[EMAIL] Настройки полные, создаем сообщение...")
        
        # Создаем и отправляем email
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = recipient_email
        msg['Subject'] = 'Новая заявка с сайта POSTPRESS'
        
        body = f"""
Новая заявка с сайта POSTPRESS:

Имя: {name}
Телефон: {phone}
Сообщение: {message}

Дата: {datetime.now().strftime('%d.%m.%Y %H:%M')}
        """
        
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        logger.info(f"[EMAIL] Сообщение создано, подключаемся к SMTP...")
        
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            logger.info(f"[EMAIL] Подключились к {smtp_server}:{smtp_port}")
            server.starttls()
            logger.info(f"[EMAIL] STARTTLS выполнен")
            server.login(sender_email, sender_password)
            logger.info(f"[EMAIL] Авторизация успешна")
            server.send_message(msg)
            logger.info(f"[EMAIL] Сообщение отправлено")
        
        logger.info(f"[EMAIL] SUCCESS: Email отправлен успешно для {name}, {phone}")
        return True
        
    except Exception as e:
        logger.error(f"[EMAIL] ERROR: Ошибка отправки email: {e}")
        import traceback
        logger.error(f"[EMAIL] ERROR TRACEBACK: {traceback.format_exc()}")
        logger.info(f"[EMAIL] Заявка сохранена локально: {name}, {phone}, {message}")
        return False

# API routes
@app.route('/api/works', methods=['GET'])
@log_function_call
def get_works():
    logger.info("[API] Получение списка работ")
    works = load_works()
    logger.info(f"[API] Возвращаем {len(works)} работ")
    return jsonify(works)

@app.route('/api/works', methods=['POST'])
@log_function_call
@require_auth
def add_work():
    """Создает новую работу"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Нет данных для создания работы'}), 400
            
        works = load_works()
        
        # Валидация данных
        title = data.get('title', '').strip()
        description = data.get('description', '').strip()
        area = data.get('area', '').strip()
        
        if not title:
            return jsonify({'error': 'Название работы обязательно'}), 400
        
        new_work = {
            'id': str(uuid.uuid4()),
            'title': title,
            'description': description,
            'area': area,
            'images': [],
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
        
        works.append(new_work)
        save_works(works)
        
        return jsonify(new_work), 201
    except Exception as e:
        print(f"Ошибка создания работы: {e}")
        return jsonify({'error': f'Ошибка создания работы: {str(e)}'}), 500

@app.route('/api/works/<work_id>', methods=['PUT'])
@log_function_call
@require_auth
def update_work(work_id):
    """Обновляет существующую работу"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Нет данных для обновления'}), 400
            
        works = load_works()
        
        work = next((w for w in works if w['id'] == work_id), None)
        if not work:
            return jsonify({'error': 'Работа не найдена'}), 404
        
        # Валидация данных
        title = data.get('title', work['title']).strip()
        description = data.get('description', work['description']).strip()
        area = data.get('area', work['area']).strip()
        
        if not title:
            return jsonify({'error': 'Название работы обязательно'}), 400
            
        work.update({
            'title': title,
            'description': description,
            'area': area,
            'updated_at': datetime.now().isoformat()
        })
        
        save_works(works)
        return jsonify(work)
    except Exception as e:
        print(f"Ошибка обновления работы: {e}")
        return jsonify({'error': f'Ошибка обновления работы: {str(e)}'}), 500

@app.route('/api/works/<work_id>', methods=['DELETE'])
@log_function_call
@require_auth
def delete_work(work_id):
    try:
        works = load_works()
        work = next((w for w in works if w['id'] == work_id), None)
        
        if not work:
            return jsonify({'error': 'Работа не найдена'}), 404
            
        # Удаляем изображения
        for image in work.get('images', []):
            image_path = os.path.join(UPLOAD_FOLDER, image)
            if os.path.exists(image_path):
                os.remove(image_path)
                
        works = [w for w in works if w['id'] != work_id]
        save_works(works)
        
        return jsonify({'message': 'Работа удалена'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/works/<work_id>/images', methods=['POST'])
@log_function_call
@require_auth
def upload_image(work_id):
    """Загружает и обрабатывает изображение для работы"""
    try:
        works = load_works()
        work = next((w for w in works if w['id'] == work_id), None)
        
        if not work:
            return jsonify({'error': 'Работа не найдена'}), 404
            
        if 'image' not in request.files:
            return jsonify({'error': 'Нет файла для загрузки'}), 400
            
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'Файл не выбран'}), 400
            
        if not file or not allowed_file(file.filename):
            return jsonify({'error': f'Неподдерживаемый формат файла. Поддерживаются: {", ".join(ALLOWED_EXTENSIONS)}'}), 400
        
        # Проверяем размер файла
        file.seek(0, 2)  # Переходим в конец файла
        file_size = file.tell()
        file.seek(0)  # Возвращаемся в начало
        
        if file_size > MAX_CONTENT_LENGTH:
            return jsonify({'error': f'Файл слишком большой. Максимальный размер: {MAX_CONTENT_LENGTH // (1024*1024)}MB'}), 400
        
        if file_size == 0:
            return jsonify({'error': 'Файл поврежден или пуст'}), 400
            
        # Сохраняем файл как есть, без изменения размера и перекодирования
        # Определяем расширение, сохраняем как оригинал
        original_ext = pathlib.Path(file.filename or '').suffix.lower().lstrip('.')
        if not original_ext or len(original_ext) > 10:
            original_ext = 'jpg'  # безопасное дефолтное расширение
        filename = f"{uuid.uuid4()}.{original_ext}"
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        # Убеждаемся, что указатель на начало и сохраняем поток напрямую
        try:
            file.stream.seek(0)
        except Exception:
            pass
        file.save(file_path)

        # Пробуем получить размеры без изменения файла (не критично)
        image_size = (0, 0)
        try:
            with Image.open(file_path) as img:
                img.load()
            image_size = (img.width, img.height)
        except Exception:
            pass
        
        # Добавляем в список изображений работы
        if 'images' not in work:
            work['images'] = []
        work['images'].append(filename)
        
        # Добавляем метаданные изображения
        work['updated_at'] = datetime.now().isoformat()
        
        save_works(works)
        
        return jsonify({'filename': filename, 'size': image_size, 'message': 'Изображение успешно загружено'}), 201
        
    except Exception as e:
        print(f"Ошибка загрузки изображения: {e}")
        return jsonify({'error': f'Внутренняя ошибка сервера: {str(e)}'}), 500

@app.route('/api/works/<work_id>/images/<filename>', methods=['DELETE'])
@log_function_call
@require_auth
def delete_image(work_id, filename):
    try:
        works = load_works()
        work = next((w for w in works if w['id'] == work_id), None)
        
        if not work:
            return jsonify({'error': 'Работа не найдена'}), 404
            
        if filename in work['images']:
            work['images'].remove(filename)
            save_works(works)
            
            file_path = os.path.join(UPLOAD_FOLDER, filename)
            if os.path.exists(file_path):
                os.remove(file_path)
                
            return jsonify({'message': 'Изображение удалено'})
        else:
            return jsonify({'error': 'Изображение не найдено'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/contact', methods=['POST'])
@log_function_call
def send_contact():
    """Обработка контактной формы с полным логированием"""
    logger.info("[CONTACT] =================== CONTACT API ВЫЗВАН ===================")
    
    try:
        logger.info("[CONTACT] Шаг 1: Начинаем обработку контактной формы")
        
        # Получаем данные из запроса
        logger.info("[CONTACT] Шаг 2: Получаем JSON данные из запроса")
        data = request.get_json()
        logger.info(f"[CONTACT] Шаг 3: Получены данные: {data}")
        logger.info(f"[CONTACT] Шаг 4: Тип данных: {type(data)}")
        
        if not data:
            logger.warning("[CONTACT] Шаг 5: Данные пустые - возвращаем ошибку 400")
            return jsonify({'error': 'Нет данных в запросе'}), 400
        
        # Извлекаем поля
        logger.info("[CONTACT] Шаг 6: Извлекаем поля из данных")
        name = data.get('name', '')
        phone = data.get('phone', '')
        message = data.get('message', '')
        
        logger.info(f"[CONTACT] Шаг 7: Извлеченные поля:")
        logger.info(f"[CONTACT]   - Имя: '{name}' (тип: {type(name)}, длина: {len(name)})")
        logger.info(f"[CONTACT]   - Телефон: '{phone}' (тип: {type(phone)}, длина: {len(phone)})")
        logger.info(f"[CONTACT]   - Сообщение: '{message[:100]}...' (тип: {type(message)}, длина: {len(message)})")
        
        # Валидация
        logger.info("[CONTACT] Шаг 8: Проводим валидацию")
        if not name or not name.strip():
            logger.warning("[CONTACT] Шаг 9: Имя пустое - возвращаем ошибку")
            return jsonify({'error': 'Укажите ваше имя'}), 400
        
        if not phone or not phone.strip():
            logger.warning("[CONTACT] Шаг 10: Телефон пустой - возвращаем ошибку")
            return jsonify({'error': 'Укажите номер телефона'}), 400
        
        logger.info("[CONTACT] Шаг 11: Валидация прошла успешно!")
        
        # Сохраняем заявку в файл для истории
        logger.info("[CONTACT] Шаг 12: Сохраняем заявку в файл")
        try:
            contact_data = {
                'name': name.strip(),
                'phone': phone.strip(),
                'message': message.strip(),
                'timestamp': datetime.now().isoformat(),
                'ip_address': request.remote_addr,
                'user_agent': str(request.user_agent)
            }
            
            contacts_file = os.path.join(DATA_FOLDER, 'contacts.json')
            logger.info(f"[CONTACT] Шаг 13: Файл для сохранения: {contacts_file}")
            
            # Загружаем существующие контакты
            if os.path.exists(contacts_file):
                with open(contacts_file, 'r', encoding='utf-8') as f:
                    contacts = json.load(f)
                logger.info(f"[CONTACT] Шаг 14: Загружено {len(contacts)} существующих контактов")
            else:
                contacts = []
                logger.info("[CONTACT] Шаг 14: Создаем новый файл контактов")
            
            contacts.append(contact_data)
            
            # Сохраняем обновленный список
            with open(contacts_file, 'w', encoding='utf-8') as f:
                json.dump(contacts, f, ensure_ascii=False, indent=2)
            
            logger.info(f"[CONTACT] Шаг 15: Заявка сохранена успешно. Всего контактов: {len(contacts)}")
            
        except Exception as save_error:
            logger.error(f"[CONTACT] Шаг 15: Ошибка сохранения в файл: {save_error}")
            # Продолжаем, даже если сохранение не удалось
        
        # Попытка отправки email (не критично)
        logger.info("[CONTACT] Шаг 16: Попытка отправки email")
        try:
            send_email(name.strip(), phone.strip(), "", message.strip())
            logger.info("[CONTACT] Шаг 17: Email отправлен успешно")
        except Exception as email_error:
            logger.warning(f"[CONTACT] Шаг 17: Ошибка отправки email (не критично): {email_error}")
        
        logger.info("[CONTACT] Шаг 18: Возвращаем успешный ответ")
        response_data = {'message': 'Заявка принята! Спасибо за обращение, мы свяжемся с вами в ближайшее время.'}
        logger.info(f"[CONTACT] Шаг 19: Ответ клиенту: {response_data}")
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"[CONTACT] ERROR: КРИТИЧЕСКАЯ ОШИБКА: {str(e)}")
        logger.error(f"[CONTACT] ERROR: ТИП ОШИБКИ: {type(e).__name__}")
        
        # Подробная информация об ошибке
        import traceback
        logger.error(f"[CONTACT] ERROR: ПОЛНЫЙ ТРЕЙСБЭК:\n{traceback.format_exc()}")
        
        error_response = {'error': f'Внутренняя ошибка сервера: {str(e)}'}
        logger.error(f"[CONTACT] ERROR: Возвращаем ошибку клиенту: {error_response}")
        
        return jsonify(error_response), 500

@app.route('/uploads/<filename>')
@log_function_call
def uploaded_file(filename):
    """Отдает загруженные изображения"""
    logger.info(f"[FILES] Запрос файла: {filename}")
    try:
        # Проверяем, что файл существует
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        logger.info(f"[FILES] Проверяем путь: {file_path}")
        if not os.path.exists(file_path):
            logger.warning(f"[FILES] Файл не найден: {file_path}")
            return jsonify({'error': 'Файл не найден'}), 404
            
        # Безопасно отдаем файл
        logger.info(f"[FILES] Отдаем файл: {filename}")
        return send_from_directory(UPLOAD_FOLDER, filename)
    except Exception as e:
        logger.error(f"[FILES] Ошибка при отдаче файла {filename}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/health')
@log_function_call
def health():
    logger.info("[HEALTH] Health check запрос")
    return jsonify({'status': 'ok', 'version': 'LOGGED_VERSION_2025', 'message': 'All systems operational!'})

@app.route('/api/test')
@log_function_call
def test():
    logger.info("[TEST] TEST ENDPOINT ВЫЗВАН!")
    return jsonify({'message': 'Тестовый endpoint работает!', 'version': 'LOGGED_VERSION_2025'})

if __name__ == '__main__':
    logger.info("[STARTUP] ==========================================")
    logger.info("[STARTUP] ЗАПУСК POSTPRESS FLASK API")
    logger.info("[STARTUP] ==========================================")
    logger.info("[STARTUP] Версия: LOGGED_VERSION_2025")
    logger.info("[STARTUP] Порт: 5000")
    logger.info("[STARTUP] Логирование: ВКЛЮЧЕНО")
    logger.info("[STARTUP] Файл логов: app.log")
    logger.info("[STARTUP] Папка uploads: " + UPLOAD_FOLDER)
    logger.info("[STARTUP] Папка data: " + DATA_FOLDER)
    logger.info("[STARTUP] ==========================================")
    app.run(host='0.0.0.0', port=5000, debug=True) 