/**
 * 迭代6 · 周报自动推送（Heartbeat 定时回调）
 * 每周五 09:00（北京时间，UTC 周五 01:00）触发：
 *  1. 复用规则引擎 weeklyReview 聚合本周作战数据
 *  2. 组装摘要文本，notifyOwner 推送给园区运营负责人（项目 Owner）
 *  3. 写 opsLedger 台账留痕
 * 幂等性：同一周内重复触发仅重复推送（无状态写入冲突）；通知失败返回 200+skipped 防止无意义重试。
 */
import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import { buildSnapshot, buildWeeklyReview, appendLedger } from "./dataAdapter";

export async function weeklyDigestHandler(req: Request, res: Response) {
  try {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(403).json({ error: "unauthorized" });
      return;
    }
    if (!user.isCron || !user.taskUid) {
      res.status(403).json({ error: "cron-only" });
      return;
    }

    // 周报数据（不脱敏：仅推送给 Owner 本人）
    const review = await buildWeeklyReview();
    const snap = await buildSnapshot({ maskSensitive: false });

    const lines: string[] = [];
    lines.push(`【SPI-OS 周报 · ${review.weekKey}】`);
    lines.push(`任务完成率 ${review.completionRate}%（已完成 ${review.doneTasks} / 待办 ${review.openTasks}）`);
    const bt = review.byType as Record<string, { open: number; done: number }>;
    lines.push(`首触 ${bt["首触"]?.done ?? 0}/${(bt["首触"]?.open ?? 0) + (bt["首触"]?.done ?? 0)} · 复访 ${bt["复访"]?.done ?? 0}/${(bt["复访"]?.open ?? 0) + (bt["复访"]?.done ?? 0)} · 培育跟进 ${bt["培育跟进"]?.done ?? 0}/${(bt["培育跟进"]?.open ?? 0) + (bt["培育跟进"]?.done ?? 0)}`);
    const f = snap.funnel;
    lines.push(`漏斗：未触达 ${f.counts["未触达"]} → 已触达 ${f.counts["已触达"]} → 已约见 ${f.counts["已约见"]} → 已成交 ${f.counts["已成交"]}（触达率 ${f.reachRate}%）`);
    if (review.stageMoves.length > 0) {
      lines.push(`本周状态推进 ${review.stageMoves.length} 起：${review.stageMoves.slice(0, 5).map((m: { name: string; stage: string }) => `${m.name}→${m.stage}`).join("；")}${review.stageMoves.length > 5 ? " 等" : ""}`);
    }
    lines.push(`打开作战台查看任务清单与周报复盘详情。`);

    const ok = await notifyOwner({
      title: `SPI-OS 园区作战周报 · ${review.weekKey} · 完成率 ${review.completionRate}%`,
      content: lines.join("\n"),
    });

    await appendLedger("weekly_digest", null, `周报推送 ${review.weekKey} · 完成率 ${review.completionRate}% · 通知${ok ? "成功" : "失败"}`, "定时任务");

    res.json({ ok: true, weekKey: review.weekKey, notified: ok });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      error: err.message,
      stack: err.stack,
      context: { url: req.originalUrl, taskUid: (req as unknown as { taskUid?: string }).taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
