import { AnimatePresence, motion } from "motion/react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";
import AIPanel from "@/components/AIPanel";
import CommandPalette from "@/components/CommandPalette";
import Bible from "@/components/Bible";
import Editor from "@/components/Editor";
import Outline from "@/components/Outline";
import Onboarding from "@/components/Onboarding";
import ProjectHome from "@/components/ProjectHome";
import ProjectModal from "@/components/ProjectModal";
import SearchModal from "@/components/SearchModal";
import Settings from "@/components/Settings";
import Sidebar from "@/components/Sidebar";
import StatsModal from "@/components/StatsModal";
import Threads from "@/components/Threads";
import TitleBar from "@/components/TitleBar";
import Toasts from "@/components/Toasts";
import { useStore } from "@/lib/store";

function Splash() {
  return (
    <div className="flex h-full items-center justify-center bg-app">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center"
      >
        <div className="relative flex h-14 w-14 items-center justify-center rounded-[18px] border border-gold/25 bg-gradient-to-br from-gold/20 to-transparent">
          <span className="font-serif text-[26px] text-gold">墨</span>
          <span className="absolute inset-0 animate-pulse rounded-[18px] bg-gold/5" />
        </div>
        <div className="mt-4 text-[11px] tracking-[0.3em] text-mute">MOYIN STUDIO</div>
        <div className="mt-3 h-[2px] w-24 overflow-hidden rounded-full bg-line/70">
          <div className="shimmer h-full w-full" />
        </div>
      </motion.div>
    </div>
  );
}

export default function App() {
  const booted = useStore((s) => s.booted);
  const bootError = useStore((s) => s.bootError);
  const focusMode = useStore((s) => s.focusMode);
  const aiOpen = useStore((s) => s.aiOpen);
  const view = useStore((s) => s.view);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const activeChapterId = useStore((s) => s.activeChapterId);
  const onboardingOpen = useStore((s) => s.onboardingOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);

  useEffect(() => {
    void useStore.getState().bootstrap();
  }, []);

  useEffect(() => {
    const unsubs: Promise<() => void>[] = [];

    unsubs.push(
      listen<{ requestId: string; text: string }>("ai://delta", (e) => {
        const { requestId, text } = e.payload;
        useStore.setState((s) => {
          if (s.gen && s.gen.id === requestId) {
            return { gen: { ...s.gen, text: s.gen.text + text, status: "streaming" } };
          }
          if (s.multi) {
            const idx = s.multi.items.findIndex((i) => i.id === requestId);
            if (idx >= 0) {
              const items = s.multi.items.slice();
              items[idx] = {
                ...items[idx],
                text: items[idx].text + text,
                status: "streaming",
              };
              return { multi: { ...s.multi, items } };
            }
          }
          return {};
        });
      })
    );

    unsubs.push(
      listen<{ requestId: string; text: string }>("ai://reasoning", (e) => {
        const { requestId, text } = e.payload;
        useStore.setState((s) =>
          s.gen && s.gen.id === requestId
            ? {
                gen: {
                  ...s.gen,
                  reasoning: (s.gen.reasoning ?? "") + text,
                  status: "streaming",
                },
              }
            : {}
        );
      })
    );

    unsubs.push(
      listen<{ requestId: string; aborted: boolean }>("ai://done", (e) => {
        const { requestId, aborted } = e.payload;
        useStore.setState((s) => {
          if (s.gen && s.gen.id === requestId) {
            return {
              gen: { ...s.gen, status: aborted ? "stopped" : "done" },
            };
          }
          if (s.multi) {
            const items = s.multi.items.map((it) =>
              it.id === requestId ? { ...it, status: "done" as const } : it
            );
            return { multi: { ...s.multi, items } };
          }
          return {};
        });
      })
    );

    unsubs.push(
      listen<{ requestId: string; message: string }>("ai://error", (e) => {
        const { requestId, message } = e.payload;
        useStore.setState((s) => {
          if (s.gen && s.gen.id === requestId) {
            return { gen: { ...s.gen, status: "error", error: message } };
          }
          if (s.multi) {
            const items = s.multi.items.map((it) =>
              it.id === requestId
                ? { ...it, status: "error" as const, error: message }
                : it
            );
            return { multi: { ...s.multi, items } };
          }
          return {};
        });
      })
    );

    return () => {
      unsubs.forEach((p) => void p.then((fn) => fn()));
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const store = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const composing = (e as any).isComposing;
      if (composing) return;

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        store.setPaletteOpen(!store.paletteOpen);
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void store.saveNow();
        return;
      }
      if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void store.createChapter();
        return;
      }
      if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        store.setAiOpen(!store.aiOpen);
        return;
      }
      if (mod && e.key === ",") {
        e.preventDefault();
        store.setSettingsOpen(true);
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        store.setFocusMode(!store.focusMode);
        return;
      }
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        store.setSearchOpen(true);
        return;
      }
      if (mod && e.key === "Enter") {
        // Only continue from the manuscript. Modals and other inputs keep
        // their own Enter behaviour.
        const target = e.target as HTMLElement | null;
        const inManuscript = Boolean(target?.closest(".manuscript"));
        if (
          store.settingsOpen ||
          store.projectModal ||
          store.paletteOpen ||
          store.statsOpen ||
          store.searchOpen ||
          !inManuscript
        ) {
          return;
        }
        e.preventDefault();
        void store.runAI("continue");
        return;
      }
      if (e.key === "Escape") {
        if (store.paletteOpen) store.setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        // 永远先拦下默认关闭：由 store 统一「保存 → 失败则留在应用 → 成功再 destroy」。
        event.preventDefault();
        await useStore.getState().requestClose();
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  if (!booted) return <Splash />;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <TitleBar />

      {bootError ? (
        <div className="flex flex-1 items-center justify-center px-10">
          <div className="max-w-[420px] rounded-2xl border border-cinnabar/30 bg-cinnabar/8 p-5">
            <div className="mb-2 text-[12px] text-cinnabar">启动失败</div>
            <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-dim">{bootError}</p>
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1">
          <AnimatePresence initial={false}>
            {!focusMode ? (
              <motion.div
                key="sidebar"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 286, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="shrink-0 overflow-hidden"
              >
                <Sidebar />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <main className="relative flex min-w-0 flex-1 flex-col">
            {activeProjectId == null ? (
              <ProjectHome />
            ) : view === "write" ? (
              activeChapterId == null ? (
                <div className="flex flex-1 items-center justify-center text-[12px] text-mute">
                  这个作品还没有章节，按 Ctrl N 新建一章
                </div>
              ) : (
                <Editor />
              )
            ) : view === "outline" ? (
              <Outline />
            ) : view === "threads" ? (
              <Threads />
            ) : (
              <Bible />
            )}
          </main>

          <AnimatePresence initial={false}>
            {!focusMode && aiOpen && activeProjectId != null ? (
              <AIPanel key="ai-panel" />
            ) : null}
          </AnimatePresence>
        </div>
      )}

      <Settings />
      <ProjectModal />
      <CommandPalette />
      <SearchModal />
      <StatsModal />
      {onboardingOpen ? <Onboarding /> : null}
      <Toasts />
    </div>
  );
}
