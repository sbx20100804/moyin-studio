import { AnimatePresence, motion } from "motion/react";
import {
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  FileDown,
  FileUp,
  GripVertical,
  ListTree,
  MapPin,
  MoreHorizontal,
  Package,
  Plus,
  Settings2,
  Sparkles,
  Swords,
  Trash2,
  Users,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx, formatCount, pad2 } from "@/lib/format";
import { KIND_LABEL, useStore, type View } from "@/lib/store";
import type { EntityKind } from "@/lib/types";
import { Button, Chip, IconButton, Modal } from "./ui";

const KIND_ICON: Record<EntityKind, typeof Users> = {
  character: Users,
  location: MapPin,
  faction: Swords,
  item: Package,
  concept: Sparkles,
};

function ProjectSwitcher({ onExport }: { onExport: () => void }) {
  const projects = useStore((s) => s.projects);
  const active = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const openProject = useStore((s) => s.openProject);
  const setProjectModal = useStore((s) => s.setProjectModal);
  const exportBook = useStore((s) => s.exportBook);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const progress =
    active && active.targetWords > 0
      ? Math.min(100, (active.wordCount / active.targetWords) * 100)
      : 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="group relative w-full overflow-hidden rounded-2xl border border-line/80 bg-gradient-to-br from-surface2/80 to-surface/40 p-3 text-left transition-colors hover:border-gold/30"
      >
        <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-gold/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[9.5px] tracking-[0.28em] text-mute">CURRENT WORK</div>
            <div className="mt-1 truncate font-serif text-[16.5px] leading-tight text-ink">
              {active?.title ?? "尚未开始"}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-mute">
              <span>{active ? `${formatCount(active.wordCount)} 字` : "—"}</span>
              <span className="h-2 w-px bg-line" />
              <span>{active ? `${active.chapterCount} 章` : "—"}</span>
            </div>
          </div>
          <ChevronDown
            size={13}
            className={cx("mt-1 shrink-0 text-mute transition-transform", open && "rotate-180")}
          />
        </div>
        {active && active.targetWords > 0 ? (
          <div className="relative mt-2.5 h-[3px] overflow-hidden rounded-full bg-line/70">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-gold/60 to-gold"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 90, damping: 20 }}
            />
          </div>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-panel)]"
          >
            <div className="px-2.5 pb-1 pt-1.5 text-[9.5px] tracking-[0.24em] text-mute">书架</div>
            <div className="max-h-[240px] overflow-y-auto scroll-thin">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    void openProject(p.id);
                    setOpen(false);
                  }}
                  className={cx(
                    "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors",
                    p.id === active?.id ? "bg-gold/10" : "hover:bg-surface2/80"
                  )}
                >
                  <span className="h-7 w-[3px] shrink-0 rounded-full bg-gradient-to-b from-gold/70 to-gold/10" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-ink">{p.title}</span>
                    <span className="text-[10px] text-mute">
                      {formatCount(p.wordCount)} 字 · {p.chapterCount} 章
                    </span>
                  </span>
                  {p.id === active?.id ? <Check size={12} className="text-gold" /> : null}
                </button>
              ))}
            </div>
            <div className="my-1 h-px bg-line/70" />
            <button
              onClick={() => {
                setProjectModal({ mode: "new" });
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12px] text-dim transition-colors hover:bg-surface2/80 hover:text-ink"
            >
              <Plus size={13} /> 新建作品
            </button>
            <button
              onClick={() => {
                setProjectModal({ mode: "edit" });
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12px] text-dim transition-colors hover:bg-surface2/80 hover:text-ink"
            >
              <Settings2 size={13} /> 作品设置
            </button>
            <button
              onClick={() => {
                void useStore.getState().importBook();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12px] text-dim transition-colors hover:bg-surface2/80 hover:text-ink"
            >
              <FileUp size={13} /> 导入作品（txt / docx）
            </button>
            <div className="my-1 h-px bg-line/70" />
            <div className="px-2.5 pb-1 text-[9.5px] tracking-[0.24em] text-mute">导出</div>
            <div className="flex gap-1 px-1 pb-1">
              {(["docx", "md", "txt"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    void exportBook(f);
                    setOpen(false);
                  }}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-line/70 py-1.5 text-[10.5px] text-dim transition-colors hover:border-gold/40 hover:text-gold"
                >
                  <FileDown size={11} /> {f.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                onExport();
                setOpen(false);
              }}
              className="mb-1 flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10.5px] text-mute transition-colors hover:text-gold"
            >
              <Download size={11} /> 选择章节导出…
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ChapterRow({
  chapter,
  index,
  active,
  onRequestDelete,
}: {
  chapter: ReturnType<typeof useStore.getState>["chapters"][number];
  index: number;
  active: boolean;
  onRequestDelete: () => void;
}) {
  const openChapter = useStore((s) => s.openChapter);
  const renameChapter = useStore((s) => s.renameChapter);
  const moveChapter = useStore((s) => s.moveChapter);
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(chapter.title);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!renaming) setValue(chapter.title);
  }, [chapter.title, renaming]);

  const commit = () => {
    const next = value.trim();
    setRenaming(false);
    if (next && next !== chapter.title) void renameChapter(chapter.id, next);
    else setValue(chapter.title);
  };

  return (
    <li
      draggable={!renaming}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        setDragging(false);
        const id = Number(e.dataTransfer.getData("text/chapter"));
        if (id) void moveChapter(id, chapter.id);
      }}
      className={cx("relative", dragging && "opacity-40", over && "rounded-xl ring-1 ring-gold/50")}
      style={{ listStyle: "none" }}
    >
      {over ? (
        <div className="absolute -top-[3px] left-2 right-2 z-10 h-[2px] rounded-full bg-gold" />
      ) : null}
      <div
        onDragStartCapture={(e) => e.dataTransfer.setData("text/chapter", String(chapter.id))}
        className={cx(
          "group relative flex items-center gap-2 rounded-xl px-2 py-2 transition-colors",
          active ? "bg-gold/[0.08]" : "hover:bg-surface2/60"
        )}
      >
        {active ? (
          <motion.span
            layoutId="chapter-active"
            className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-gold"
            transition={{ type: "spring", stiffness: 500, damping: 38 }}
          />
        ) : null}
        <span className="w-[22px] shrink-0 text-center font-mono text-[10px] tabular-nums text-mute">
          {pad2(index + 1)}
        </span>
        <button
          onClick={() => void openChapter(chapter.id)}
          onDoubleClick={() => setRenaming(true)}
          className="min-w-0 flex-1 text-left"
        >
          {renaming ? (
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setValue(chapter.title);
                  setRenaming(false);
                }
              }}
              className="w-full rounded-md border border-gold/40 bg-surface px-1.5 py-0.5 text-[12.5px] text-ink outline-none"
            />
          ) : (
            <>
              <div
                className={cx(
                  "truncate text-[12.5px] leading-tight",
                  active ? "text-ink" : "text-dim group-hover:text-ink"
                )}
              >
                {chapter.title}
              </div>
              <div className="mt-0.5 text-[10px] text-mute">
                {chapter.wordCount > 0 ? `${formatCount(chapter.wordCount)} 字` : "空白页"}
              </div>
            </>
          )}
        </button>
        <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onRequestDelete}
            className="rounded-md p-1 text-mute hover:bg-cinnabar/15 hover:text-cinnabar"
            title="删除章节"
          >
            <Trash2 size={11} />
          </button>
        </div>
        <GripVertical
          size={11}
          className="shrink-0 cursor-grab text-mute/40 opacity-0 group-hover:opacity-100"
        />
      </div>
    </li>
  );
}

