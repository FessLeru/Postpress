from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
from datetime import datetime
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from werkzeug.utils import secure_filename
import uuid
from PIL import Image
import io
import pathlib

app = Flask(__name__)
CORS(app)

# Конфигурация
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
DATA_FOLDER = os.path.join(BASE_DIR, 'data')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff'}
MAX_CONTENT_LENGTH = 32 * 1024 * 1024  # 32MB
THUMBNAIL_SIZE = (800, 600)  # Фиксированный размер для всех изображений
JPEG_QUALITY = 85  # Оптимальное качество для веба
MIN_IMAGE_SIZE = (400, 300)  # Минимальный размер изображения

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Создаем папки если их нет
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(DATA_FOLDER, exist_ok=True)

def allowed_file(filename):
    """Проверяет допустимость расширения файла"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def process_and_convert_image(file):
    """
    Обрабатывает изображение: конвертирует в JPG, 
    стандартизирует размер и качество
    """
    try:
        # Открываем изображение с помощью PIL
        image = Image.open(file.stream)
        
        # Проверяем минимальный размер
        if image.size[0] < MIN_IMAGE_SIZE[0] or image.size[1] < MIN_IMAGE_SIZE[1]:
            raise ValueError(f"Изображение слишком маленькое. Минимальный размер: {MIN_IMAGE_SIZE[0]}x{MIN_IMAGE_SIZE[1]} пикселей")
        
        # Конвертируем в RGB (необходимо для JPG)
        if image.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            background.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
            image = background
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Создаем копию с правильными пропорциями
        aspect_ratio = THUMBNAIL_SIZE[0] / THUMBNAIL_SIZE[1]
        current_ratio = image.size[0] / image.size[1]
        
        if current_ratio > aspect_ratio:
            # Изображение слишком широкое
            new_width = int(image.size[1] * aspect_ratio)
            left = (image.size[0] - new_width) // 2
            image = image.crop((left, 0, left + new_width, image.size[1]))
        else:
            # Изображение слишком высокое
            new_height = int(image.size[0] / aspect_ratio)
            top = (image.size[1] - new_height) // 2
            image = image.crop((0, top, image.size[0], top + new_height))
        
        # Изменяем размер до стандартного
        image = image.resize(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
        
        # Сохраняем в байтовый поток
        output = io.BytesIO()
        image.save(output, format='JPEG', quality=JPEG_QUALITY, optimize=True)
        output.seek(0)
        
        return output, THUMBNAIL_SIZE
        
    except Exception as e:
        raise ValueError(f"Ошибка обработки изображения: {str(e)}")

def load_works():
    """Загружает работы из JSON файла"""
    try:
        json_path = os.path.join(DATA_FOLDER, 'works.json')
        with open(json_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return []
    except json.JSONDecodeError:
        print("Ошибка чтения JSON файла, создаем новый")
        return []

def save_works(works):
    """Сохраняет работы в JSON файл"""
    try:
        json_path = os.path.join(DATA_FOLDER, 'works.json')
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(works, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Ошибка сохранения works.json: {e}")
        raise

def send_email(name, phone, email, message=""):
    try:
        smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.getenv('SMTP_PORT', '587'))
        sender_email = os.getenv('SENDER_EMAIL')
        sender_password = os.getenv('SENDER_PASSWORD')
        recipient_email = os.getenv('RECIPIENT_EMAIL')
        
        if not all([sender_email, sender_password, recipient_email]):
            return False
            
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = recipient_email
        msg['Subject'] = 'Новая заявка с сайта POSTPRESS'
        
        body = f"""
        Новая заявка с сайта:
        
        Имя: {name}
        Телефон: {phone}
        Email: {email}
        Сообщение: {message}
        
        Дата: {datetime.now().strftime('%d.%m.%Y %H:%M')}
        """
        
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(sender_email, sender_password)
        server.send_message(msg)
        server.quit()
        
        return True
    except Exception as e:
        print(f"Ошибка отправки email: {e}")
        return False

# API routes
@app.route('/api/works', methods=['GET'])
def get_works():
    works = load_works()
    return jsonify(works)

@app.route('/api/works', methods=['POST'])
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
            
        # Обрабатываем и конвертируем изображение
        try:
            processed_image, image_size = process_and_convert_image(file)
        except ValueError as e:
            return jsonify({'error': str(e)}), 400
        
        # Генерируем уникальное имя файла с расширением .jpg
        filename = f"{uuid.uuid4()}.jpg"
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        
        # Сохраняем обработанное изображение
        with open(file_path, 'wb') as f:
            f.write(processed_image.getvalue())
        
        # Добавляем в список изображений работы
        if 'images' not in work:
            work['images'] = []
        work['images'].append(filename)
        
        # Добавляем метаданные изображения
        work['updated_at'] = datetime.now().isoformat()
        
        save_works(works)
        
        return jsonify({
            'filename': filename,
            'size': image_size,
            'message': 'Изображение успешно загружено и обработано'
        }), 201
        
    except Exception as e:
        print(f"Ошибка загрузки изображения: {e}")
        return jsonify({'error': f'Внутренняя ошибка сервера: {str(e)}'}), 500

@app.route('/api/works/<work_id>/images/<filename>', methods=['DELETE'])
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
def send_contact():
    try:
        data = request.get_json()
        name = data.get('name', '')
        phone = data.get('phone', '')
        email = data.get('email', '')
        message = data.get('message', '')
        
        if not phone and not email:
            return jsonify({'error': 'Укажите телефон или email'}), 400
            
        success = send_email(name, phone, email, message)
        
        if success:
            return jsonify({'message': 'Заявка отправлена'})
        else:
            return jsonify({'error': 'Ошибка отправки заявки'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    """Отдает загруженные изображения"""
    try:
        # Проверяем, что файл существует
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        if not os.path.exists(file_path):
            return jsonify({'error': 'Файл не найден'}), 404
            
        # Безопасно отдаем файл
        return send_from_directory(UPLOAD_FOLDER, filename)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health')
def health():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True) 