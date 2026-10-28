import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Cpu,
  Feather,
  Keyboard,
  ListTree,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { VOICE_PRESETS } from "@/lib/ai";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/format";

const STEPS = ["欢迎", "文风", "模型", "写作闭环", "开始"] as const;

const slide = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? 56 : -56,
    filter: "blur(6px)",
  }),
  center: {
    opacity: 1,
    x: 0,
    filter: "blur(0px)",
    transition: { type: "spring" as const, stiffness: 320, damping: 30 },
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? -44 : 44,
    filter: "blur(6px)",
    transition: { duration: 0.18 },
  }),
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 26 },
  },
};

export default function Onboarding() {
  const open = useStore((s) => s.onboardingOpen);
  const finish = useStore((s) => s.finishOnboarding);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const profiles = useStore((s) => s.profiles);
  const activeProfileId = useStore((s) => s.activeProfileId);
  const updateProject = useStore((s) => s.updateProject);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const reduce = useReducedMotion();
  const primaryRef = useRef<HTMLButtonElement>(null);

  const profile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? profiles[0],
    [profiles, activeProfileId]
  );
  const ready = Boolean(profile?.hasKey);
  const last = step === STEPS.length - 1;

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDir(1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen) return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (last) void finish();
        else {
          setDir(1);
          setStep((s) => Math.min(STEPS.length - 1, s + 1));
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setDir(-1);
        setStep((s) => Math.max(0, s - 1));
      } else if (e.key === "Escape") {
        e.preventDefault();
        void finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, last, finish, settingsOpen]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => primaryRef.current?.focus(), 420);
    return () => clearTimeout(t);
  }, [open, step]);

  if (!open) return null;

  const next = () => {
    if (last) void finish();
    else {
      setDir(1);
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
    }
  };
  const prev = () => {
    setDir(-1);
    setStep((s) => Math.max(0, s - 1));
  };

  return (
    <div className="fixed inset-0 z-[45] flex items-center justify-center p-5">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-[#0a0907]/82 backdrop-blur-[10px]"
        onClick={() => void finish()}
      />

      {!reduce ? (
        <>
          <motion.div
            className="pointer-events-none absolute -left-32 -top-40 h-[520px] w-[520px] rounded-full bg-gold/10 blur-[110px]"
            animate={{ scale: [1, 1.16, 1], opacity: [0.55, 0.9, 0.55] }}
            transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="pointer-events-none absolute -bottom-48 -right-24 h-[560px] w-[560px] rounded-full bg-[#6b4b2a]/15 blur-[120px]"
            animate={{ scale: [1.1, 1, 1.1], opacity: [0.35, 0.6, 0.35] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      ) : null}

      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.965 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 26 }}
        className="relative z-10 w-full max-w-[780px] overflow-hidden rounded-[28px] border border-gold/18 bg-[linear-gradient(160deg,rgba(30,26,21,0.98),rgba(18,16,13,0.98))] shadow-[0_50px_120px_-40px_rgba(0,0,0,0.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

        <div className="flex items-center gap-3 px-7 pb-2 pt-5">
          <motion.span
            initial={{ rotate: -8, scale: 0.9, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-gold/25 bg-gold/10 font-serif text-[15px] text-gold"
          >
            墨
          </motion.span>
          <div className="min-w-0">
            <div className="text-[12px] text-ink">墨隐 · 新手引导</div>
            <div className="text-[9.5px] tracking-[0.18em] text-mute">MOYIN STUDIO</div>
          </div>
          <span className="flex-1" />
          <button
            onClick={() => void finish()}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] text-mute transition-colors hover:bg-surface2/70 hover:text-dim"
          >
            跳过 <X size={11} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-7 pb-4">
          {STEPS.map((label, i) => (
            <button
              key={label}
              onClick={() => {
                setDir(i > step ? 1 : -1);
                setStep(i);
              }}
              className="group flex items-center gap-1"
              title={label}
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className={cx(
                  "h-[3px] rounded-full",
                  i === step
                    ? "w-8 bg-gold"
                    : i < step
                      ? "w-4 bg-gold/40"
                      : "w-4 bg-line/80 group-hover:bg-line"
                )}
              />
            </button>
          ))}
          <span className="ml-auto text-[9.5px] tabular-nums text-mute">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        <div className="relative min-h-[392px] px-7 pb-2">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              className="h-full"
            >
              {step === 0 ? (
                <motion.div variants={stagger} initial="hidden" animate="show" className="pt-2">
                  <motion.div variants={fadeUp} className="relative mx-auto mb-7 w-fit">
                    <div className="absolute inset-[-16px] rounded-full border border-gold/10" />
                    <motion.div
                      className="absolute inset-[-16px] rounded-full border border-transparent border-t-gold/55"
                      animate={reduce ? {} : { rotate: 360 }}
                      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    />
                    <div className="relative flex h-[86px] w-[86px] items-center justify-center rounded-[26px] border border-gold/30 bg-[#14110d] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                      <span className="font-serif text-[40px] leading-none text-gold">墨</span>
                    </div>
                  </motion.div>
                  <motion.h1
                    variants={fadeUp}
                    className="text-center font-serif text-[28px] font-medium tracking-wide text-ink"
                  >
                    先花 30 秒，把工具调成你的样子
                  </motion.h1>
                  <motion.p
                    variants={fadeUp}
                    className="mx-auto mt-3 max-w-[500px] text-center text-[12px] leading-[1.9] text-dim"
                  >
                    本地写作台 + 任意 OpenAI 兼容模型。设定、章纲、伏笔会被分层拼进上下文，
                    让长篇写到三十章人物也不走形。
                  </motion.p>
                  <motion.div
                    variants={fadeUp}
                    className="mt-7 flex flex-wrap items-center justify-center gap-2"
                  >
                    {[
                      { icon: Sparkles, text: "本地优先，不经过服务器" },
                      { icon: Cpu, text: "DeepSeek / OpenAI / Ollama" },
                      { icon: BookOpen, text: "长篇记忆与伏笔台账" },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <span
                          key={item.text}
                          className="flex items-center gap-1.5 rounded-full border border-line/70 bg-surface2/30 px-3 py-1.5 text-[10.5px] text-dim"
                        >
                          <Icon size={11} className="text-gold/80" />
                          {item.text}
                        </span>
                      );
                    })}
                  </motion.div>
                </motion.div>
              ) : null}

              {step === 1 ? (
                <motion.div variants={stagger} initial="hidden" animate="show">
                  <motion.div variants={fadeUp}>
                    <div className="text-[11px] tracking-[0.22em] text-gold/70">STEP 01</div>
                    <h2 className="mt-1.5 font-serif text-[24px] text-ink">你写哪一种故事？</h2>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-mute">
                      选一个文风预设，它的写作细则会直接进入提示词。之后可以随时改。
                    </p>
                  </motion.div>
                  <motion.div variants={fadeUp} className="mt-5 grid grid-cols-2 gap-2.5">
                    {Object.values(VOICE_PRESETS).map((preset) => {
                      const active = project?.voice === preset.id;
                      return (
                        <motion.button
                          key={preset.id}
                          layout
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => {
                            if (project) void updateProject({ voice: preset.id });
                          }}
                          className={cx(
                            "relative overflow-hidden rounded-2xl border p-3.5 text-left transition-colors",
                            active
                              ? "border-gold/45 bg-gold/8"
                              : "border-line/70 bg-surface2/20 hover:border-gold/30"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className={cx("text-[13px]", active ? "text-gold" : "text-dim")}>
                              {preset.label}
                            </span>
                            {active ? (
                              <motion.span
                                layoutId="voice-check"
                                className="flex h-4 w-4 items-center justify-center rounded-full bg-gold/20"
                              >
                                <Check size={9} className="text-gold" />
                              </motion.span>
                            ) : null}
                          </div>
                          <div className="mt-1 text-[9.5px] leading-snug text-mute">
                            {preset.hint}
                          </div>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                  <motion.p variants={fadeUp} className="mt-3 text-[9.5px] text-mute">
                    轻小说：对话优先、短句、单句成段、去套语。不知道选什么就先选它。
                  </motion.p>
                </motion.div>
              ) : null}

              {step === 2 ? (
                <motion.div variants={stagger} initial="hidden" animate="show">
                  <motion.div variants={fadeUp}>
                    <div className="text-[11px] tracking-[0.22em] text-gold/70">STEP 02</div>
                    <h2 className="mt-1.5 font-serif text-[24px] text-ink">接上你的模型</h2>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-mute">
                      填 Base URL、模型名和 API Key 就能用。Key 用 Windows DPAPI 加密，只存在本机。
                    </p>
                  </motion.div>

                  <motion.div
                    variants={fadeUp}
                    className={cx(
                      "mt-5 rounded-2xl border p-4",
                      ready ? "border-emerald-400/25 bg-emerald-400/5" : "border-line/70 bg-surface2/20"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cx(
                          "flex h-9 w-9 items-center justify-center rounded-xl",
                          ready ? "bg-emerald-400/12" : "bg-gold/10"
                        )}
                      >
                        {ready ? (
                          <Check size={16} className="text-emerald-300" />
                        ) : (
                          <Cpu size={16} className="text-gold/80" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] text-ink">
                          {ready
                            ? `已配置：${profile?.name}`
                            : profile
                              ? "还没有填写 API Key"
                              : "还没有模型配置"}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-mute">
                          {profile ? `${profile.model} · ${profile.baseUrl}` : "支持 DeepSeek、OpenAI、OpenRouter、SiliconFlow、Ollama"}
                        </div>
                      </div>
                      <button
                        onClick={() => setSettingsOpen(true)}
                        className="shrink-0 rounded-lg border border-gold/30 bg-gold/10 px-2.5 py-1.5 text-[10.5px] text-gold transition-colors hover:bg-gold/15"
                      >
                        {ready ? "修改" : "去配置"}
                      </button>
                    </div>
                  </motion.div>

                  <motion.div variants={fadeUp} className="mt-4 grid grid-cols-2 gap-2">
                    {[
                      ["DeepSeek", "api.deepseek.com"],
                      ["OpenRouter", "openrouter.ai/api/v1"],
                      ["Ollama", "127.0.0.1:11434/v1"],
                      ["SiliconFlow", "api.siliconflow.cn/v1"],
                    ].map(([name, url]) => (
                      <div
                        key={name}
                        className="rounded-xl border border-line/60 px-3 py-2 text-[10px] text-mute"
                      >
                        <span className="text-dim">{name}</span>
                        <span className="ml-1 font-mono text-[9px]">{url}</span>
                      </div>
                    ))}
                  </motion.div>
                </motion.div>
              ) : null}

              {step === 3 ? (
                <motion.div variants={stagger} initial="hidden" animate="show">
                  <motion.div variants={fadeUp}>
                    <div className="text-[11px] tracking-[0.22em] text-gold/70">STEP 03</div>
                    <h2 className="mt-1.5 font-serif text-[24px] text-ink">一本书是这样写出来的</h2>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-mute">
                      四步循环，AI 每次只拿到它该知道的那部分。
                    </p>
                  </motion.div>

                  <div className="mt-5 space-y-2">
                    {[
                      {
                        icon: Users,
                        title: "设定卡",
                        desc: "人物、地点、势力。按本章出场排序，不把无关设定塞进上下文。",
                      },
                      {
                        icon: ListTree,
                        title: "章纲",
                        desc: "这一章发生什么。AI 沿章纲写，不自己猜剧情。",
                      },
                      {
                        icon: Feather,
                        title: "续写 / 改写",
                        desc: "从光标处接着写；选中一段可润色、扩写、改成轻小说对白。",
                      },
                      {
                        icon: Check,
                        title: "采纳",
                        desc: "分段对比、按段采纳，替换前自动快照，随时能恢复。",
                      },
                    ].map((item, i) => {
                      const Icon = item.icon;
                      return (
                        <motion.div
                          key={item.title}
                          variants={fadeUp}
                          className="flex items-center gap-3 rounded-xl border border-line/60 bg-surface2/20 px-3 py-2.5"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-[10px] tabular-nums text-gold/80">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <Icon size={14} className="shrink-0 text-gold/70" />
                          <div className="min-w-0">
                            <div className="text-[11.5px] text-dim">{item.title}</div>
                            <div className="mt-0.5 text-[10px] leading-relaxed text-mute">{item.desc}</div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              ) : null}

              {step === 4 ? (
                <motion.div variants={stagger} initial="hidden" animate="show">
                  <motion.div variants={fadeUp} className="pt-1 text-center">
                    <motion.div
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 18 }}
                      className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/35 bg-gradient-to-br from-gold/25 to-gold/5 shadow-[0_18px_40px_-18px_rgba(217,168,95,0.55)]"
                    >
                      <Check size={22} className="text-gold" />
                    </motion.div>
                    <h2 className="font-serif text-[24px] text-ink">可以开始了</h2>
                    <p className="mx-auto mt-1.5 max-w-[440px] text-[11.5px] leading-relaxed text-mute">
                      示例书里已经有两章。把光标放到文末，按 Ctrl+Enter 让 AI 接着写。
                    </p>
                  </motion.div>

                  <motion.div variants={fadeUp} className="mt-6 grid grid-cols-2 gap-2">
                    {[
                      ["Ctrl + Enter", "从光标处续写"],
                      ["Ctrl + K", "命令面板"],
                      ["Ctrl + F", "全文搜索"],
                      ["Ctrl + J", "收起 AI 面板"],
                    ].map(([keys, label]) => (
                      <div
                        key={keys}
                        className="flex items-center gap-2.5 rounded-xl border border-line/60 bg-surface2/20 px-3 py-2"
                      >
                        <Keyboard size={13} className="text-gold/70" />
                        <span className="kbd">{keys}</span>
                        <span className="text-[10px] text-mute">{label}</span>
                      </div>
                    ))}
                  </motion.div>

                  <motion.div variants={fadeUp} className="mt-4 text-center text-[9.5px] text-mute">
                    右上角「设置 › 关于」里可以重新观看这段引导。
                  </motion.div>
                </motion.div>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 border-t border-line/60 px-7 py-4">
          <button
            onClick={prev}
            disabled={step === 0}
            className={cx(
              "flex items-center gap-1 rounded-xl px-3 py-2 text-[11px] transition-colors",
              step === 0 ? "text-mute/40" : "text-mute hover:bg-surface2/60 hover:text-dim"
            )}
          >
            <ArrowLeft size={12} /> 上一步
          </button>
          <span className="flex-1" />
          <span className="hidden text-[9.5px] text-mute/70 sm:block">
            ← → 切换 · Esc 跳过
          </span>
          <motion.button
            ref={primaryRef}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.985 }}
            onClick={next}
            className="flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-[11.5px] font-medium text-[#1a140c] shadow-[0_12px_30px_-12px_rgba(217,168,95,0.6)]"
          >
            {last ? "开始写作" : step === 0 ? "开始了解" : "下一步"}
            <ArrowRight size={12} />
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
