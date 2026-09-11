FROM php:8.4-fpm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    unzip \
    libicu-dev \
    libzip-dev \
    libgmp-dev \
    zlib1g-dev \
  && docker-php-ext-install -j$(nproc) intl opcache zip pdo_mysql gmp \
  && pecl install apcu \
  && docker-php-ext-enable apcu \
  && rm -rf /var/lib/apt/lists/*

COPY docker/development/php/conf.d/app.ini /usr/local/etc/php/conf.d/app.ini
COPY docker/development/php/php-fpm.d/zz-clear-env.conf /usr/local/etc/php-fpm.d/zz-clear-env.conf

WORKDIR /var/www/backend