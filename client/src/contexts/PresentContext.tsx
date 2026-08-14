/* 路演模式：全屏隐藏侧栏 + ←/→ 或 PgUp/PgDn 翻屏 + ESC 退出。 */
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { useLocation } from "wouter";

const ORDER = ["/", "/radar", "/referral"];

interface PresentCtx {
  present: boolean;
  enter: () => void;
  exit: () => void;
}

const Ctx = createContext<PresentCtx>({ present: false, enter: () => {}, exit: () => {} });

export function usePresent() {
  return useContext(Ctx);
}

export function PresentProvider({ children }: { children: ReactNode }) {
  const [present, setPresent] = useState(false);
  const [location, navigate] = useLocation();

  const enter = useCallback(() => {
    setPresent(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const exit = useCallback(() => {
    setPresent(false);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => {
      const idx = ORDER.indexOf(location);
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        navigate(ORDER[(idx + 1) % ORDER.length]);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        navigate(ORDER[(idx - 1 + ORDER.length) % ORDER.length]);
      } else if (e.key === "Escape") {
        exit();
      }
    };
    const onFsChange = () => {
      if (!document.fullscreenElement) setPresent(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [present, location, navigate, exit]);

  return <Ctx.Provider value={{ present, enter, exit }}>{children}</Ctx.Provider>;
}
