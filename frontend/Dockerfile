FROM nginx:alpine

# Создаем рабочую директорию
WORKDIR /usr/share/nginx/html

# Удаляем дефолтные файлы nginx
RUN rm -rf ./*

# Копируем статические файлы (HTML, CSS, JS)
COPY *.html ./
COPY *.css ./
COPY *.js ./

# Копируем конфигурацию nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Добавляем метку для принудительного обновления
LABEL version="1.0"
LABEL updated=$(date)

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"] 