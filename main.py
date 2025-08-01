#!/usr/bin/env python3
"""
POSTPRESS - Local Development Server
Простой локальный сервер для тестирования frontend части сайта элитной упаковки
"""

import http.server
import socketserver
import webbrowser
import os
import sys
from pathlib import Path
import urllib.request
import urllib.error
from urllib.parse import urljoin

# Конфигурация
PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
BACKEND_URL = "http://localhost:5000"  # URL бэкенда

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Кастомный обработчик для корректной работы с HTML файлами и API запросами"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)
    
    def end_headers(self):
        # Добавляем CORS заголовки для локальной разработки
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        """Обработка CORS preflight запросов"""
        self.send_response(200)
        self.end_headers()
    
    def do_GET(self):
        """Обработка GET запросов"""
        # Проксируем запросы к API на бэкенд
        if self.path.startswith('/api/'):
            self.proxy_request('GET')
            return
        # Обрабатываем запросы к изображениям
        elif self.path.startswith('/uploads/'):
            filename = os.path.basename(self.path)
            file_path = os.path.join(BASE_DIR, 'backend', 'uploads', filename)
            if os.path.exists(file_path):
                self.send_response(200)
                self.send_header('Content-type', 'image/jpeg')
                self.end_headers()
                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())
                return
            else:
                self.send_error(404, "File not found")
                return
            
        # Для остальных запросов показываем статические файлы
        if self.path == '/':
            self.path = '/index.html'
        elif self.path == '/admin' or self.path == '/admin/':
            self.path = '/admin.html'
        
        return super().do_GET()
    
    def do_POST(self):
        """Обработка POST запросов"""
        if self.path.startswith('/api/'):
            self.proxy_request('POST')
            return
        self.send_error(404, "Not Found")
    
    def do_PUT(self):
        """Обработка PUT запросов"""
        if self.path.startswith('/api/'):
            self.proxy_request('PUT')
            return
        self.send_error(404, "Not Found")
    
    def do_DELETE(self):
        """Обработка DELETE запросов"""
        if self.path.startswith('/api/'):
            self.proxy_request('DELETE')
            return
        self.send_error(404, "Not Found")
    
    def proxy_request(self, method):
        """Проксирование запросов на бэкенд"""
        try:
            # Формируем URL для бэкенда
            backend_url = urljoin(BACKEND_URL, self.path)
            
            # Читаем тело запроса, если есть
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else None
            
            # Создаем запрос
            request = urllib.request.Request(
                backend_url,
                data=body,
                method=method,
                headers={k: v for k, v in self.headers.items() if k.lower() not in ['host', 'content-length']}
            )
            
            # Отправляем запрос на бэкенд
            with urllib.request.urlopen(request) as response:
                # Копируем статус и заголовки
                self.send_response(response.status)
                for header, value in response.getheaders():
                    if header.lower() not in ['server', 'date', 'transfer-encoding']:
                        self.send_header(header, value)
                self.end_headers()
                
                # Копируем тело ответа
                self.wfile.write(response.read())
                
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for header, value in e.headers.items():
                if header.lower() not in ['server', 'date', 'transfer-encoding']:
                    self.send_header(header, value)
            self.end_headers()
            self.wfile.write(e.read())
            
        except Exception as e:
            self.send_error(500, f"Proxy Error: {str(e)}")
    
    def log_message(self, format, *args):
        """Кастомное логирование"""
        print(f"[{self.date_time_string()}] {format % args}")

def check_frontend_files():
    """Проверяем наличие необходимых файлов"""
    required_files = [
        'index.html',
        'admin.html', 
        'style.css',
        'admin.css',
        'script.js',
        'admin.js'
    ]
    
    frontend_path = Path(FRONTEND_DIR)
    if not frontend_path.exists():
        print(f"❌ Папка {FRONTEND_DIR} не найдена!")
        return False
    
    missing_files = []
    for file in required_files:
        if not (frontend_path / file).exists():
            missing_files.append(file)
    
    if missing_files:
        print(f"❌ Отсутствуют файлы: {', '.join(missing_files)}")
        return False
    
    print("✅ Все необходимые файлы найдены")
    return True

def check_backend():
    """Проверяем доступность бэкенда"""
    try:
        with urllib.request.urlopen(BACKEND_URL + '/api/works') as response:
            if response.status == 200:
                print("✅ Бэкенд доступен")
                return True
    except:
        print("❌ Бэкенд недоступен!")
        print(f"💡 Убедитесь, что бэкенд запущен на {BACKEND_URL}")
        return False

def start_server():
    """Запускаем локальный сервер"""
    try:
        with socketserver.TCPServer(("", PORT), CustomHTTPRequestHandler) as httpd:
            server_url = f"http://localhost:{PORT}"
            admin_url = f"http://localhost:{PORT}/admin"
            
            print("\n🚀 POSTPRESS - Локальный сервер запущен!")
            print("=" * 50)
            print(f"📱 Основной сайт:  {server_url}")
            print(f"⚙️  Админ-панель:   {admin_url}")
            print("=" * 50)
            print("💡 Для остановки нажмите Ctrl+C")
            print()
            
            # Автоматически открываем браузер
            try:
                print("🌐 Открываю браузер...")
                webbrowser.open(server_url)
            except Exception as e:
                print(f"⚠️  Не удалось открыть браузер: {e}")
                print(f"   Откройте вручную: {server_url}")
            
            print(f"🎯 Сервер работает на порту {PORT}")
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\n👋 Сервер остановлен")
    except OSError as e:
        if e.errno == 10048:  # Windows: порт занят
            print(f"❌ Порт {PORT} уже используется!")
            print("💡 Попробуйте:")
            print(f"   - Закрыть другие сервера на порту {PORT}")
            print(f"   - Изменить PORT в {__file__}")
        else:
            print(f"❌ Ошибка запуска сервера: {e}")
    except Exception as e:
        print(f"❌ Неожиданная ошибка: {e}")

def main():
    """Главная функция"""
    print("📦 POSTPRESS - Элитная упаковка")
    print("   Локальный сервер для тестирования")
    print()
    
    # Проверяем файлы
    if not check_frontend_files():
        print("\n💡 Убедитесь, что вы находитесь в корневой папке проекта")
        sys.exit(1)
    
    # Проверяем бэкенд
    if not check_backend():
        print("\n💡 Запустите сначала бэкенд, затем перезапустите этот скрипт")
        sys.exit(1)
    
    # Показываем текущую директорию
    print(f"📁 Рабочая директория: {BASE_DIR}")
    print(f"🗂️  Статические файлы: {FRONTEND_DIR}")
    print()
    
    # Запускаем сервер
    start_server()

if __name__ == "__main__":
    main() 