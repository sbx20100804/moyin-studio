import { motion } from "motion/react";
import { ListTree, Loader2, PenLine, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx, formatCount } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Button, Chip } from "./ui";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  revised: "修订",
  done: "定稿",
};

export default function Outline() {
  const chapters = useStore((s) => s.chapters);
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const updateChapterMeta = useStore((s) => s.updateChapterMeta);
  const generateOutline = useStore((s) => s.generateOutline);
  const setView = useStore((s) => s.setView);
  const openChapter = useStore((s) => s.openChapter);

  const [edits, setEdits] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const savedRef = useRef<Record<number, string>>({});
  const editsRef = useRef<Record<number, string>>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const commit = (id: number) => {
    const timer = timers.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timers.current[id];
    }
    const text = editsRef.current[id];
    const current = useStore.getState().chapters.find((c) => c.id === id);
    if (text === undefined || !current || text === current.outline) return;
    savedRef.current[id] = text;
    void updateChapterMeta(id, { outline: text });
  };

  // Flush pending edits when leaving the outline view (unmount).
  useEffect(() => {
    return () => {
      for (const key of Object.keys(timers.current)) {
        clearTimeout(timers.current[Number(key)]);
        delete timers.current[Number(key)];
        const text = editsRef.current[Number(key)];
        if (text !== undefined) {
          void useStore.getState().updateChapterMeta(Number(key), { outline: text });
        }
      }
    };
  }, []);

  useEffect(() => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const c of chapters) {
        // Adopt store changes (AI generation, restore) but keep unsaved typing.
        if (savedRef.current[c.id] !== c.outline) {
          next[c.id] = c.outline;
          savedRef.current[c.id] = c.outline;
        } else if (next[c.id] === undefined) {
          next[c.id] = c.outline;
          savedRef.current[c.id] = c.outline;
        }
      }
      return next;
    });
  }, [chapters]);

  const volumes = useMemo(() => {
    const map = new Map<string, typeof chapters>();
    for (const c of chapters) {
      const key = c.volume || "未分卷";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()];
  }, [chapters]);

  const withOutline = chapters.filter((c) => c.outline.trim()).length;

  if (!project) return null;

  return (
    <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line/50 px-5">
        <span className="text-[10.5px] tracking-[0.18em] text-mute">OUTLINE</span>
        <span className="text-mute/50">/</span>
        <span className="text-[10.5px] text-mute">
          {chapters.length} 章 · {withOutline} 章有章纲
        </span>
        <div className="flex-1" />
        <Button size="xs" variant="outline" onClick={() => setView("write")}>
          <PenLine size={11} /> 回到正文
        </Button>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] px-9 py-8">
          <div className="mb-6">
            <h1 className="font-serif text-[24px] font-medium tracking-wide text-ink">全书大纲</h1>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-mute">
              每一章先写清「这一章要发生什么」，续写时它会作为【本章章纲】注入。
              没有章纲的章节，AI 只能自己猜方向。
            </p>
          </div>

          {volumes.map(([volume, list]) => (
            <div key={volume} className="mb-8">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] tracking-[0.24em] text-mute">{volume}</span>
                <span className="h-px flex-1 bg-line/60" />
              </div>

              <div className="space-y-2">
                {list.map((chapter) => {
                  const index = chapters.findIndex((c) => c.id === chapter.id);
                  const value = edits[chapter.id] ?? chapter.outline;
                  const changed = value !== chapter.outline;
                  return (
                    <motion.div
                      key={chapter.id}
                      layout
                      className={cx(
                        "rounded-2xl border p-3.5 transition-colors",
                        changed ? "border-gold/40 bg-gold/[0.04]" : "border-line/70 bg-surface2/20"
                      )}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="font-mono text-[10px] text-mute">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <button
                          onClick={async () => {
                            await openChapter(chapter.id);
                            setView("write");
                          }}
                          className="truncate font-serif text-[14px] text-ink hover:text-gold"
                          title="打开正文"
                        >
                          {chapter.title}
                        </button>
                        <Chip>{STATUS_LABEL[chapter.status] ?? chapter.status}</Chip>
                        <span className="text-[10px] text-mute">
                          {chapter.wordCount > 0 ? `${formatCount(chapter.wordCount)} 字` : "未动笔"}
                        </span>
                        <div className="flex-1" />
                        {busy === chapter.id ? (
                          <span className="flex items-center gap-1 text-[10px] text-gold/80">
                            <Loader2 size={10} className="animate-spin" /> 生成中
                          </span>
                        ) : null}
                        <Button
                          size="xs"
                          variant="ghost"
                          loading={busy === chapter.id}
                          onClick={async () => {
                            setBusy(chapter.id);
                            const outline = await generateOutline(chapter.id);
                            setBusy(null);
                            if (outline) setEdits((prev) => ({ ...prev, [chapter.id]: outline }));
                          }}
                        >
                          <Sparkles size={10} /> AI 章纲
                        </Button>
                      </div>

                      <textarea
                        value={value}
                        onChange={(e) => {
                          const text = e.target.value;
                          editsRef.current[chapter.id] = text;
                          setEdits((prev) => ({ ...prev, [chapter.id]: text }));
                          const timer = timers.current[chapter.id];
                          if (timer) clearTimeout(timer);
                          timers.current[chapter.id] = setTimeout(
                            () => commit(chapter.id),
                            700
                          );
                        }}
                        onBlur={() => commit(chapter.id)}
                        rows={3}
                        placeholder="这一章要发生什么：谁做了什么、冲突在哪、结尾停在哪。三四行就够。"
                        className="scroll-thin w-full resize-none rounded-xl border border-line/60 bg-surface/40 px-3 py-2 text-[12px] leading-[1.9] text-dim outline-none transition-colors placeholder:text-mute/60 focus:border-gold/40 focus:bg-surface/70"
                      />
                      {changed ? (
                        <div className="mt-1 text-[9.5px] text-gold/70">输入后自动保存</div>
                      ) : null}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}

          {chapters.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <ListTree size={20} className="mb-3 text-mute" />
              <p className="text-[12px] text-mute">还没有章节，先去写第一章吧。</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setView("write")}>
                回到正文
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
