/* 指挥中枢风格：左侧窄导航（徽标+屏切换+合规脚注）+ 右侧内容区；深藏青底、成电红信号。
   迭代6：i18n 双语 / 数据大屏模式（快捷键 B）/ 移动端顶栏+抽屉导航 / AI 侧边助手入口。 */
import { Link, useLocation } from "wouter";
import { ReactNode, useEffect, useState } from "react";
import { create } from "zustand";
import { usePresent } from "@/contexts/PresentContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useMaskStore } from "@/lib/park";
import { useI18n, type I18nKey } from "@/lib/i18n";
import AiPanel from "@/components/AiPanel";
import { Presentation, X, ShieldCheck, ShieldOff, Sun, Moon, SlidersHorizontal, Bot, Languages, MonitorPlay, Menu, Package, DatabaseZap } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { AlertTriangle } from "lucide-react";

const LOGO = "/manus-storage/spi-os-seal-logo_c9d3ac78.png";

const NAV: { path: string; numKey: I18nKey; labelKey: I18nKey; sub: string }[] = [
  { path: "/", numKey: "numScenario", labelKey: "navScenario", sub: "Scenario OS" },
  { path: "/decision", numKey: "numDecision", labelKey: "navDecision", sub: "Decision Center" },
  { path: "/park-health", numKey: "numHome", labelKey: "navHome", sub: "Park Health" },
  { path: "/radar", numKey: "numRadar", labelKey: "navRadar", sub: "Lead Radar" },
  { path: "/referral", numKey: "numReferral", labelKey: "navReferral", sub: "Referral Map" },
  { path: "/simulation", numKey: "numSim", labelKey: "navSim", sub: "Simulation" },
  { path: "/tasks", numKey: "numTasks", labelKey: "navTasks", sub: "Action List" },
  { path: "/governance", numKey: "numGov", labelKey: "navGov", sub: "Governance" },
];

/* ---------- 数据大屏模式（迭代6）：投屏专用；快捷键 B 启停 ----------
   与路演模式的区别：路演=全屏翻屏演示流；大屏=单屏驻留放大，供会议室大屏/监控墙长时间展示 */
interface BigScreenState {
  big: boolean;
  toggle: () => void;
  exit: () => void;
}
export const useBigScreen = create<BigScreenState>((set) => ({
  big: false,
  toggle: () => set((s) => ({ big: !s.big })),
  exit: () => set({ big: false }),
}));

