/* ============================================================
 * 迭代11 · 关系图谱数据化
 * - 图种子：把暖引荐生态（供给端/平台/枢纽/协会/专业服务 + 4 条路径成员边）转为节点/边数据
 * - 图查询：全图 / 单企业子图 / 多跳路径推演（BFS，按关系强度加权排序）
 * - DB 为主数据源（graphNodes/graphEdges），空库时自动播种
 * ============================================================ */
import { graphEdges, graphNodes } from "../drizzle/schema";
import { getDb } from "./db";
import { loadEntities, maskEntityName, type AdapterEntity } from "./dataAdapter";

/* ---------- 固定生态节点（非企业实体） ---------- */
const ECO_NODES: { nodeKey: string; kind: "platform" | "dept"; label: string; attrs: Record<string, string> }[] = [
  { nodeKey: "dept:swe", kind: "dept", label: "信软学院（供给端）", attrs: { role: "实训/实习/就业管道", org: "电子科技大学" } },
  { nodeKey: "plat:higher", kind: "platform", label: "高于×感知（平台）", attrs: { role: "HR 诊断 + 数据/AI 底座" } },
  { nodeKey: "plat:assoc", kind: "platform", label: "新型显示行业协会", attrs: { role: "路径C · 会员一对多触达" } },
  { nodeKey: "plat:proserv", kind: "platform", label: "专业服务转介网络", attrs: { role: "路径D · 律所/专利代理/咨询/EAP 互荐" } },
];

const HUB_EID = "E401"; // 成电金盘（园区股份关联，枢纽）

/* ---------- 播种：从企业主数据推导图数据（幂等） ---------- */
export async function seedGraph(): Promise<{ nodes: number; edges: number } | { error: string }> {
  const db = await getDb();
  if (!db) return { error: "数据库不可用" };
  const ents = await loadEntities();

  const existing = await db.select({ nodeKey: graphNodes.nodeKey }).from(graphNodes);
  const have = new Set(existing.map((r) => r.nodeKey));
  let nAdded = 0, eAdded = 0;

  // 生态节点
  for (const n of ECO_NODES) {
    if (have.has(n.nodeKey)) continue;
    await db.insert(graphNodes).values({ nodeKey: n.nodeKey, kind: n.kind, label: n.label, attrsJson: JSON.stringify(n.attrs) });
    nAdded++;
  }
  // 企业节点（P0/P1/运营方 + 有路径归属者入图；全量入图会稀释可读性，其余按需扩展）
  const inGraph = ents.filter((x) => x.referralPath || x.tierRole === "operator");
  for (const x of inGraph) {
    if (have.has(x.eid)) continue;
    await db.insert(graphNodes).values({
      nodeKey: x.eid, kind: "company", label: x.name,
      attrsJson: JSON.stringify({ ind: x.ind, floor: x.floor, tierRole: x.tierRole }),
    });
    nAdded++;
  }

  // 边（幂等：先查现有边对）
  const edgeRows = await db.select({ fromKey: graphEdges.fromKey, toKey: graphEdges.toKey, relType: graphEdges.relType }).from(graphEdges);
  const haveEdge = new Set(edgeRows.map((r) => `${r.fromKey}→${r.toKey}:${r.relType}`));
  const pushEdge = async (fromKey: string, toKey: string, relType: "referral" | "alumni" | "pipeline" | "partner", strength: number, evidence: string, pathTag: string | null) => {
    const k = `${fromKey}→${toKey}:${relType}`;
    if (haveEdge.has(k)) return;
    await db.insert(graphEdges).values({ fromKey, toKey, relType, strength, evidence, pathTag });
    haveEdge.add(k);
    eAdded++;
  };

  // 三边骨架：供给端↔枢纽↔平台
  await pushEdge("dept:swe", HUB_EID, "pipeline", 85, "校企同源：科技园股份为电子科大资产运营主体", "A");
  await pushEdge("plat:higher", HUB_EID, "partner", 80, "生态协议（拟签）：平台服务进园区", "B");
  await pushEdge("dept:swe", "plat:higher", "pipeline", 70, "人才供给管道：实训/实习生源对接", "A");

  // 路径成员边
  for (const x of inGraph) {
    if (x.eid === HUB_EID) continue;
    const p = x.referralPath;
    if (p === "A") await pushEdge("dept:swe", x.eid, "alumni", 75, "电子科大系同源（校友/校企关系，公开可核验）", "A");
    else if (p === "B") await pushEdge(HUB_EID, x.eid, "referral", 70, "园区官方背书：楼层索引实勘在册租户", "B");
    else if (p === "C") await pushEdge("plat:assoc", x.eid, "referral", 60, "协会会员关系（公开名录）", "C");
    else if (p === "D") await pushEdge("plat:proserv", x.eid, "partner", 55, "专业服务互荐网络（本地执业机构）", "D");
  }
  // 平台→枢纽→路径C/D 的桥接边（协会与专业服务网络挂靠园区生态）
  await pushEdge(HUB_EID, "plat:assoc", "partner", 60, "园区产业生态合作（协会活动共办）", "C");
  await pushEdge("plat:higher", "plat:proserv", "partner", 55, "专业服务联盟互荐协议", "D");

  return { nodes: nAdded, edges: eAdded };
}

