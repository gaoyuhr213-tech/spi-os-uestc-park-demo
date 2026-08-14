/* 迭代23 · 工单11 · 验收报告生成器
 * 运行验收 Harness（vitest JSON reporter），逐条输出 PASS/FAIL + 证据 → docs/acceptance-report.md
 * 用法：npx tsx scripts/acceptanceReport.ts
 * 任一 FAIL 时进程以非零码退出（红阻断，可接 CI）。
 */
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const JSON_OUT = path.join(ROOT, ".acceptance-result.json");
const REPORT = path.join(ROOT, "docs", "acceptance-report.md");

interface VitestAssertion {
  fullName: string;
  status: "passed" | "failed" | "pending" | "skipped" | "todo";
  title: string;
  duration?: number;
  failureMessages: string[];
  ancestorTitles: string[];
}
interface VitestJson {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  startTime: number;
  testResults: Array<{ name: string; assertionResults: VitestAssertion[] }>;
}

function run(): VitestJson {
  if (existsSync(JSON_OUT)) unlinkSync(JSON_OUT);
  try {
    execSync(`npx vitest run server/acceptance/workorders.test.ts --reporter=json --outputFile=${JSON_OUT}`, {
      cwd: ROOT, stdio: "pipe", timeout: 300_000,
    });
  } catch {
    // vitest 有失败用例时以非零码退出，但 JSON 已写出——继续解析
  }
  if (!existsSync(JSON_OUT)) throw new Error("vitest JSON 输出缺失，Harness 未能运行");
  return JSON.parse(readFileSync(JSON_OUT, "utf-8")) as VitestJson;
}

function acId(title: string): string {
  const m = title.match(/^(AC-\d+-\d+)/);
  return m ? m[1] : "AC-?";
}

function main() {
  const r = run();
  const all: VitestAssertion[] = r.testResults.flatMap((f) => f.assertionResults);
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const failed = all.filter((a) => a.status === "failed");

  const lines: string[] = [];
  lines.push(`# SPI-OS 验收报告（工单1-9 回归 Harness）`);
  lines.push(``);
  lines.push(`> 生成时间：${now} UTC · 生成方式：\`npx tsx scripts/acceptanceReport.ts\`（自动运行 \`server/acceptance/workorders.test.ts\` 后逐条落盘，非手写）`);
  lines.push(``);
  lines.push(`## 总览`);
  lines.push(``);
  lines.push(`| 指标 | 值 |`);
  lines.push(`| --- | --- |`);
  lines.push(`| 验收用例总数 | ${r.numTotalTests} |`);
  lines.push(`| 通过 | ${r.numPassedTests} |`);
  lines.push(`| 失败 | ${r.numFailedTests} |`);
  lines.push(`| 结论 | ${r.numFailedTests === 0 ? "✅ 全部通过（可进入下一工单）" : "🔴 红阻断（存在 FAIL，禁止推进）"} |`);
  lines.push(``);
  lines.push(`## 逐条明细`);
  lines.push(``);
  lines.push(`| 用例 | 工单 | 验收口径 | 结果 | 耗时 |`);
  lines.push(`| --- | --- | --- | --- | --- |`);
  for (const a of all) {
    const group = a.ancestorTitles.join(" / ") || "-";
    const desc = a.title.replace(/^AC-\d+-\d+\s*/, "");
    const status = a.status === "passed" ? "✅ PASS" : a.status === "failed" ? "🔴 FAIL" : a.status;
    lines.push(`| ${acId(a.title)} | ${group} | ${desc} | ${status} | ${a.duration ?? 0}ms |`);
  }
  lines.push(``);
  if (failed.length > 0) {
    lines.push(`## 失败证据`);
    lines.push(``);
    for (const a of failed) {
      lines.push(`### ${acId(a.title)} ${a.title}`);
      lines.push("```");
      lines.push(a.failureMessages.join("\n").slice(0, 2000));
      lines.push("```");
      lines.push(``);
    }
  }
  lines.push(`## 验收口径说明`);
  lines.push(``);
  lines.push(`- 每条用例断言对齐原工单验收原文（docs/workorder-23-26-spec.md 附录），不弱化。`);
  lines.push(`- Harness 全部写操作使用唯一 actor \`acceptance-harness\` 标记并在 afterAll 清理，可重复运行结果稳定。`);
  lines.push(`- 任一 FAIL 即红阻断：本脚本以非零码退出，可直接接入 CI 门禁。`);
  lines.push(``);

  writeFileSync(REPORT, lines.join("\n"), "utf-8");
  if (existsSync(JSON_OUT)) unlinkSync(JSON_OUT);
  console.log(`验收报告已生成：${REPORT}`);
  console.log(`结果：${r.numPassedTests}/${r.numTotalTests} 通过`);
  if (r.numFailedTests > 0) {
    console.error(`🔴 红阻断：${r.numFailedTests} 条验收 FAIL`);
    process.exit(1);
  }
}

main();
