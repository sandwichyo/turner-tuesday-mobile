# syntax=docker/dockerfile:1.7

# Build frontend assets so nginx can serve them statically
FROM node:24-alpine AS frontend_assets
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN mkdir -p /backend/public/build && npm run build:client

FROM nginx:1.27-alpine

COPY docker/deployment/nginx/prod.conf /etc/nginx/conf.d/default.conf

# Static assets served directly by nginx (no PHP round-trip)
COPY --from=frontend_assets /backend/public/build /var/www/backend/public/build
COPY assets/ /var/www/backend/public/characters/

# Web-root static files (favicons, manifest, robots, service worker) served
# directly by nginx
COPY backend/public/favicon.ico backend/public/favicon.svg backend/public/favicon-96x96.png \
     backend/public/apple-touch-icon.png \
     backend/public/web-app-manifest-192x192.png backend/public/web-app-manifest-512x512.png \
     backend/public/site.webmanifest backend/public/robots.txt \
     backend/public/sw.js backend/public/offline.html \
     /var/www/backend/public/

RUN --mount=type=secret,id=nginx_htpasswd,required=true \
    cp /run/secrets/nginx_htpasswd /etc/nginx/.htpasswd \
    && chown root:nginx /etc/nginx/.htpasswd \
    && chmod 640 /etc/nginx/.htpasswd