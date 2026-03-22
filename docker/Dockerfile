# docker/dockerfile
# 1. builder
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 2. runner
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
# data dir（SQLiteファイルを置く）
RUN mkdir -p /app/data
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]