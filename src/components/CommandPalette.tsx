import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  FileDown,
  Focus,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  BookOpen,
  CornerDownLeft,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  keys?: string;
  run: () => void;
}

export default function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  const createChapter = useStore((s) => s.createChapter);
  const setProjectModal = useStore((s) => s.setProjectModal);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setView = useStore((s) => s.setView);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const focusMode = useStore((s) => s.focusMode);
  const setFocusMode = useStore((s) => s.setFocusMode);
  const exportBook = useStore((s) => s.exportBook);
  const aiOpen = useStore((s) => s.aiOpen);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const setStatsOpen = useStore((s) => s.setStatsOpen);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = useMemo(
    () => [
      {
        id: "new-chapter",
        label: "新建章节",
        icon: Plus,
        keys: "Ctrl N",
        run: () => void createChapter(),
      },
      {
        id: "new-project",
        label: "新建作品",
        icon: BookOpen,
        run: () => setProjectModal({ mode: "new" }),
      },
      {
        id: "project-settings",
        label: "作品设置",
        icon: Settings,
        run: () => setProjectModal({ mode: "edit" }),
      },
      {
        id: "bible",
        label: "打开设定库",
        icon: Sparkles,
        run: () => setView("bible"),
      },
      {
        id: "threads",
        label: "打开伏笔台账",
        icon: BookOpen,
        run: () => setView("threads"),
      },
      {
        id: "search",
        label: "全文搜索 / 替换",
        icon: Search,
        keys: "Ctrl F",
        run: () => setSearchOpen(true),
      },
      {
        id: "stats",
        label: "写作统计",
        icon: Sparkles,
        run: () => setStatsOpen(true),
      },
      {
        id: "focus",
        label: focusMode ? "退出专注模式" : "进入专注模式",
        icon: Focus,
        keys: "Ctrl ⇧ F",
        run: () => setFocusMode(!focusMode),
      },
      {
        id: "ai",
        label: aiOpen ? "收起 AI 面板" : "展开 AI 面板",
        icon: Sparkles,
        keys: "Ctrl J",
        run: () => setAiOpen(!aiOpen),
      },
      {
        id: "theme",
        label: "切换亮 / 暗主题",
        icon: Moon,
        run: () => toggleTheme(),
      },
      {
        id: "docx",
        label: "导出为 Word 文档",
        icon: FileDown,
        run: () => void exportBook("docx"),
      },
      {
        id: "md",
        label: "导出为 Markdown",
        icon: FileDown,
        run: () => void exportBook("md"),
      },
      {
        id: "settings",
        label: "打开设置",
        icon: Settings,
        keys: "Ctrl ,",
        run: () => setSettingsOpen(true),
      },
    ],
    [
      aiOpen,
      createChapter,
      exportBook,
      focusMode,
      setAiOpen,
      setFocusMode,
      setProjectModal,
      setSettingsOpen,
      setSearchOpen,
      setStatsOpen,
      setView,
      toggleTheme,
    ]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.id.includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  const execute = (cmd?: Command) => {
    if (!cmd) return;
    setOpen(false);
    cmd.run();
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-6 pt-[14vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 480, damping: 36 }}
            className="relative z-10 w-full max-w-[540px] overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-panel)]"
          >
            <div className="flex items-center gap-2.5 border-b border-line/70 px-4 py-3">
              <Search size={14} className="text-mute" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setIndex((i) => (i + 1) % Math.max(1, filtered.length));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setIndex((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    execute(filtered[index]);
                  } else if (e.key === "Escape") {
                    setOpen(false);
                  }
                }}
                placeholder="输入命令…"
                className="flex-1 border-none bg-transparent text-[13px] text-ink outline-none placeholder:text-mute/70"
              />
              <span className="kbd">ESC</span>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-1.5 scroll-thin">
              {filtered.map((c, i) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.id}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => execute(c)}
                    className={cx(
                      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                      i === index ? "bg-gold/10 text-ink" : "text-dim"
                    )}
                  >
                    <Icon size={13} className={i === index ? "text-gold" : "text-mute"} />
                    <span className="flex-1 text-[12.5px]">{c.label}</span>
                    {c.keys ? <span className="kbd">{c.keys}</span> : null}
                    {i === index ? <CornerDownLeft size={11} className="text-mute" /> : null}
                  </button>
                );
              })}
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-[11.5px] text-mute">没有匹配的命令</div>
              ) : null}
            </div>
            <div className="flex items-center gap-3 border-t border-line/60 px-4 py-2 text-[9.5px] text-mute">
              <span className="flex items-center gap-1">
                <Check size={9} /> ↑↓ 选择
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft size={9} /> 回车执行
              </span>
              <span className="flex items-center gap-1">
                <Moon size={9} /> {useStore.getState().theme === "dark" ? "暗色" : "亮色"}
              </span>
              <span className="ml-auto flex items-center gap-1">
                <Sun size={9} /> 墨隐
              </span>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