export default function Sidebar() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const chapters = useStore((s) => s.chapters);
  const entities = useStore((s) => s.entities);
  const activeChapterId = useStore((s) => s.activeChapterId);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const createChapter = useStore((s) => s.createChapter);
  const removeChapter = useStore((s) => s.removeChapter);
  const threads = useStore((s) => s.threads);
  const deletedChapters = useStore((s) => s.deletedChapters);
  const loadDeleted = useStore((s) => s.loadDeleted);
  const restoreDeleted = useStore((s) => s.restoreDeleted);
  const purgeDeleted = useStore((s) => s.purgeDeleted);
  const profiles = useStore((s) => s.profiles);
  const activeProfileId = useStore((s) => s.activeProfileId);
  const pickProfile = useStore((s) => s.pickProfile);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; title: string } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [exportIds, setExportIds] = useState<number[]>([]);
  const [exportFormat, setExportFormat] = useState<"docx" | "md" | "txt">("docx");
  const exportBook = useStore((s) => s.exportBook);

  const grouped = useMemo(() => {
    const map: Partial<Record<EntityKind, typeof entities>> = {};
    for (const e of entities) {
      (map[e.kind] ??= []).push(e);
    }
    return map;
  }, [entities]);

  const profile = profiles.find((p) => p.id === activeProfileId);

  const tabs: { key: View; label: string; icon: typeof BookOpen }[] = [
    { key: "write", label: "章节", icon: BookOpen },
    { key: "outline", label: "大纲", icon: ListTree },
    { key: "bible", label: "设定", icon: Sparkles },
    { key: "threads", label: "线索", icon: BookMarked },
  ];

  return (
    <aside className="relative z-20 flex w-[286px] shrink-0 flex-col border-r border-line/60 bg-surface/25">
      <div className="shrink-0 space-y-3 p-3">
        <ProjectSwitcher
          onExport={() => {
            setExportIds(chapters.map((c) => c.id));
            setExportOpen(true);
          }}
        />
        <div className="relative flex rounded-xl border border-line/60 bg-surface2/40 p-0.5">
          {tabs.map((t) => {
            const Icon = t.icon;
            const on = view === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className={cx(
                  "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-1.5 text-[11.5px] transition-colors",
                  on ? "text-ink" : "text-mute hover:text-dim"
                )}
              >
                {on ? (
                  <motion.span
                    layoutId="sidebar-tab"
                    className="absolute inset-0 rounded-[9px] border border-line/80 bg-surface shadow-sm"
                    transition={{ type: "spring", stiffness: 480, damping: 36 }}
                  />
                ) : null}
                <Icon size={12} className="relative" />
                <span className="relative">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-2 pb-4">
        <AnimatePresence mode="wait">
          {view === "write" ? (
            <motion.div
              key="chapters"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.16 }}
            >
              <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
                <span className="text-[9.5px] tracking-[0.24em] text-mute">
                  目录 · {chapters.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setTrashOpen(true);
                      void loadDeleted();
                    }}
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] text-mute transition-colors hover:bg-surface2 hover:text-gold"
                    title="回收站"
                  >
                    <Trash2 size={11} /> 回收站
                  </button>
                  <button
                    onClick={() => void createChapter()}
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] text-mute transition-colors hover:bg-surface2 hover:text-gold"
                  >
                    <Plus size={11} /> 新章
                  </button>
                </div>
              </div>
              <ul className="space-y-0.5">
                {chapters.map((c, i) => (
                  <ChapterRow
                    key={c.id}
                    chapter={c}
                    index={i}
                    active={c.id === activeChapterId && view === "write"}
                    onRequestDelete={() => setPendingDelete({ id: c.id, title: c.title })}
                  />
                ))}
              </ul>
              {activeProjectId != null ? (
                <button
                  onClick={() => void createChapter()}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line/80 py-2 text-[11.5px] text-mute transition-colors hover:border-gold/40 hover:text-gold"
                >
                  <Plus size={12} /> 新建章节
                </button>
              ) : null}
            </motion.div>
          ) : view === "outline" ? (
            <motion.div
              key="outline"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.16 }}
            >
              <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
                <span className="text-[9.5px] tracking-[0.24em] text-mute">
                  章纲 · {chapters.filter((c) => c.outline.trim()).length}/{chapters.length}
                </span>
              </div>
              {chapters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setView("outline")}
                  className="group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface2/60"
                >
                  <span
                    className={cx(
                      "mt-1 h-1 w-1 shrink-0 rounded-full",
                      c.outline.trim() ? "bg-gold/70" : "bg-mute/30"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] text-dim group-hover:text-ink">
                      {c.title}
                    </span>
                    <span className="block truncate text-[9.5px] text-mute">
                      {c.outline.trim() || "还没有章纲"}
                    </span>
                  </span>
                </button>
              ))}
              {chapters.length === 0 ? (
                <div className="px-2 py-6 text-center text-[11px] text-mute">
                  先建一章，再写章纲
                </div>
              ) : null}
            </motion.div>
          ) : view === "threads" ? (
            <motion.div
              key="threads"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.16 }}
            >
              <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
                <span className="text-[9.5px] tracking-[0.24em] text-mute">
                  线索 · {threads.filter((t) => t.status === "open").length} 待回收
                </span>
              </div>
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setView("threads")}
                  className="group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface2/60"
                >
                  <span
                    className={cx(
                      "mt-1 h-1 w-1 shrink-0 rounded-full",
                      t.status === "open"
                        ? "bg-gold/70"
                        : t.status === "paid"
                          ? "bg-emerald-400/60"
                          : "bg-mute/30"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] text-dim group-hover:text-ink">
                      {t.title}
                    </span>
                    <span className="block truncate text-[9.5px] text-mute">
                      {t.status === "open" ? "待回收" : t.status === "paid" ? "已回收" : "已放弃"}
                      {t.detail ? ` · ${t.detail}` : ""}
                    </span>
                  </span>
                </button>
              ))}
              {threads.length === 0 ? (
                <div className="px-2 py-6 text-center text-[11px] leading-relaxed text-mute">
                  还没有线索
                  <br />
                  <span className="text-[10px]">伏笔、承诺、疑点记在这里</span>
                </div>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="bible"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.16 }}
            >
              <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
                <span className="text-[9.5px] tracking-[0.24em] text-mute">
                  设定库 · {entities.length}
                </span>
              </div>
              {(Object.keys(grouped) as EntityKind[]).map((kind) => {
                const Icon = KIND_ICON[kind];
                return (
                  <div key={kind} className="mb-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-mute">
                      <Icon size={10} />
                      {KIND_LABEL[kind]}
                    </div>
                    {grouped[kind]!.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setView("bible")}
                        className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface2/60"
                      >
                        <span className="h-1 w-1 shrink-0 rounded-full bg-gold/50" />
                        <span className="min-w-0 flex-1 truncate text-[12px] text-dim group-hover:text-ink">
                          {e.name}
                        </span>
                        <span className="shrink-0 text-[9.5px] text-mute">{e.role}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
              {entities.length === 0 ? (
                <div className="px-2 py-6 text-center text-[11px] leading-relaxed text-mute">
                  还没有设定
                  <br />
                  <span className="text-[10px]">人物、地点会在这里沉淀</span>
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative shrink-0 border-t border-line/60 p-2.5">
        <button
          onClick={() => setProfileOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface2/60"
        >
          <span
            className={cx(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              profile?.hasKey ? "bg-emerald-400/80" : "bg-gold/60"
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11.5px] text-dim">
              {profile ? profile.model : "未配置模型"}
            </span>
            <span className="text-[9.5px] text-mute">
              {profile ? (profile.hasKey ? "已连接 · 点击切换" : "缺少 API Key") : "点击添加"}
            </span>
          </span>
          <ChevronDown size={12} className="text-mute" />
        </button>

        <AnimatePresence>
          {profileOpen ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="absolute bottom-[calc(100%-4px)] left-2.5 right-2.5 z-40 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-panel)]"
              >
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      pickProfile(p.id);
                      setProfileOpen(false);
                    }}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px]",
                      p.id === activeProfileId ? "bg-gold/10 text-ink" : "text-dim hover:bg-surface2"
                    )}
                  >
                    <span className="flex-1 truncate">{p.model}</span>
                    {p.isDefault ? <span className="text-[9px] text-gold">默认</span> : null}
                  </button>
                ))}
                <div className="my-1 h-px bg-line/70" />
                <button
                  onClick={() => {
                    setSettingsOpen(true);
                    setProfileOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-dim hover:bg-surface2"
                >
                  <Settings2 size={11} /> 管理模型
                </button>
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>
      </div>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="删除章节"
        width="420px"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingDelete) void removeChapter(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              <Trash2 size={12} /> 确定删除
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-dim">
          即将删除
          <span className="mx-1 font-serif text-ink">「{pendingDelete?.title}」</span>
          ，其中的正文会一并消失，且无法恢复。
        </p>
      </Modal>

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="选择章节导出"
        subtitle="默认全选；可以只导出某一卷或某一章"
        width="560px"
        footer={
          <>
            <div className="mr-auto flex rounded-lg border border-line/70 p-0.5">
              {(["docx", "md", "txt"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setExportFormat(f)}
                  className={cx(
                    "rounded-md px-2 py-1 text-[10.5px] transition-colors",
                    exportFormat === f ? "bg-gold/15 text-gold" : "text-mute hover:text-dim"
                  )}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            <Button variant="ghost" onClick={() => setExportOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={exportIds.length === 0}
              onClick={() => {
                void exportBook(exportFormat, exportIds);
                setExportOpen(false);
              }}
            >
              <FileDown size={12} /> 导出 {exportIds.length} 章
            </Button>
          </>
        }
      >
        <div className="mb-2 flex items-center gap-2 text-[10.5px] text-mute">
          <button
            className="transition-colors hover:text-gold"
            onClick={() => setExportIds(chapters.map((c) => c.id))}
          >
            全选
          </button>
          <span>/</span>
          <button className="transition-colors hover:text-gold" onClick={() => setExportIds([])}>
            清空
          </button>
          <span className="flex-1" />
          <span>共 {chapters.length} 章</span>
        </div>
        {(() => {
          const map = new Map<string, number[]>();
          for (const c of chapters) {
            const key = c.volume || "未分卷";
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(c.id);
          }
          const groups = [...map.entries()];
          if (groups.length <= 1) return null;
          return (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {groups.map(([volume, ids]) => (
                <button
                  key={volume}
                  onClick={() => setExportIds(ids)}
                  className="rounded-full border border-line/70 px-2 py-0.5 text-[10px] text-mute transition-colors hover:border-gold/40 hover:text-gold"
                >
                  {volume} · {ids.length} 章
                </button>
              ))}
            </div>
          );
        })()}
        <div className="scroll-thin max-h-[46vh] space-y-0.5 overflow-y-auto">
          {chapters.map((c) => {
            const checked = exportIds.includes(c.id);
            return (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface2/60"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setExportIds((ids) =>
                      checked ? ids.filter((x) => x !== c.id) : [...ids, c.id]
                    )
                  }
                  className="h-3.5 w-3.5 accent-[var(--c-gold)]"
                />
                <span className="min-w-0 flex-1 truncate text-[12px] text-dim">{c.title}</span>
                <span className="shrink-0 text-[10px] text-mute">
                  {c.wordCount > 0 ? `${formatCount(c.wordCount)} 字` : "空白"}
                </span>
              </label>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        title="回收站"
        subtitle="删除的章节会先放到这里，恢复后回到目录末尾"
        width="520px"
      >
        {deletedChapters.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-mute">回收站是空的</p>
        ) : (
          <div className="space-y-1.5">
            {deletedChapters.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl border border-line/70 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-dim">{c.title}</div>
                  <div className="text-[10px] text-mute">
                    {formatCount(c.wordCount)} 字 · {c.volume || "未分卷"}
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => void restoreDeleted(c.id)}
                >
                  恢复
                </Button>
                <Button
                  size="xs"
                  variant="danger"
                  onClick={() => void purgeDeleted(c.id)}
                >
                  彻底删除
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </aside>
  );
}
