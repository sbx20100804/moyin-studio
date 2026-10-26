import { AnimatePresence, motion } from "motion/react";
import {
  AlignLeft,
  ArrowUpRight,
  Feather,
  Focus,
  History,
  ListTree,
  Loader2,
  Maximize2,
  MessagesSquare,
  Minimize2,
  RotateCcw,
  Scissors,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx, formatCount, readingMinutes, relativeDay, timeLabel } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { SnapshotMeta } from "@/lib/types";
import { Button, IconButton, Modal, TextArea } from "./ui";

const SELECT_ACTIONS = [
  {
    label: "润色",
    icon: Wand2,
    instruction:
      "润色这段文字：删掉多余的形容词与解释，让句子更短、更有画面感；情节与信息不变，保持原有视角。",
  },
  {
    label: "扩写",
    icon: Feather,
    instruction:
      "扩写这段文字：增加具体的动作、感官细节与环境氛围，让场景更饱满；不改变情节走向与人物关系，篇幅约原文的两倍。",
  },
  {
    label: "精简",
    icon: Scissors,
    instruction:
      "精简这段文字：删去冗余修饰与重复信息，保留关键动作、对白与情绪，篇幅压缩到原文的六成左右。",
  },
  {
    label: "对白",
    icon: AlignLeft,
    instruction:
      "把这段文字改写成以对白推进的场景：保留原有信息与情节，用简洁的对话与少量动作描写呈现，避免解释性叙述。",
  },
  {
    label: "轻小说",
    icon: MessagesSquare,
    instruction:
      "把这段改写成轻小说式对白：短句、口语，有停顿、打断和答非所问；不同角色说话的用词与语气必须不同（参考【角色语气】里的口癖、句长、常用词、禁用词）；删掉“说道/问道/回答道”这类转述，用动作和语气代替；保留原有信息与人物关系，篇幅与原文相当。",
  },
];

