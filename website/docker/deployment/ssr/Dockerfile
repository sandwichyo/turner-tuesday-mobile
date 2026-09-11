FROM node:24-alpine AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN mkdir -p /backend/ssr && npm run build:ssr

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /backend/ssr ./ssr

EXPOSE 13714
CMD ["node", "ssr/ssr.js"]
