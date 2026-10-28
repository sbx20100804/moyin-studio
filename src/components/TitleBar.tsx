import {
  BarChart3,
  Command,
  Copy,
  Minus,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings,
  Square,
  Sun,
  X,
  Maximize2,
  Minimize2,
  Check,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { timeLabel } from "@/lib/format";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/format";
import { IconButton } from "./ui";

function SaveState() {
  const saving = useStore((s) => s.saving);
  const dirty = useStore((s) => s.dirty);
  const savedAt = useStore((s) => s.savedAt);
  const hasDraft = useStore((s) => s.draft !== null);

  if (!hasDraft) return <span className="text-[11px] text-mute">未打开章节</span>;

  return (
    <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
      {saving ? (
        <>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
          <span className="text-mute">保存中…</span>
        </>
      ) : dirty ? (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-gold/60" />
          <span className="text-mute">未保存</span>
        </>
      ) : (
        <>
          <Check size={11} className="text-gold/80" />
          <span className="text-mute">已保存 {timeLabel(savedAt ? new Date(savedAt).toISOString() : null)}</span>
        </>
      )}
    </div>
  );
}

export default function TitleBar() {
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const aiOpen = useStore((s) => s.aiOpen);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const focusMode = useStore((s) => s.focusMode);
  const setFocusMode = useStore((s) => s.setFocusMode);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const [maxed, setMaxed] = useState(false);

  useEffect(() => {
    void api.isMaximized().then(setMaxed);
  }, []);

  const toggleMax = async () => {
    const next = await api.toggleMaximize();
    setMaxed(next);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest("button, input, a, textarea, [data-no-drag]")) return;
    void api.startDrag();
  };

  return (
    <header
      onMouseDown={onMouseDown}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        void toggleMax();
      }}
      className="relative z-30 flex h-11 shrink-0 select-none items-center border-b border-line/60 pl-3"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="relative flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border border-gold/25 bg-gradient-to-br from-gold/18 to-transparent">
          <span className="font-serif text-[12px] leading-none text-gold">墨</span>
        </div>
        <span className="text-[12.5px] font-medium tracking-[0.22em] text-dim">MOYIN</span>
        <span className="mx-1 h-3 w-px bg-line" />
        <span className="max-w-[300px] truncate text-[12.5px] text-ink/90">
          {project?.title ?? "还没有作品"}
        </span>
        {project?.genre ? (
          <span className="rounded-full border border-line/80 px-2 py-[2px] text-[10px] text-mute">
            {project.genre}
          </span>
        ) : null}
      </div>

      <div className="flex-1" />

      <div className="mr-2 hidden items-center md:flex">
        <SaveState />
      </div>

      <div className="flex items-center gap-0.5 pr-1" data-no-drag>
        <IconButton
          onClick={() => setPaletteOpen(true)}
          title="命令面板  Ctrl K"
          className="hidden sm:inline-flex"
        >
          <Command size={14} />
        </IconButton>
        <IconButton
          onClick={() => useStore.getState().setSearchOpen(true)}
          title="全文搜索  Ctrl F"
          className="hidden sm:inline-flex"
        >
          <Search size={14} />
        </IconButton>
        <IconButton
          onClick={() => useStore.getState().setStatsOpen(true)}
          title="写作统计"
          className="hidden sm:inline-flex"
        >
          <BarChart3 size={14} />
        </IconButton>
        <IconButton
          onClick={() => setFocusMode(!focusMode)}
          active={focusMode}
          title="专注模式  Ctrl ⇧ F"
        >
          {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </IconButton>
        <IconButton onClick={() => setAiOpen(!aiOpen)} active={aiOpen} title="AI 面板  Ctrl J">
          {aiOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
        </IconButton>
        <IconButton onClick={toggleTheme} title="切换主题">
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </IconButton>
        <IconButton onClick={() => setSettingsOpen(true)} title="设置  Ctrl ,">
          <Settings size={14} />
        </IconButton>
      </div>

      <div className="flex h-full items-stretch border-l border-line/50" data-no-drag>
        <button
          onClick={() => void api.minimize()}
          className="flex w-[46px] items-center justify-center text-dim transition-colors hover:bg-surface2 hover:text-ink"
          title="最小化"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => void toggleMax()}
          className="flex w-[46px] items-center justify-center text-dim transition-colors hover:bg-surface2 hover:text-ink"
          title={maxed ? "还原" : "最大化"}
        >
          {maxed ? <Copy size={12} /> : <Square size={11} />}
        </button>
        <button
          onClick={() => void useStore.getState().requestClose()}
          className="flex w-[46px] items-center justify-center text-dim transition-colors hover:bg-cinnabar hover:text-white"
          title="关闭"
        >
          <X size={15} />
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-gold/25 to-transparent" />
    </header>
  );
}