/* ---------- 图查询 ---------- */
export interface GraphOut {
  nodes: { key: string; kind: string; label: string; attrs: Record<string, string> | null }[];
  edges: { from: string; to: string; relType: string; strength: number; evidence: string | null; pathTag: string | null }[];
  generatedAt: number;
}

export async function loadGraph(opts: { maskSensitive: boolean }): Promise<GraphOut> {
  const db = await getDb();
  if (!db) return { nodes: [], edges: [], generatedAt: Date.now() };
  let nodeRows = await db.select().from(graphNodes);
  if (nodeRows.length === 0) {
    await seedGraph(); // 空库自动播种
    nodeRows = await db.select().from(graphNodes);
  }
  const edgeRows = await db.select().from(graphEdges);
  return {
    nodes: nodeRows.map((r) => ({
      key: r.nodeKey, kind: r.kind,
      label: opts.maskSensitive && r.kind === "company" ? maskEntityName(r.label) : r.label,
      attrs: r.attrsJson ? safeParse(r.attrsJson) : null,
    })),
    edges: edgeRows.map((r) => ({
      from: r.fromKey, to: r.toKey, relType: r.relType, strength: r.strength,
      evidence: r.evidence, pathTag: r.pathTag,
    })),
    generatedAt: Date.now(),
  };
}

function safeParse(json: string): Record<string, string> | null {
  try { return JSON.parse(json); } catch { return null; }
}

/* ---------- 多跳路径推演（BFS ≤3 跳，无向图，按平均强度排序） ---------- */
export interface ReferralChain {
  hops: { from: string; fromLabel: string; to: string; toLabel: string; relType: string; strength: number; evidence: string | null }[];
  avgStrength: number;
  summary: string;
}

export async function findReferralChains(targetKey: string, opts: { maskSensitive: boolean }): Promise<{ target: string; chains: ReferralChain[] } | null> {
  const g = await loadGraph(opts);
  const target = g.nodes.find((n) => n.key === targetKey);
  if (!target) return null;
  const labelOf = new Map(g.nodes.map((n) => [n.key, n.label]));

  // 起点 = 平台（高于×感知视角出发做引荐推演）
  const START = "plat:higher";
  const adj = new Map<string, { to: string; relType: string; strength: number; evidence: string | null }[]>();
  for (const e of g.edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push({ to: e.to, relType: e.relType, strength: e.strength, evidence: e.evidence });
    adj.get(e.to)!.push({ to: e.from, relType: e.relType, strength: e.strength, evidence: e.evidence }); // 无向
  }

  const chains: ReferralChain[] = [];
  const queue: { key: string; path: ReferralChain["hops"] }[] = [{ key: START, path: [] }];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.path.length >= 3) continue;
    for (const nb of adj.get(cur.key) ?? []) {
      if (cur.path.some((h) => h.from === nb.to || h.to === nb.to) || nb.to === START) continue; // 防环
      const hop = {
        from: cur.key, fromLabel: labelOf.get(cur.key) ?? cur.key,
        to: nb.to, toLabel: labelOf.get(nb.to) ?? nb.to,
        relType: nb.relType, strength: nb.strength, evidence: nb.evidence,
      };
      const nextPath = [...cur.path, hop];
      if (nb.to === targetKey) {
        const avg = Math.round(nextPath.reduce((s, h) => s + h.strength, 0) / nextPath.length);
        chains.push({
          hops: nextPath, avgStrength: avg,
          summary: [labelOf.get(START), ...nextPath.map((h) => h.toLabel)].join(" → "),
        });
      } else {
        queue.push({ key: nb.to, path: nextPath });
      }
    }
  }
  chains.sort((a, b) => b.avgStrength - a.avgStrength || a.hops.length - b.hops.length);
  return { target: target.label, chains: chains.slice(0, 5) };
}
