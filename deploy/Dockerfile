# 迭代25 · 工单14 · SPI-OS 私有化交付镜像（多阶段构建）
# 注意：此 Dockerfile 位于 deploy/ 目录，用于客户私有化容器交付（docker compose -f deploy/docker-compose.yml up -d）。
# Manus 云端发布不使用此文件（项目根目录无 Dockerfile，走默认模板）。
# 构建（在项目根目录）：docker build -f deploy/Dockerfile -t spi-os:latest .

# ---- 构建层 ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- 运行层 ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY deploy/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
# 端口从 env 读取（严禁硬编码）；compose 中映射
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
