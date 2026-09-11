FROM php:8.4-fpm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    unzip \
    libicu-dev \
    libzip-dev \
    zlib1g-dev \
  && docker-php-ext-install -j$(nproc) intl opcache zip \
  && pecl install apcu \
  && docker-php-ext-enable apcu \
  && rm -rf /var/lib/apt/lists/*

COPY docker/php/conf.d/app.ini /usr/local/etc/php/conf.d/app.ini

WORKDIR /var/www/backend
