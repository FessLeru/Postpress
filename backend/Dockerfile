FROM python:3.11-slim

WORKDIR /app

# Устанавливаем системные зависимости
RUN apt-get update && \
    apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Копируем и устанавливаем Python зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# Создаем необходимые директории с правильными правами
RUN mkdir -p uploads data && \
    chmod 777 uploads data

# Копируем код приложения
COPY app.py .

# Копируем данные если есть
COPY data/ ./data/

# Добавляем метку для обновления
LABEL version="1.0"
LABEL updated=$(date)

# Проверяем здоровье приложения
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

EXPOSE 5000

# Запускаем с правильными правами
USER nobody
ENV PYTHONUNBUFFERED=1

# Запускаем Flask приложение через gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120", "app:app"] 