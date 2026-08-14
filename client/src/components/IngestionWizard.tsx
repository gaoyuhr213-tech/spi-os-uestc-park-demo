/* 迭代28 · 统一入库向导（五步）
 * Step 1: 声明来源
 * Step 2: 输入数据（Excel/粘贴/单企业）
 * Step 3: 预览匹配结果
 * Step 4: 确认提交
 * Step 5: 结果报告
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const SOURCE_CATEGORIES = [
  { key: "government", label: "政府公示" },
  { key: "company_official", label: "企业官方" },
  { key: "commercial_database", label: "商业数据库" },
  { key: "recruitment", label: "招聘平台" },
  { key: "park_internal", label: "园区内部" },
  { key: "field_visit", label: "走访" },
  { key: "enterprise_submission", label: "企业报送" },
  { key: "other", label: "其他" },
] as const;

const ACQ_CHANNELS = [
  { key: "excel", label: "Excel 导入" },
  { key: "manual_paste", label: "文本粘贴" },
  { key: "api", label: "API 同步" },
  { key: "form", label: "表单填报" },
  { key: "file_upload", label: "文件上传" },
] as const;

interface Props { open: boolean; onClose: () => void }

export default function IngestionWizard({ open, onClose }: Props) {
  const [step, setStep] = useState(1);
  // Step 1: 来源
  const [sourceKey, setSourceKey] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceCategory, setSourceCategory] = useState("park_internal");
  const [acqChannel, setAcqChannel] = useState("manual_paste");
  // Step 2: 数据
  const [rawText, setRawText] = useState("");
  const [records, setRecords] = useState<Array<{ companyName: string; fields: Record<string, string> }>>([]);
  // Step 3: 预览
  const [preview, setPreview] = useState<any>(null);
  // Step 5: 结果
  const [result, setResult] = useState<any>(null);

  const previewMut = trpc.park.ingestion.preview.useMutation({
    onSuccess: (data) => { setPreview(data); setStep(3); },
    onError: (e) => toast.error(e.message),
  });
  const commitMut = trpc.park.ingestion.commit.useMutation({
    onSuccess: (data) => { setResult(data); setStep(5); },
    onError: (e) => toast.error(e.message),
  });

  const parseRawText = () => {
    // 简单解析：每行一家企业，格式 "企业名\t字段1=值1\t字段2=值2"
    const lines = rawText.trim().split("\n").filter(Boolean);
    const parsed: typeof records = [];
    for (const line of lines) {
      const parts = line.split("\t");
      const companyName = parts[0]?.trim();
      if (!companyName) continue;
      const fields: Record<string, string> = {};
      for (let i = 1; i < parts.length; i++) {
        const [k, v] = parts[i].split("=");
        if (k && v) fields[k.trim()] = v.trim();
      }
      parsed.push({ companyName, fields });
    }
    if (parsed.length === 0) { toast.error("未解析到有效数据"); return; }
    setRecords(parsed);
    // 自动生成 sourceKey
    if (!sourceKey) setSourceKey(`src-${Date.now().toString(36)}`);
    // 发起预览
    previewMut.mutate({
      sourceKey: sourceKey || `src-${Date.now().toString(36)}`,
      sourceName, sourceCategory, acquisitionChannel: acqChannel,
      processingMethod: "direct_mapping", records: parsed,
    });
  };

  const doCommit = () => {
    if (!preview) return;
    commitMut.mutate({
      batchKey: preview.batchKey,
      sourceKey: sourceKey || preview.batchKey,
      sourceName, sourceCategory, acquisitionChannel: acqChannel,
      processingMethod: "direct_mapping", records,
    });
  };

  const reset = () => { setStep(1); setRawText(""); setRecords([]); setPreview(null); setResult(null); };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto bg-card border-border">
        <SheetHeader>
          <SheetTitle className="font-serif-sc text-lg">统一入库向导</SheetTitle>
        </SheetHeader>
        {/* 步骤指示 */}
        <div className="flex items-center gap-1 mt-4 mb-5 text-[10.5px]">
          {["声明来源", "输入数据", "预览匹配", "确认提交", "结果"].map((s, i) => (
            <span key={i} className={`flex items-center gap-1 ${step === i + 1 ? "text-primary font-medium" : "text-muted-foreground"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] border ${step === i + 1 ? "border-primary bg-primary/10" : step > i + 1 ? "border-emerald-500 bg-emerald-500/10 text-emerald-600" : "border-border"}`}>{step > i + 1 ? "✓" : i + 1}</span>
              {s}
              {i < 4 && <ArrowRight className="w-3 h-3 text-muted-foreground/50" />}
            </span>
          ))}
        </div>

        {/* Step 1: 来源 */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">来源名称 *</label>
              <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="如：企查查工商信息 / 2026年7月走访记录"
                className="w-full rounded-md border border-border bg-secondary/30 px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">来源类别 *</label>
              <div className="flex flex-wrap gap-1.5">
                {SOURCE_CATEGORIES.map((c) => (
                  <button key={c.key} onClick={() => setSourceCategory(c.key)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${sourceCategory === c.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">获取方式</label>
              <div className="flex flex-wrap gap-1.5">
                {ACQ_CHANNELS.map((c) => (
                  <button key={c.key} onClick={() => setAcqChannel(c.key)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${acqChannel === c.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">来源标识（可选，自动生成）</label>
              <input value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} placeholder="如 qcc-api / field-visit-2026-07"
                className="w-full rounded-md border border-border bg-secondary/30 px-3 py-2 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50" />
            </div>
            <Button onClick={() => { if (!sourceName) { toast.error("请填写来源名称"); return; } setStep(2); }} className="w-full">
              下一步：输入数据 <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        )}

        {/* Step 2: 数据输入 */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">粘贴数据（每行一家企业，Tab分隔字段=值）</label>
              <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={10} placeholder={`成都眸视科技有限公司\tinsured=120\tregCapital=1000万\n四川中科维讯智能科技有限公司\tinsured=85\tfounded=2018`}
                className="w-full rounded-md border border-border bg-secondary/30 px-3 py-2 text-[12px] text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/50 resize-y" />
            </div>
            <p className="text-[10px] text-muted-foreground/70">格式：企业全称\\t字段名=值\\t字段名=值。支持字段：insured/regCapital/founded/jobs/patents/softCopyrights/funding/legalRep/keyContact 等 enrichments 表字段。</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="w-3.5 h-3.5 mr-1" />上一步</Button>
              <Button onClick={parseRawText} disabled={!rawText.trim() || previewMut.isPending} className="flex-1">
                {previewMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                解析并预览 <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: 预览 */}
        {step === 3 && preview && (
          <div className="space-y-4">
            <div className="flex gap-3 text-[12px]">
              <span>总计 <span className="font-bold text-foreground">{preview.summary.total}</span></span>
              <span>匹配 <span className="font-bold text-emerald-600">{preview.summary.matched}</span></span>
              <span>未匹配 <span className="font-bold text-amber-600">{preview.summary.unmatched}</span></span>
              <span>冲突 <span className="font-bold text-red-500">{preview.summary.conflicts}</span></span>
            </div>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {preview.records.map((r: any, i: number) => (
                <div key={i} className="rounded-md border border-border bg-secondary/20 px-3 py-2">
                  <div className="flex items-center gap-2 text-[11.5px]">
                    <span className="font-medium text-foreground">{r.companyName}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${r.matchResult.status === "exact" || r.matchResult.status === "high_confidence" ? "bg-emerald-500/10 text-emerald-600" : r.matchResult.status === "candidates" ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-500"}`}>
                      {r.matchResult.status === "exact" ? "精确匹配" : r.matchResult.status === "high_confidence" ? `高置信(${r.matchResult.score})` : r.matchResult.status === "candidates" ? "多候选" : "未匹配"}
                    </span>
                    {r.matchResult.matchedEid && <span className="text-[10px] text-muted-foreground">{r.matchResult.matchedEid}</span>}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    写入字段：{r.fieldsToWrite.join(", ")}
                    {r.conflicts.length > 0 && <span className="text-red-500 ml-2">冲突：{r.conflicts.join(", ")}</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="w-3.5 h-3.5 mr-1" />修改数据</Button>
              <Button onClick={() => setStep(4)} className="flex-1">确认提交 <ArrowRight className="w-3.5 h-3.5 ml-1" /></Button>
            </div>
          </div>
        )}

        {/* Step 4: 确认 */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-500/50 bg-amber-500/5 px-4 py-3">
              <div className="flex items-center gap-2 text-[12px] font-medium text-foreground">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> 确认提交
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                即将向 {preview?.summary.matched ?? 0} 家企业写入字段证据。此操作将：
              </p>
              <ul className="mt-1 text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
                <li>为每个字段创建证据记录（可溯源到本批次和来源）</li>
                <li>检测并标记字段冲突（不同来源不同值）</li>
                <li>自动选举当前最佳证据</li>
                <li>写入操作台账（可审计）</li>
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">提交后可在「入库批次」中整批回滚。</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="w-3.5 h-3.5 mr-1" />返回预览</Button>
              <Button onClick={doCommit} disabled={commitMut.isPending} className="flex-1">
                {commitMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                确认写入
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: 结果 */}
        {step === 5 && result && (
          <div className="space-y-4">
            <div className="rounded-md border border-emerald-500/50 bg-emerald-500/5 px-4 py-3">
              <div className="flex items-center gap-2 text-[12px] font-medium text-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 入库完成
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <div>匹配 <span className="font-bold text-foreground">{result.matchedRecords}</span></div>
                <div>更新 <span className="font-bold text-foreground">{result.updatedRecords}</span></div>
                <div>冲突 <span className="font-bold text-foreground">{result.conflictRecords}</span></div>
              </div>
              <p className="mt-2 text-[10.5px] text-muted-foreground">批次 {result.batchKey} 已提交。可在治理域「入库批次」Tab 查看详情或回滚。</p>
            </div>
            <Button onClick={() => { onClose(); reset(); }} className="w-full">完成</Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
