FROM composer:2 AS vendor
WORKDIR /app

COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --prefer-dist --no-interaction --no-progress --optimize-autoloader --no-scripts

FROM node:24-alpine AS frontend
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN mkdir -p /backend/public/build && npm run build:client

FROM php:8.4-fpm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libicu-dev \
    libzip-dev \
    libgmp-dev \
    zlib1g-dev \
  && docker-php-ext-install -j$(nproc) intl opcache zip pdo_mysql gmp \
  && pecl install apcu \
  && docker-php-ext-enable apcu \
  && rm -rf /var/lib/apt/lists/*

COPY docker/deployment/php/conf.d/app.ini /usr/local/etc/php/conf.d/app.ini
COPY docker/deployment/php/php-fpm.d/zz-clear-env.conf /usr/local/etc/php-fpm.d/zz-clear-env.conf
COPY docker/deployment/php/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /var/www/backend

COPY backend/ /var/www/backend/
COPY --from=vendor /app/vendor /var/www/backend/vendor
COPY --from=frontend /backend/public/build /var/www/backend/public/build
COPY assets/ /var/www/backend/public/characters/

RUN mkdir -p var/cache var/log var/startgg \
  && APP_ENV=prod APP_SECRET=warmup_build_placeholder APP_DEBUG=0 \
     DEFAULT_URI=https://example.com INERTIA_VERSION=1 \
     INERTIA_SSR_ENABLED=false INERTIA_SSR_URL=http://ssr:13714 \
     php bin/console cache:warmup --env=prod --no-debug \
  && chown -R www-data:www-data var

ENTRYPOINT ["entrypoint.sh"]
CMD ["php-fpm"]