export default function Editor() {
  const draft = useStore((s) => s.draft);
  const chapter = useStore((s) => s.chapters.find((c) => c.id === s.activeChapterId));
  const setDraft = useStore((s) => s.setDraft);
  const focusMode = useStore((s) => s.focusMode);
  const setFocusMode = useStore((s) => s.setFocusMode);
  const aiOpen = useStore((s) => s.aiOpen);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const setCaret = useStore((s) => s.setCaret);
  const caretRequest = useStore((s) => s.caretRequest);
  const setCaretRequest = useStore((s) => s.setCaretRequest);
  const runAI = useStore((s) => s.runAI);
  const gen = useStore((s) => s.gen);
  const updateChapterSummary = useStore((s) => s.updateChapterSummary);
  const updateChapterMeta = useStore((s) => s.updateChapterMeta);
  const restoreSnapshot = useStore((s) => s.restoreSnapshot);
  const summarizeNow = useStore((s) => s.summarizeNow);
  const summarizing = useStore((s) => s.summarizing);
  const chapters = useStore((s) => s.chapters);
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [outlineText, setOutlineText] = useState("");
  const [volumeText, setVolumeText] = useState("");
  const [statusValue, setStatusValue] = useState("draft");
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);

  const resizeRaf = useRef<number | null>(null);

  const resize = () => {
    if (resizeRaf.current != null) return;
    resizeRaf.current = requestAnimationFrame(() => {
      resizeRaf.current = null;
      const el = textareaRef.current;
      if (!el) return;
      const length = useStore.getState().draft?.content.length ?? 0;
      // Very long chapters switch to a fixed-height pane with internal scroll:
      // measuring scrollHeight on every keystroke gets expensive.
      if (length > 40000) {
        el.style.height = "calc(100vh - 170px)";
        el.style.overflowY = "auto";
        return;
      }
      el.style.overflowY = "hidden";
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 320)}px`;
    });
  };

  useEffect(() => {
    resize();
  }, [draft?.content, focusMode]);

  useEffect(
    () => () => {
      if (resizeRaf.current != null) cancelAnimationFrame(resizeRaf.current);
    },
    []
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !draft) return;
    if (draft.content.length === 0) el.focus();
  }, [chapter?.id]);

  useEffect(() => {
    if (caretRequest == null) return;
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(caretRequest, caretRequest);
      setCaret(caretRequest);
    }
    setCaretRequest(null);
  }, [caretRequest, setCaret, setCaretRequest]);

  const openHistory = async () => {
    if (!chapter) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const list = await api.listSnapshots(chapter.id);
      setSnapshots(list);
    } catch (err) {
      setSnapshots([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const generateSummary = async () => {
    if (!chapter) return;
    setSummaryBusy(true);
    const summary = await summarizeNow(chapter.id);
    if (summary) setSummaryText(summary);
    setSummaryBusy(false);
  };

  if (!draft || !chapter) {
    return (
      <section className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-line/70 bg-surface2/40">
            <Feather size={18} className="text-mute" />
          </div>
          <p className="text-[13px] text-mute">选择左侧的一个章节，或新建一章开始写作</p>
        </div>
      </section>
    );
  }

  const words = draft.content.replace(/\s/g, "").length;
  const progress =
    project && project.targetWords > 0
      ? Math.min(100, (project.wordCount / project.targetWords) * 100)
      : 0;
  const index = chapters.findIndex((c) => c.id === chapter.id);

  return (
    <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="relative z-10 flex h-11 shrink-0 items-center gap-2 border-b border-line/50 px-5">
        <span className="text-[10.5px] tracking-[0.18em] text-mute">
          {chapter.volume || project?.title || "未分卷"}
        </span>
        <span className="text-mute/50">/</span>
        <span className="text-[10.5px] text-mute">
          第 {String(index + 1).padStart(2, "0")} 章
        </span>
        <div className="flex-1" />
        {summarizing.includes(chapter.id) ? (
          <span className="flex items-center gap-1 text-[10px] text-gold/70">
            <Loader2 size={10} className="animate-spin" /> 生成摘要…
          </span>
        ) : null}
        <button
          onClick={() => void openHistory()}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] text-mute transition-colors hover:bg-surface2/70 hover:text-gold"
        >
          <History size={11} /> 历史
        </button>
        <button
          onClick={() => {
            setSummaryText(chapter.summary);
            setOutlineText(chapter.outline);
            setVolumeText(chapter.volume);
            setStatusValue(chapter.status || "draft");
            setSummaryOpen(true);
          }}
          className="rounded-lg px-2 py-1 text-[10.5px] text-mute transition-colors hover:bg-surface2/70 hover:text-gold"
        >
          章节
        </button>
        <div className="mx-1 h-3 w-px bg-line/70" />
        <IconButton onClick={() => setFocusMode(!focusMode)} active={focusMode} title="专注模式">
          {focusMode ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </IconButton>
        <IconButton onClick={() => setAiOpen(!aiOpen)} active={aiOpen} title="AI 面板">
          <Sparkles size={13} />
        </IconButton>
      </div>

      <div className="scroll-thin relative flex-1 overflow-y-auto">
        <div
          className={cx(
            "manuscript relative mx-auto w-full px-8 pb-44 transition-[max-width] duration-300",
            focusMode ? "max-w-[680px] pt-20" : "max-w-[760px] pt-14"
          )}
        >
          <div className="mb-6 flex items-center gap-2 text-[10px] tracking-[0.3em] text-mute/80">
            <span className="h-px w-6 bg-gold/40" />
            {chapter.volume || "正文"}
          </div>

          <input
            value={draft.title}
            onChange={(e) => setDraft({ title: e.target.value })}
            placeholder="未命名章节"
            className="w-full border-none bg-transparent font-serif text-[27px] font-medium leading-snug text-ink outline-none placeholder:text-mute/40"
          />

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-gradient-to-r from-gold/30 via-line to-transparent" />
            <span className="text-[10px] text-mute/70">{formatCount(words)} 字</span>
          </div>

          <textarea
            ref={textareaRef}
            value={draft.content}
            onChange={(e) => {
              setDraft({ content: e.target.value });
              setSelection(null);
              setCaret(e.target.selectionStart);
            }}
            onSelect={(e) => {
              const el = e.currentTarget;
              const start = el.selectionStart;
              const end = el.selectionEnd;
              setCaret(end);
              if (end > start) {
                setSelection({ start, end, text: draft.content.slice(start, end) });
              } else if (useStore.getState().selection) {
                setSelection(null);
              }
            }}
            onClick={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
            onBlur={() => {
              // keep selection so the floating bar can be used before focus leaves
            }}
            spellCheck={false}
            placeholder="在这里落下第一句话。写不下去时，按 Ctrl + Enter 让 AI 接住。"
            className="w-full resize-none border-none bg-transparent font-serif text-[17.5px] leading-[2.05] tracking-[0.012em] text-ink/95 outline-none placeholder:text-mute/35"
          />
        </div>
      </div>

      <AnimatePresence>
        {selection && selection.text.trim().length > 0 && gen?.status !== "streaming" ? (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 480, damping: 34 }}
            className="scroll-thin absolute bottom-16 left-1/2 z-20 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto whitespace-nowrap rounded-2xl border border-line/90 bg-surface/95 p-1 pl-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl"
          >
            <span className="mr-1 shrink-0 select-none text-[10.5px] tabular-nums text-mute">
              已选 {selection.text.replace(/\s/g, "").length} 字
            </span>
            {SELECT_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  onClick={() => void runAI("rewrite", a.instruction)}
                  className="flex shrink-0 items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11.5px] text-dim transition-colors hover:bg-gold/12 hover:text-gold"
                >
                  <Icon size={11} /> {a.label}
                </button>
              );
            })}
            <div className="mx-1 h-4 w-px shrink-0 bg-line/80" />
            <button
              onClick={() => void runAI("custom")}
              className="mr-0.5 flex shrink-0 items-center gap-1 rounded-xl bg-gold/12 px-2.5 py-1.5 text-[11.5px] text-gold transition-colors hover:bg-gold/20"
            >
              自定义 <ArrowUpRight size={11} />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="relative z-10 flex h-9 shrink-0 items-center gap-4 border-t border-line/50 px-5 text-[10px] text-mute">
        <span className="tabular-nums">{formatCount(words)} 字</span>
        <span className="h-2.5 w-px bg-line/70" />
        <span>约 {readingMinutes(words)} 分钟读完</span>
        {project && project.targetWords > 0 ? (
          <>
            <span className="h-2.5 w-px bg-line/70" />
            <span className="flex items-center gap-2">
              <span className="h-1 w-24 overflow-hidden rounded-full bg-line/60">
                <span
                  className="block h-full rounded-full bg-gold/70"
                  style={{ width: `${progress}%` }}
                />
              </span>
              <span className="tabular-nums">{progress.toFixed(0)}%</span>
            </span>
          </>
        ) : null}
        <div className="flex-1" />
        {focusMode ? (
          <span className="flex items-center gap-1 text-gold/70">
            <Focus size={10} /> 专注模式
          </span>
        ) : (
          <span className="text-mute/60">Ctrl + Enter 从光标处续写 · Ctrl S 保存</span>
        )}
      </div>

      <Modal
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title="章节信息"
        subtitle="摘要进入前情链，章纲进入本章提示词；卷名与状态用于整理目录"
        width="620px"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSummaryOpen(false)}>
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={outlineBusy}
              onClick={async () => {
                setOutlineBusy(true);
                const outline = await useStore.getState().generateOutline(chapter.id);
                if (outline) setOutlineText(outline);
                setOutlineBusy(false);
              }}
            >
              <ListTree size={12} /> AI 章纲
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={summaryBusy}
              onClick={() => void generateSummary()}
            >
              <Sparkles size={12} /> AI 摘要
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                void updateChapterMeta(chapter.id, {
                  summary: summaryText.trim(),
                  outline: outlineText.trim(),
                  volume: volumeText.trim(),
                  status: statusValue,
                });
                setSummaryOpen(false);
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[11.5px] text-dim">卷名</span>
              <input
                value={volumeText}
                onChange={(e) => setVolumeText(e.target.value)}
                placeholder="第一卷 河灯"
                className="w-full rounded-xl border border-line/80 bg-surface2/40 px-3 py-2 text-[12px] text-ink outline-none focus:border-gold/50"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11.5px] text-dim">状态</span>
              <select
                value={statusValue}
                onChange={(e) => setStatusValue(e.target.value)}
                className="w-full rounded-xl border border-line/80 bg-surface2/40 px-3 py-2 text-[12px] text-ink outline-none focus:border-gold/50"
              >
                <option value="draft">草稿</option>
                <option value="revised">修订中</option>
                <option value="done">定稿</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11.5px] text-dim">本章章纲</span>
            <TextArea
              rows={4}
              value={outlineText}
              onChange={(e) => setOutlineText(e.target.value)}
              placeholder="这一章要发生什么：谁做了什么、冲突在哪、结尾停在哪。"
              className="text-[12px]"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11.5px] text-dim">章节摘要</span>
            <TextArea
              rows={4}
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              placeholder="用三两句话概括本章发生了什么、人物状态有何变化、埋了哪些伏笔。"
              className="text-[12px]"
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="历史版本"
        subtitle="AI 采纳前会自动存一份；恢复动作本身也会再存一份，所以可以反悔"
        width="600px"
      >
        {historyLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={16} className="animate-spin text-gold" />
          </div>
        ) : snapshots.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-mute">
            还没有历史版本。使用 AI 续写或改写并采纳后，这里会自动出现备份。
          </p>
        ) : (
          <div className="space-y-1.5">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className="flex items-center gap-3 rounded-xl border border-line/70 px-3 py-2 transition-colors hover:border-gold/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-ink">{snap.reason || "手动快照"}</div>
                  <div className="mt-0.5 text-[10px] text-mute">
                    {relativeDay(snap.createdAt)} {timeLabel(snap.createdAt)} ·{" "}
                    {formatCount(snap.wordCount)} 字
                  </div>
                  {snap.preview ? (
                    <div className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-mute/80">
                      {snap.preview}
                    </div>
                  ) : null}
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={async () => {
                    await restoreSnapshot(snap.id);
                    setHistoryOpen(false);
                  }}
                >
                  <RotateCcw size={10} /> 恢复
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </section>
  );
}
