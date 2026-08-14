#!/bin/sh
# 迭代25 · 工单14 · 容器入口：等待数据库就绪 → 执行迁移 → 启动应用
set -e

echo "[SPI-OS] 等待数据库就绪：${DB_HOST:-db}:${DB_PORT:-2881} ..."
RETRIES=60
until nc -z "${DB_HOST:-db}" "${DB_PORT:-2881}" 2>/dev/null; do
  RETRIES=$((RETRIES-1))
  if [ "$RETRIES" -le 0 ]; then
    echo "[SPI-OS] 数据库等待超时（120s），中止启动" >&2
    exit 1
  fi
  sleep 2
done
echo "[SPI-OS] 数据库端口可达，执行 Drizzle 迁移..."
npx drizzle-kit migrate || echo "[SPI-OS] 迁移失败或无待执行迁移（继续启动，人工核查 drizzle/ 目录）"

echo "[SPI-OS] 启动应用（PORT=${PORT:-3000}）"
exec node dist/index.js
