import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // 多个迭代测试文件共享同一远程数据库（seed/cleanup 操作同表），
    // 文件级并行会产生清理竞态（迭代15 与 16b 曾复现假失败），强制串行执行。
    fileParallelism: false,
  },
});
