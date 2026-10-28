import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  Copy,
  CornerDownLeft,
  Feather,
  Layers,
  ListTree,
  PenLine,
  RefreshCw,
  Rows,
  Sparkles,
  Square,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildMessages } from "@/lib/ai";
import { analyzeHuman } from "@/lib/humanize";
import { cx, estimateTokens, looksLikeMeta } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { GenKind } from "@/lib/types";
import DiffView from "./DiffView";
import { Button, IconButton, TextArea } from "./ui";

const KIND_META: Record<GenKind, { label: string; icon: typeof PenLine }> = {
  continue: { label: "续写", icon: PenLine },
  rewrite: { label: "改写", icon: Wand2 },
  outline: { label: "章纲", icon: ListTree },
  custom: { label: "自定义", icon: Sparkles },
};

function ContextMeter() {
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const chapters = useStore((s) => s.chapters);
  const chapter = useStore((s) => s.chapters.find((c) => c.id === s.activeChapterId));
  const entities = useStore((s) => s.entities);
  const content = useStore((s) => s.draft?.content ?? "");
  const profile = useStore(
    (s) => s.profiles.find((p) => p.id === s.activeProfileId) ?? s.profiles[0]
  );
  const promptTemplate = useStore((s) => s.promptTemplate);
  const threads = useStore((s) => s.threads);
  const [open, setOpen] = useState(false);

  const meta = useMemo(() => {
    if (!project || !chapter) return null;
    const foreshadows = threads
      .filter((t) => t.status === "open")
      .slice(0, 8)
      .map((t) => (t.detail.trim() ? `${t.title}：${t.detail.trim()}` : t.title));
    const built = buildMessages({
      project,
      chapters,
      entities,
      chapter,
      content,
      kind: "continue",
      contextWindow: profile?.contextWindow,
      promptTemplate,
      maxTokens: profile?.maxTokens,
      foreshadows,
    });
    return built.meta;
  }, [project, chapter, chapters, entities, content, profile, promptTemplate, threads]);

  if (!meta) return null;

  return (
    <div className="rounded-xl border border-line/60 bg-surface2/25">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-gold/70" />
        <span className="text-[10.5px] text-dim">
          上下文约 <span className="tabular-nums text-ink/85">{(meta.tokens / 1000).toFixed(1)}k</span> tokens
        </span>
        <span className="flex-1" />
        <ChevronDown
          size={11}
          className={cx("text-mute transition-transform", open && "rotate-180")}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 border-t border-line/50 px-3 py-2.5 text-[10.5px] text-mute">
              <div className="flex justify-between">
                <span>设定卡注入</span>
                <span className="text-dim">{meta.entityCount} 条</span>
              </div>
              <div className="flex justify-between">
                <span>前情提要</span>
                <span className={meta.summaryCount ? "text-gold/80" : "text-mute/60"}>
                  {meta.summaryCount ? `${meta.summaryCount} 章摘要` : "未填写摘要"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>正文节选</span>
                <span className="text-dim">{meta.tailChars} 字</span>
              </div>
              {meta.outlineChars > 0 ? (
                <div className="flex justify-between">
                  <span>本章章纲</span>
                  <span className="text-gold/80">{meta.outlineChars} 字</span>
                </div>
              ) : null}
              {meta.retrievedCount > 0 ? (
                <div className="flex justify-between">
                  <span>旧文召回</span>
                  <span className="text-gold/80">{meta.retrievedCount} 段</span>
                </div>
              ) : content.length > 200 ? (
                <div className="flex justify-between">
                  <span>旧文召回</span>
                  <span className="text-dim">生成时自动检索</span>
                </div>
              ) : null}
              {meta.foreshadowCount > 0 ? (
                <div className="flex justify-between">
                  <span>待回收伏笔</span>
                  <span className="text-gold/80">{meta.foreshadowCount} 条</span>
                </div>
              ) : null}
              {meta.voiceCount > 0 ? (
                <div className="flex justify-between">
                  <span>角色语气</span>
                  <span className="text-gold/80">{meta.voiceCount} 人</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span>上下文窗口</span>
                <span className="text-dim">{Math.round(meta.contextWindow / 1000)}k tokens</span>
              </div>
              <div className="flex justify-between">
                <span>提示词总量</span>
                <span className={meta.trimmed ? "text-cinnabar/80" : "text-dim"}>
                  {meta.chars} 字符{meta.trimmed ? "（已裁剪）" : ""}
                </span>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default function AIPanel() {
  const gen = useStore((s) => s.gen);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const runAI = useStore((s) => s.runAI);
  const cancelAI = useStore((s) => s.cancelAI);
  const acceptAI = useStore((s) => s.acceptAI);
  const discardAI = useStore((s) => s.discardAI);
  const selection = useStore((s) => s.selection);
  const profile = useStore((s) =>
    s.profiles.find((p) => p.id === s.activeProfileId) ?? s.profiles[0]
  );
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const [instruction, setInstruction] = useState("");
  const [view, setView] = useState<"result" | "diff">("result");
  const [showReasoning, setShowReasoning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const human = useMemo(() => {
    if (!gen || gen.text.trim().length < 60) return null;
    if (gen.status === "streaming") return null;
    return analyzeHuman(gen.text);
  }, [gen]);

  useEffect(() => {
    if (gen?.status === "streaming" && scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [gen?.text, gen?.status, gen?.reasoning]);

  useEffect(() => {
    setView("result");
    setShowReasoning(false);
  }, [gen?.id]);

  const streaming = gen?.status === "streaming";
  const metaReply = Boolean(gen && !streaming && looksLikeMeta(gen.text));
  const hasSelection = Boolean(selection?.text.trim());
  const meta = gen ? KIND_META[gen.kind] : null;
  const multi = useStore((s) => s.multi);
  const runAIMulti = useStore((s) => s.runAIMulti);
  const acceptCandidate = useStore((s) => s.acceptCandidate);
  const cancelMulti = useStore((s) => s.cancelMulti);
  const applyGenerated = useStore((s) => s.applyGenerated);
  const [paraMode, setParaMode] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);

  const paragraphs = gen && gen.status === "done" ? gen.text.split(/\n{2,}/).filter((p) => p.trim()) : [];

  useEffect(() => {
    setParaMode(false);
    setPicked([]);
  }, [gen?.id]);

  const togglePara = (i: number) =>
    setPicked((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));

  const actions: { kind: GenKind; label: string; hint: string; icon: typeof PenLine; disabled?: boolean }[] = [
    { kind: "continue", label: "续写本章", hint: "接住最后一句", icon: PenLine },
    { kind: "rewrite", label: "润色选中", hint: hasSelection ? "保留情节" : "先选中一段", icon: Wand2, disabled: !hasSelection },
    { kind: "outline", label: "推演章纲", hint: "接下来五章", icon: ListTree },
    { kind: "custom", label: "自由指令", hint: "你说怎么改", icon: Sparkles },
  ];

  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}
      className="relative z-20 flex w-[388px] shrink-0 flex-col border-l border-line/60 bg-surface/30"
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line/50 px-4">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gold/12">
          <Sparkles size={11} className="text-gold" />
        </span>
        <span className="text-[12px] tracking-wide text-ink/90">AI 创作台</span>
        <span className="rounded-full border border-line/70 px-1.5 py-[1px] text-[9px] text-mute">
          {profile ? profile.model : "未配置"}
        </span>
        <div className="flex-1" />
        <IconButton onClick={() => setAiOpen(false)} title="收起面板">
          <X size={13} />
        </IconButton>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto p-3.5">
        <div className="grid grid-cols-2 gap-2">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <motion.button
                key={a.kind}
                whileTap={{ scale: 0.975 }}
                disabled={a.disabled || streaming}
                onClick={() => void runAI(a.kind, a.kind === "custom" ? instruction : undefined)}
                className={cx(
                  "group relative overflow-hidden rounded-xl border border-line/70 bg-gradient-to-br from-surface2/60 to-transparent p-2.5 text-left transition-colors",
                  a.disabled || streaming
                    ? "cursor-not-allowed opacity-45"
                    : "hover:border-gold/40 hover:from-gold/[0.07]"
                )}
              >
                <Icon size={13} className="mb-1.5 text-gold/80" />
                <div className="text-[11.5px] text-ink/90">{a.label}</div>
                <div className="mt-0.5 text-[9.5px] text-mute">{a.hint}</div>
              </motion.button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => void runAIMulti("continue", instruction || undefined)}
            disabled={streaming || Boolean(multi)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-line/80 py-1.5 text-[10.5px] text-mute transition-colors hover:border-gold/40 hover:text-gold disabled:opacity-40"
          >
            <Layers size={11} /> 三版同写，挑一版
          </button>
        </div>

        <div className="relative mt-2.5">
          <TextArea
            rows={2}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (instruction.trim() && !streaming) void runAI("custom", instruction);
              }
            }}
            placeholder="自定义要求，例如：用一段景物描写收尾，克制一点"
            className="pr-11 text-[12px] leading-[1.7]"
          />
          <button
            onClick={() => {
              if (instruction.trim() && !streaming) void runAI("custom", instruction);
            }}
            disabled={!instruction.trim() || streaming}
            className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-lg bg-gold text-[#1a1408] transition-opacity disabled:opacity-30"
            title="生成 (Ctrl + Enter)"
          >
            <ArrowUp size={12} />
          </button>
        </div>

        <div className="mt-3">
          <ContextMeter />
        </div>

        <AnimatePresence mode="wait">
          {multi ? (
            <motion.div
              key="multi"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              className="mt-3 overflow-hidden rounded-2xl border border-line/80 bg-surface/70"
            >
              <div className="flex items-center gap-2 border-b border-line/60 px-3 py-2">
                <Layers size={11} className="text-gold/80" />
                <span className="text-[10.5px] text-dim">多候选 · {multi.items.length} 版</span>
                {multi.judging ? (
                  <span className="flex items-center gap-1 text-[9.5px] text-gold/75">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-gold" /> 评估中
                  </span>
                ) : multi.recommended != null ? (
                  <span className="rounded-full bg-gold/12 px-1.5 py-0.5 text-[9px] text-gold">
                    推荐第 {multi.recommended + 1} 版
                  </span>
                ) : null}
                <span className="flex-1" />
                <button
                  onClick={cancelMulti}
                  className="text-[10px] text-mute transition-colors hover:text-cinnabar"
                >
                  全部丢弃
                </button>
              </div>
              <div className="scroll-thin max-h-[48vh] space-y-2 overflow-y-auto p-2">
                {multi.items.map((item, i) => (
                  <div
                    key={item.id}
                    className={cx(
                      "rounded-xl border p-2.5 transition-colors",
                      i === multi.recommended
                        ? "border-gold/50 bg-gold/6"
                        : "border-line/60 bg-surface2/25"
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-[9.5px] text-mute">第 {i + 1} 版</span>
                      {i === multi.recommended ? (
                        <span className="rounded-full bg-gold/15 px-1.5 text-[9px] text-gold">
                          推荐
                        </span>
                      ) : null}
                      {item.status === "streaming" ? (
                        <span className="flex items-center gap-1 text-[9.5px] text-gold/70">
                          <span className="h-1 w-1 animate-pulse rounded-full bg-gold" /> 写
                        </span>
                      ) : item.status === "error" ? (
                        <span className="text-[9.5px] text-cinnabar">失败</span>
                      ) : (
                        <span className="text-[9.5px] text-gold/60">完成</span>
                      )}
                      {multi.scores?.[i] ? (
                        <span className="text-[9px] tabular-nums text-mute">
                          {multi.scores[i]} 分
                        </span>
                      ) : null}
                      <span className="flex-1" />
                      <Button
                        size="xs"
                        variant="primary"
                        disabled={item.status !== "done"}
                        onClick={() => void acceptCandidate(i)}
                      >
                        <Check size={10} /> 采用
                      </Button>
                    </div>
                    {i === multi.recommended && multi.reason ? (
                      <p className="mb-1.5 text-[9.5px] leading-relaxed text-gold/75">
                        编辑视角：{multi.reason}
                      </p>
                    ) : null}
                    <p className="scroll-thin max-h-[130px] overflow-y-auto whitespace-pre-wrap font-serif text-[11.5px] leading-[1.9] text-ink/85">
                      {item.text}
                      {item.status === "streaming" ? <span className="caret-blink" /> : null}
                      {item.error ? (
                        <span className="text-cinnabar">{item.error}</span>
                      ) : null}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : gen ? (
            <motion.div
              key={gen.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              className={cx(
                "mt-3 overflow-hidden rounded-2xl border bg-surface/70 transition-colors",
                streaming ? "border-gold/35" : "border-line/80"
              )}
              style={
                streaming
                  ? { boxShadow: "0 0 0 1px rgba(217,168,95,0.08), 0 18px 50px -28px rgba(217,168,95,0.55)" }
                  : undefined
              }
            >
              <div className="flex items-center gap-2 border-b border-line/60 px-3 py-2">
                {meta ? <meta.icon size={11} className="text-gold/80" /> : null}
                <span className="text-[10.5px] text-dim">
                  {meta?.label}
                  {gen.kind === "rewrite" && gen.selection
                    ? ` · ${gen.selection.text.replace(/\s/g, "").length} 字`
                    : ""}
                </span>
                <span className="flex-1" />
                {streaming ? (
                  <span className="flex items-center gap-1.5 text-[10px] text-gold/80">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-gold" />
                    正在写
                  </span>
                ) : gen.status === "error" ? (
                  <span className="text-[10px] text-cinnabar">出错</span>
                ) : gen.status === "stopped" ? (
                  <span className="text-[10px] text-gold/70">已停止（部分）</span>
                ) : (
                  <span className="text-[10px] text-mute">{gen.profileName}</span>
                )}
                {human ? (
                  <span
                    title={human.notes.join("\n") || "读起来比较自然"}
                    className={cx(
                      "rounded-full border px-1.5 py-0.5 text-[9.5px] tabular-nums",
                      human.score >= 80
                        ? "border-emerald-400/30 text-emerald-300/90"
                        : human.score >= 60
                          ? "border-gold/30 text-gold/90"
                          : "border-cinnabar/30 text-cinnabar/90"
                    )}
                  >
                    人味 {human.score}
                  </span>
                ) : null}
              </div>
              {metaReply ? (
                <div className="border-b border-cinnabar/25 bg-cinnabar/8 px-3 py-2 text-[10px] leading-relaxed text-cinnabar/90">
                  这版像说明文字，不是正文。多半是本章还没有开头，或系统提示词里带了「发给 AI」的使用说明。
                  补一句场景，或把设定放进设定卡后再试。
                </div>
              ) : null}
              {human && !streaming && human.notes.length > 0 ? (
                <div className="border-b border-line/40 bg-surface2/30 px-3 py-1.5 text-[10px] leading-relaxed text-mute">
                  {human.notes[0]}
                </div>
              ) : null}

              {gen.kind === "rewrite" && gen.selection && !streaming ? (
                <div className="flex gap-1 border-b border-line/50 px-2 py-1.5">
                  {[
                    { key: "diff" as const, label: "对比修改" },
                    { key: "result" as const, label: "结果" },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setView(t.key)}
                      className={cx(
                        "rounded-md px-2 py-1 text-[10px] transition-colors",
                        view === t.key
                          ? "bg-surface2 text-ink"
                          : "text-mute hover:text-dim"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              ) : null}

              <div
                ref={scrollRef}
                className="scroll-thin max-h-[42vh] overflow-y-auto px-3.5 py-3"
              >
                {gen.reasoning ? (
                  <div className="mb-2 overflow-hidden rounded-lg border border-line/60 bg-surface2/25">
                    <button
                      onClick={() => setShowReasoning((v) => !v)}
                      className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-mute transition-colors hover:text-dim"
                    >
                      <Brain size={10} />
                      {streaming && !gen.text
                        ? "正在思考…"
                        : `思考过程 · ${gen.reasoning.length} 字`}
                      <ChevronDown
                        size={10}
                        className={cx(
                          "ml-auto transition-transform",
                          showReasoning && "rotate-180"
                        )}
                      />
                    </button>
                    {showReasoning || (streaming && !gen.text) ? (
                      <p className="scroll-thin max-h-[160px] overflow-y-auto whitespace-pre-wrap border-t border-line/50 px-2.5 py-2 text-[10.5px] leading-[1.7] text-mute/90">
                        {gen.reasoning}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {gen.status === "error" ? (
                  <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-cinnabar/90">
                    {gen.error}
                  </p>
                ) : gen.kind === "rewrite" && gen.selection && view === "diff" && !streaming ? (
                  <DiffView original={gen.selection.text} revised={gen.text} />
                ) : paraMode && paragraphs.length ? (
                  <div className="space-y-1.5">
                    {paragraphs.map((para, i) => {
                      const on = picked.includes(i);
                      return (
                        <label
                          key={i}
                          className={cx(
                            "flex cursor-pointer gap-2 rounded-lg border px-2 py-1.5 transition-colors",
                            on ? "border-gold/40 bg-gold/[0.06]" : "border-line/60"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => togglePara(i)}
                            className="mt-1 h-3 w-3 shrink-0 accent-[var(--c-gold)]"
                          />
                          <span className="whitespace-pre-wrap font-serif text-[12.5px] leading-[1.9] text-ink/85">
                            {para}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap font-serif text-[13.5px] leading-[1.95] text-ink/90">
                    {gen.text}
                    {streaming ? <span className="caret-blink" /> : null}
                  </p>
                )}
                {!gen.text && streaming ? (
                  <div className="flex items-center gap-2 py-6 text-[11px] text-mute">
                    <span className="shimmer h-[3px] w-10 rounded-full" />
                    正在组织语言…
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-1.5 border-t border-line/60 bg-surface2/30 px-2.5 py-2">
                {streaming ? (
                  <Button variant="ghost" size="xs" onClick={() => void cancelAI()}>
                    <Square size={10} /> 停止
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={() => {
                        if (paraMode && paragraphs.length) {
                          const text = paragraphs
                            .filter((_, i) => picked.includes(i))
                            .join("\n\n");
                          if (!text.trim()) return;
                          void applyGenerated(text, {
                            anchor: gen.anchor,
                            reason: "AI 分段采纳前",
                          }).then(() =>
                            useStore.setState((s) =>
                              s.gen ? { gen: { ...s.gen, applied: true } } : {}
                            )
                          );
                          return;
                        }
                        void acceptAI();
                      }}
                      disabled={
                        (gen.status !== "done" && gen.status !== "stopped") ||
                        gen.applied ||
                        (paraMode && picked.length === 0)
                      }
                    >
                      <Check size={11} />
                      {paraMode
                        ? `插入所选 ${picked.length}`
                        : gen.kind === "outline"
                          ? "复制章纲"
                          : gen.kind === "rewrite"
                            ? "替换原文"
                            : "插入正文"}
                    </Button>
                    {(gen.kind === "continue" || gen.kind === "custom") &&
                    gen.status === "done" ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          const next = !paraMode;
                          setParaMode(next);
                          if (next) setPicked(paragraphs.map((_, i) => i));
                        }}
                        title="按段落挑选要采纳的部分"
                      >
                        <Rows size={10} /> 按段
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => void runAI(gen.kind, gen.instruction)}
                      disabled={gen.status === "streaming"}
                      title="用同样要求再生成一次"
                    >
                      <RefreshCw size={10} /> 重写
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        void navigator.clipboard.writeText(gen.text);
                      }}
                    >
                      <Copy size={10} />
                    </Button>
                    <div className="flex-1" />
                    <Button variant="ghost" size="xs" onClick={discardAI}>
                      丢弃
                    </Button>
                  </>
                )}
              </div>

              {gen.applied ? (
                <div className="flex items-center gap-1.5 border-t border-gold/20 bg-gold/[0.06] px-3 py-1.5 text-[10px] text-gold/80">
                  <Check size={10} /> 已应用到正文
                </div>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-6 flex flex-col items-center px-6 text-center"
            >
              <div className="relative mb-3 flex h-11 w-11 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-gold/10 blur-lg" />
                <Feather size={17} className="relative text-gold/70" />
              </div>
              <p className="text-[11.5px] leading-relaxed text-mute">
                AI 会读取你的设定、前情摘要与最近正文
                <br />
                光标停在结尾，点「续写本章」即可
              </p>
              <div className="mt-4 flex items-center gap-1.5 rounded-full border border-line/70 px-2.5 py-1 text-[9.5px] text-mute/80">
                <CornerDownLeft size={9} /> Ctrl + Enter 续写
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-line/50 px-3.5 py-2">
        <span
          className={cx(
            "h-1.5 w-1.5 rounded-full",
            profile?.hasKey ? "bg-emerald-400/80" : "bg-cinnabar/70"
          )}
        />
        <span className="text-[10px] text-mute">
          {profile
            ? profile.hasKey
              ? `${profile.model} · temp ${profile.temperature.toFixed(2)}`
              : "缺少 API Key"
            : "未配置模型"}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setSettingsOpen(true)}
          className="text-[10px] text-mute transition-colors hover:text-gold"
        >
          配置
        </button>
      </div>
    </motion.aside>
  );
}