export default function ScreenLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { present, enter, exit } = usePresent();
  const { mask, setMask } = useMaskStore();
  const { theme, toggleTheme } = useTheme();
  const { t, toggleLang } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [aiOpen, setAiOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { big, toggle: toggleBig, exit: exitBig } = useBigScreen();

  /* 路演模式自动锁定深色作战模式（投屏路演场景） */
  useEffect(() => {
    if (present && theme === "light" && toggleTheme) toggleTheme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, theme]);

  /* 大屏模式：html 挂 big-screen 类（放大字号）；快捷键 B 启停、ESC 退出 */
  useEffect(() => {
    document.documentElement.classList.toggle("big-screen", big && !present);
    return () => document.documentElement.classList.remove("big-screen");
  }, [big, present]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.key === "b" || e.key === "B") && !present) { e.preventDefault(); toggleBig(); }
      if (e.key === "Escape" && big) exitBig();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [present, big, toggleBig, exitBig]);

  /* 路演模式：全屏无侧栏 */
  if (present) {
    const idx = NAV.findIndex((n) => n.path === location);
    return (
      <div className="min-h-screen bg-background">
        <main className="min-w-0">{children}</main>
        {mask && (
          <div className="fixed top-3 right-3 z-50 flex items-center gap-1.5 rounded-full border border-emerald-600/50 bg-background/90 px-3 py-1 text-[10.5px] text-emerald-500">
            <ShieldCheck className="w-3 h-3" /> {t("maskBadge")}
          </div>
        )}
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-full border border-border bg-background/90 backdrop-blur-md px-5 py-2">
          <img src={LOGO} alt="" className="w-5 h-5 object-contain" />
          <div className="flex items-center gap-2">
            {NAV.map((n, i) => (
              <span
                key={n.path}
                className={`h-1.5 rounded-full transition-all duration-200 ${i === idx ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/40"}`}
              />
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground font-serif-sc">
            {NAV[idx] ? `${t(NAV[idx].numKey)} · ${t(NAV[idx].labelKey)}` : ""}
          </span>
          <span className="text-[10px] text-muted-foreground/60">{t("presentKeys")}</span>
          <button onClick={exit} className="text-muted-foreground hover:text-foreground transition-colors" aria-label={t("exitPresent")}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  /* 数据大屏模式：单屏驻留，隐藏侧栏与浮动控件，仅保留右上小指示 */
  if (big) {
    return (
      <div className="min-h-screen bg-background">
        <main className="min-w-0">{children}</main>
        <div className="fixed top-3 right-3 z-50 flex items-center gap-2 rounded-full border border-border bg-background/85 backdrop-blur-md px-3.5 py-1.5">
          <MonitorPlay className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] text-muted-foreground">{t("bigScreen")}</span>
          {mask && <span className="inline-flex items-center gap-1 text-[10.5px] text-emerald-500"><ShieldCheck className="w-3 h-3" />{t("maskBadge")}</span>}
          <span className="text-[10px] text-muted-foreground/60">B / ESC</span>
          <button onClick={exitBig} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="exit big screen">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  /* 侧栏内容（桌面侧栏与移动抽屉共用） */
  const sidebarInner = (
    <>
      <div className="px-5 pt-6 pb-5 border-b border-border/60">
        <div className="flex items-center gap-3">
          <img src={LOGO} alt="SPI-OS" className="w-11 h-11 object-contain" />
          <div>
            <div className="font-serif-sc font-black text-[15px] leading-tight tracking-wide text-foreground">SPI-OS</div>
            <div className="text-[11px] text-muted-foreground tracking-widest mt-0.5">{t("brandSub")}</div>
          </div>
        </div>
        <div className="mt-4 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-line">{t("brandDesc")}</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1.5">
        {NAV.map((n) => {
          const active = location === n.path;
          return (
            <Link
              key={n.path}
              href={n.path}
              onClick={() => setDrawerOpen(false)}
              className={`flex items-center gap-3 rounded-md px-3 py-3 transition-colors duration-150 ${
                active ? "bg-primary/15 border border-primary/40" : "border border-transparent hover:bg-accent"
              }`}
            >
              <span className={`seal-badge !w-9 !h-9 !text-[11px] ${active ? "" : "!border-border !text-muted-foreground"}`}>{t(n.numKey)}</span>
              <span>
                <span className={`block text-[13px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{t(n.labelKey)}</span>
                <span className="block text-[10px] tracking-widest text-muted-foreground/70 uppercase">{n.sub}</span>
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="px-3 pb-3">
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            onClick={() => toggleTheme?.()}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors active:scale-[0.98]"
            title={theme === "dark" ? t("themeToLight") : t("themeToDark")}
          >
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            onClick={toggleLang}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors active:scale-[0.98]"
            title="中文 / English"
          >
            <Languages className="w-3.5 h-3.5" />
            {t("langSwitch")}
          </button>
        </div>
        <button
          onClick={() => setMask(!mask)}
          className={`w-full mb-2 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors active:scale-[0.98] ${
            mask
              ? "border-emerald-600/60 bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25"
              : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          {mask ? <ShieldCheck className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
          {mask ? t("maskOn") : t("maskOff")}
        </button>
        <button
          onClick={() => { setDrawerOpen(false); toggleBig(); }}
          className="w-full mb-2 flex items-center justify-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors active:scale-[0.98]"
        >
          <MonitorPlay className="w-4 h-4" />
          {t("bigScreen")}
        </button>
        <div className="mb-2 text-center text-[10px] text-muted-foreground/60">{t("bigScreenHint")}</div>
        <button
          onClick={() => { setDrawerOpen(false); enter(); }}
          className="w-full flex items-center justify-center gap-2 rounded-md border border-primary/50 bg-primary/10 px-3 py-2.5 text-[12.5px] font-medium text-foreground hover:bg-primary/20 transition-colors active:scale-[0.98]"
        >
          <Presentation className="w-4 h-4 text-primary" />
          {t("present")}
        </button>
        <div className="mt-1.5 text-center text-[10px] text-muted-foreground/60">{t("presentHint")}</div>
        {isAdmin && (
          <Link
            href="/rules"
            onClick={() => setDrawerOpen(false)}
            className={`mt-2 w-full flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors active:scale-[0.98] ${
              location === "/rules"
                ? "border-primary/50 bg-primary/15 text-foreground"
                : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> {t("rulesCenter")}
          </Link>
        )}
        {isAdmin && (
          <Link
            href="/resources"
            onClick={() => setDrawerOpen(false)}
            className={`mt-1.5 w-full flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors active:scale-[0.98] ${
              location === "/resources"
                ? "border-primary/50 bg-primary/15 text-foreground"
                : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <Package className="w-3.5 h-3.5" /> {t("resourceAdmin")}
          </Link>
        )}
        {isAdmin && (
          <Link
            href="/connectors"
            onClick={() => setDrawerOpen(false)}
            className={`mt-1.5 w-full flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors active:scale-[0.98] ${
              location === "/connectors"
                ? "border-primary/50 bg-primary/15 text-foreground"
                : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <DatabaseZap className="w-3.5 h-3.5" /> {t("connectorCenter")}
          </Link>
        )}
      </div>
      <div className="px-5 py-4 border-t border-border/60 text-[10px] leading-relaxed text-muted-foreground/80">
        <span className="text-primary/90 font-medium">{t("complianceTitle")}</span>
        {t("compliance")}
        <div className="mt-2 text-muted-foreground/60">
          {t("footerSrc")}
          <br />
          {t("footerEngine")}
          <br />
          {t("footerMask")}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* 桌面侧边导航（lg+） */}
      <aside className="hidden lg:flex w-56 flex-none border-r border-border bg-sidebar flex-col sticky top-0 h-screen">
        {sidebarInner}
      </aside>

      {/* 移动端顶栏（<lg）：徽标 + 当前屏名 + 抽屉按钮 */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 flex items-center gap-3 border-b border-border bg-sidebar/95 backdrop-blur-md px-4 h-14">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <img src={LOGO} alt="" className="w-7 h-7 object-contain" />
        <div className="flex-1 min-w-0">
          <div className="font-serif-sc font-bold text-[13.5px] text-foreground truncate">
            {NAV.find((n) => n.path === location) ? t(NAV.find((n) => n.path === location)!.labelKey) : "SPI-OS"}
          </div>
        </div>
        {mask && <ShieldCheck className="w-4 h-4 text-emerald-500 flex-none" />}
      </div>

      {/* 移动端抽屉导航 */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/55" onClick={() => setDrawerOpen(false)} />
          <aside
            className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-sidebar border-r border-border flex flex-col overflow-y-auto"
            style={{ animation: "aiSlideInLeft 200ms cubic-bezier(0.23, 1, 0.32, 1)" }}
          >
            <style>{`@keyframes aiSlideInLeft { from { transform: translateX(-16px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="close"
            >
              <X className="w-4 h-4" />
            </button>
            {sidebarInner}
          </aside>
        </div>
      )}

      {/* 内容区（移动端预留顶栏高度） */}
      <main className="flex-1 min-w-0 pt-14 lg:pt-0">
        <DataEnvironmentBanner />
        {children}
      </main>

      {/* AI 侧边助手：浮动入口 + 可收起面板 */}
      {!aiOpen && (
        <button
          onClick={() => setAiOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-primary/50 bg-card shadow-lg px-4 py-2.5 text-[12.5px] font-medium text-foreground hover:bg-primary/15 transition-all active:scale-[0.97]"
          aria-label={t("aiTitle")}
        >
          <Bot className="w-4 h-4 text-primary" />
          {t("aiOpen")}
        </button>
      )}
      <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}

export function ScreenHeader({
  num,
  title,
  desc,
  right,
}: {
  num: string;
  title: string;
  desc: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-6 flex-wrap">
      <div className="flex items-center gap-4">
        <span className="seal-badge">{num}</span>
        <div>
          <h1 className="font-serif-sc font-black text-[22px] sm:text-[26px] leading-tight text-foreground tracking-wide">{title}</h1>
          <p className="text-[12px] text-muted-foreground mt-1">{desc}</p>
        </div>
      </div>
      {right}
    </div>
  );
}

/* ---------- 数据环境标识（迭代28） ---------- */
function DataEnvironmentBanner() {
  const { data: stats } = trpc.park.loadTest.envStats.useQuery(undefined, { staleTime: 60_000 });
  if (!stats) return null;
  const hasLoadTest = (stats.load_test ?? 0) > 0 || (stats.test ?? 0) > 0;
  const total = (stats.production ?? 0) + (stats.demo ?? 0);
  return (
    <div className="flex items-center gap-2 px-6 py-1.5 text-[10.5px] border-b border-border/50 bg-secondary/30">
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 font-medium">
        Production
      </span>
      <span className="text-muted-foreground">正式企业 {total} 家</span>
      {hasLoadTest && (
        <span className="inline-flex items-center gap-1 text-amber-500">
          <AlertTriangle className="w-3 h-3" />
          存在压测数据（load_test: {stats.load_test ?? 0} / test: {stats.test ?? 0}）· 已隔离不显示
        </span>
      )}
    </div>
  );
}
