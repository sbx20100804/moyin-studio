import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  Cloud,
  Download,
  KeyRound,
  Loader2,
  Moon,
  Palette,
  PenLine,
  Plus,
  RefreshCw,
  Server,
  Sun,
  Trash2,
  Wifi,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { DEFAULT_SYSTEM_TEMPLATE, VOICE_PRESETS } from "@/lib/ai";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Profile, ProfileInput } from "@/lib/types";
import { Button, Field, IconButton, Modal, Slider, Switch, TextArea, TextInput } from "./ui";

type Tab = "model" | "writing" | "appearance" | "about";

const TABS: { key: Tab; label: string; icon: typeof Server }[] = [
  { key: "model", label: "模型", icon: Server },
  { key: "writing", label: "创作", icon: PenLine },
  { key: "appearance", label: "外观", icon: Palette },
  { key: "about", label: "关于", icon: Zap },
];

interface Form {
  id: number;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  isDefault: boolean;
}

const emptyForm = (isDefault: boolean): Form => ({
  id: 0,
  name: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  apiKey: "",
  temperature: 0.85,
  maxTokens: 2400,
  contextWindow: 32768,
  isDefault,
});

function friendlyError(err: unknown) {
  const raw = String(err);
  if (raw.includes("401")) {
    return "API Key 无效或格式不对。确认它以 sk- 开头，并且属于这个服务商。";
  }
  if (raw.includes("403")) {
    return "没有权限或额度不足。检查这个 Key 的权限与余额。";
  }
  if (raw.includes("404") && /model/i.test(raw)) {
    return "这个模型在该服务商不存在。先点「拉取列表」，从返回的模型里选一个。";
  }
  if (raw.includes("429")) {
    return "请求太频繁或额度用尽，稍后再试。";
  }
  if (raw.includes("timeout") || raw.includes("timed out")) {
    return "连接超时。检查接口地址与网络。";
  }
  return raw.length > 260 ? `${raw.slice(0, 260)}…` : raw;
}

export default function Settings() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettingsOpen);
  const profiles = useStore((s) => s.profiles);
  const activeProfileId = useStore((s) => s.activeProfileId);
  const saveProfile = useStore((s) => s.saveProfile);
  const removeProfile = useStore((s) => s.removeProfile);
  const makeDefault = useStore((s) => s.makeDefaultProfile);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const promptTemplate = useStore((s) => s.promptTemplate);
  const savePromptTemplate = useStore((s) => s.setPromptTemplate);
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const updateProject = useStore((s) => s.updateProject);
  const toast = useStore((s) => s.toast);

  const [tab, setTab] = useState<Tab>("model");
  const [templateDraft, setTemplateDraft] = useState("");
  const [sampleDraft, setSampleDraft] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(emptyForm(true));
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [version, setVersion] = useState("0.3.1");
  const hydrated = useRef<number>(-2);
  const modelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!modelOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!modelRef.current?.contains(e.target as Node)) setModelOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [modelOpen]);

  useEffect(() => {
    if (!open) {
      hydrated.current = -2;
      setTestResult(null);
      setModels([]);
      return;
    }
    setTemplateDraft(promptTemplate || DEFAULT_SYSTEM_TEMPLATE);
  }, [open, promptTemplate]);

  useEffect(() => {
    if (!open) return;
    setSampleDraft(project?.styleSample ?? "");
  }, [open, project?.id, project?.styleSample]);

  useEffect(() => {
    if (!open) {
      hydrated.current = -2;
      setTestResult(null);
      setModels([]);
      return;
    }
    const target =
      profiles.find((p) => p.id === selectedId) ??
      profiles.find((p) => p.id === activeProfileId) ??
      profiles.find((p) => p.isDefault) ??
      profiles[0];
    // -3 means the user just clicked "新增": keep the empty form.
    if (hydrated.current === -3) return;
    if (target && hydrated.current !== target.id) {
      hydrated.current = target.id;
      setSelectedId(target.id);
      setForm({
        id: target.id,
        name: target.name,
        baseUrl: target.baseUrl,
        model: target.model,
        apiKey: "",
        temperature: target.temperature,
        maxTokens: target.maxTokens,
        contextWindow: target.contextWindow || 32768,
        isDefault: target.isDefault,
      });
    }
  }, [open, profiles, selectedId, activeProfileId]);

  const current: Profile | undefined = profiles.find((p) => p.id === form.id);

  const startNew = () => {
    hydrated.current = -3;
    setSelectedId(null);
    setForm(emptyForm(profiles.length === 0));
    setTestResult(null);
    setModels([]);
    setModelOpen(false);
  };

  const save = async () => {
    if (!form.name.trim() || !form.baseUrl.trim() || !form.model.trim()) {
      toast("名称、接口地址与模型名都不能为空", "error");
      return;
    }
    setSaving(true);
    const saved = await saveProfile({
      id: form.id,
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim(),
      model: form.model.trim(),
      temperature: form.temperature,
      maxTokens: form.maxTokens,
      contextWindow: form.contextWindow,
      isDefault: form.isDefault,
      apiKey: form.apiKey.trim() ? form.apiKey.trim() : undefined,
    });
    setSaving(false);
    if (saved) {
      hydrated.current = saved.id;
      setSelectedId(saved.id);
      setForm((f) => ({ ...f, id: saved.id, apiKey: "" }));
      setTestResult(null);
    }
  };

  const formInput = (): ProfileInput => ({
    id: form.id,
    name: form.name.trim(),
    baseUrl: form.baseUrl.trim(),
    model: form.model.trim(),
    temperature: form.temperature,
    maxTokens: form.maxTokens,
    contextWindow: form.contextWindow,
    isDefault: form.isDefault,
    apiKey: form.apiKey.trim() ? form.apiKey.trim() : undefined,
  });

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const reply = await api.testConfig(formInput());
      setTestResult({ ok: true, text: reply });
    } catch (err) {
      setTestResult({ ok: false, text: friendlyError(err) });
    } finally {
      setTesting(false);
    }
  };

  const fetchModels = async () => {
    if (!form.baseUrl.trim()) {
      toast("先填写接口地址", "error");
      return;
    }
    setFetching(true);
    try {
      const list = await api.listModelsConfig(formInput());
      setModels(list);
      if (list.length) {
        setModelOpen(true);
        toast(`找到 ${list.length} 个模型，点右侧箭头选择`, "success");
      } else {
        toast("服务没有返回模型列表", "error");
      }
    } catch (err) {
      toast(friendlyError(err), "error");
    } finally {
      setFetching(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="设置"
      subtitle="所有数据保存在本机，API Key 使用 Windows 凭据加密"
      width="880px"
      footer={
        <>
          <span className="mr-auto text-[10px] text-mute">v{version} · 本地单机</span>
          <Button variant="primary" onClick={() => setOpen(false)}>
            完成
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[150px_1fr] gap-5">
        <div className="space-y-0.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cx(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] transition-colors",
                  on
                    ? "bg-gold/10 text-gold"
                    : "text-dim hover:bg-surface2/70 hover:text-ink"
                )}
              >
                <Icon size={12} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-[420px]">
          {tab === "model" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5">
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      hydrated.current = -1;
                      setSelectedId(p.id);
                    }}
                    className={cx(
                      "group flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors",
                      form.id === p.id
                        ? "border-gold/45 bg-gold/10 text-ink"
                        : "border-line/70 text-dim hover:border-line"
                    )}
                  >
                    {p.isDefault ? <span className="h-1 w-1 rounded-full bg-gold" /> : null}
                    {p.name}
                  </button>
                ))}
                <button
                  onClick={startNew}
                  className="flex items-center gap-1 rounded-lg border border-dashed border-line/80 px-2.5 py-1.5 text-[11px] text-mute transition-colors hover:border-gold/40 hover:text-gold"
                >
                  <Plus size={11} /> 新增
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="配置名称">
                  <TextInput
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="DeepSeek / 本地 Ollama"
                  />
                </Field>
                <Field label="接口地址 (Base URL)" hint="兼容 OpenAI 格式">
                  <TextInput
                    value={form.baseUrl}
                    onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                    placeholder="https://api.deepseek.com"
                  />
                </Field>
              </div>

              <Field
                label="API Key"
                hint={
                  current?.hasKey ? (
                    <button
                      onClick={async () => {
                        await saveProfile({
                          id: form.id,
                          name: form.name,
                          baseUrl: form.baseUrl,
                          model: form.model,
                          temperature: form.temperature,
                          maxTokens: form.maxTokens,
                          contextWindow: form.contextWindow,
                          isDefault: form.isDefault,
                          apiKey: "",
                        });
                        toast("已清除保存的密钥");
                      }}
                      className="transition-colors hover:text-cinnabar"
                    >
                      已加密保存 · 清除
                    </button>
                  ) : (
                    "仅保存在本机"
                  )
                }
              >
                <div className="relative">
                  <KeyRound size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
                  <TextInput
                    type="password"
                    value={form.apiKey}
                    onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                    placeholder={current?.hasKey ? "留空则保留原有密钥" : "sk-..."}
                    className="pl-8 font-mono text-[12px]"
                  />
                </div>
              </Field>

              <Field
                label="模型"
                hint={
                  <button
                    onClick={() => void fetchModels()}
                    className="flex items-center gap-1 transition-colors hover:text-gold"
                  >
                    {fetching ? <Loader2 size={9} className="animate-spin" /> : <RefreshCw size={9} />}
                    拉取列表
                  </button>
                }
              >
                <div className="relative" ref={modelRef}>
                  <TextInput
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    onFocus={() => {
                      if (models.length) setModelOpen(true);
                    }}
                    placeholder="deepseek-chat"
                    className="pr-9 font-mono text-[12px]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!models.length) {
                        void fetchModels();
                        return;
                      }
                      setModelOpen((v) => !v);
                    }}
                    title={models.length ? "选择拉取到的模型" : "拉取模型列表"}
                    className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-mute transition-colors hover:bg-surface2 hover:text-gold"
                  >
                    <ChevronDown
                      size={14}
                      className={cx("transition-transform", modelOpen && "rotate-180")}
                    />
                  </button>
                  {modelOpen && models.length > 0 ? (
                    <div className="scroll-thin absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-panel)]">
                      {!models.includes(form.model) ? (
                        <button
                          type="button"
                          onClick={() => setModelOpen(false)}
                          className="mb-1 w-full rounded-lg px-2 py-1 text-left text-[10px] text-cinnabar/80 hover:bg-surface2"
                        >
                          当前模型不在列表里，建议从下面选一个
                        </button>
                      ) : null}
                      {models.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setForm({ ...form, model: m });
                            setModelOpen(false);
                          }}
                          className={cx(
                            "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left font-mono text-[11.5px] transition-colors",
                            m === form.model
                              ? "bg-gold/10 text-gold"
                              : "text-dim hover:bg-surface2"
                          )}
                        >
                          {m === form.model ? <Check size={10} /> : null}
                          <span className="truncate">{m}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-5 rounded-xl border border-line/60 bg-surface2/25 p-3.5">
                <div>
                  <div className="mb-2 flex items-center justify-between text-[11px]">
                    <span className="text-dim">采样温度</span>
                    <span className="tabular-nums text-gold/90">{form.temperature.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={form.temperature}
                    min={0}
                    max={1.5}
                    step={0.05}
                    onChange={(v) => setForm({ ...form, temperature: v })}
                  />
                  <div className="mt-1.5 flex justify-between text-[9.5px] text-mute">
                    <span>严谨</span>
                    <span>发散</span>
                  </div>
                </div>
                <Field label="单次最大输出 tokens" hint="约 1 token ≈ 1.6 个汉字">
                  <TextInput
                    type="number"
                    value={form.maxTokens}
                    onChange={(e) => setForm({ ...form, maxTokens: Number(e.target.value) })}
                  />
                </Field>
                <Field label="上下文窗口 tokens" hint="决定正文节选与摘要链的长度">
                  <TextInput
                    type="number"
                    value={form.contextWindow}
                    onChange={(e) => setForm({ ...form, contextWindow: Number(e.target.value) })}
                  />
                </Field>
                <div className="flex items-end pb-2 text-[10px] leading-relaxed text-mute">
                  8k 的本地模型填 8192，DeepSeek 填 64000 / 128000，GPT-4o 填 128000。
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-[11.5px] text-dim">
                  <Switch
                    checked={form.isDefault}
                    onChange={(v) => setForm({ ...form, isDefault: v })}
                  />
                  设为默认模型
                </div>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={() => void runTest()} loading={testing}>
                  <Wifi size={12} /> 测试连接
                </Button>
                <Button variant="primary" size="sm" onClick={() => void save()} loading={saving}>
                  <Check size={12} /> 保存
                </Button>
              </div>

              <AnimatePresence>
                {testResult ? (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={cx(
                      "flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed",
                      testResult.ok
                        ? "border-emerald-500/30 bg-emerald-500/8 text-emerald-300/90"
                        : "border-cinnabar/30 bg-cinnabar/8 text-cinnabar"
                    )}
                    style={
                      testResult.ok
                        ? { background: "rgba(52,211,153,0.07)", color: "rgb(110,231,183)" }
                        : { background: "rgba(194,84,60,0.08)" }
                    }
                  >
                    {testResult.ok ? <Wifi size={12} className="mt-0.5" /> : <Cloud size={12} className="mt-0.5" />}
                    <span className="flex-1 whitespace-pre-wrap">{testResult.text}</span>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {form.id ? (
                <div className="flex items-center gap-2 border-t border-line/60 pt-3">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void makeDefault(form.id)}
                    disabled={current?.isDefault}
                  >
                    <Check size={10} /> 设为默认
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={async () => {
                      await removeProfile(form.id);
                      hydrated.current = -1;
                      setSelectedId(null);
                      const rest = profiles.filter((p) => p.id !== form.id);
                      setForm(rest[0] ? emptyForm(false) : emptyForm(true));
                    }}
                  >
                    <Trash2 size={10} /> 删除此配置
                  </Button>
                </div>
              ) : null}

              <p className="text-[10px] leading-relaxed text-mute/80">
                兼容任何 OpenAI 格式服务：DeepSeek、OpenAI、OpenRouter、SiliconFlow、Ollama（
                http://127.0.0.1:11434/v1 ）、LM Studio 等。
              </p>
            </div>
          ) : null}

          {tab === "writing" ? (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11.5px] text-dim">文风预设</span>
                  <span className="text-[10px] text-mute">作用于当前作品</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {Object.values(VOICE_PRESETS).map((preset) => {
                    const active = project?.voice === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => project && void updateProject({ voice: preset.id })}
                        className={cx(
                          "rounded-xl border px-2 py-2 text-left transition-colors",
                          active
                            ? "border-gold/45 bg-gold/8"
                            : "border-line/70 hover:border-gold/30 hover:bg-surface2/50"
                        )}
                      >
                        <div
                          className={cx(
                            "text-[11.5px]",
                            active ? "text-gold" : "text-dim"
                          )}
                        >
                          {preset.label}
                        </div>
                        <div className="mt-0.5 text-[9px] leading-snug text-mute">
                          {preset.hint}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-mute">
                  预设会把「对话优先、短句、去套语」这类细则追加在系统提示词之后；
                  选「自定义」则只用下面的模板和你写的文风说明。
                </p>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11.5px] text-dim">语感样本（可选）</span>
                  <span className="text-[10px] text-mute">只学语气，不抄内容</span>
                </div>
                <TextArea
                  rows={5}
                  value={sampleDraft}
                  onChange={(e) => setSampleDraft(e.target.value)}
                  className="text-[11px] leading-[1.8]"
                  placeholder="粘贴一段你希望「读起来像这样」的文字，200-500 字即可。"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={async () => {
                      await updateProject({ styleSample: sampleDraft });
                      toast("语感样本已保存", "success");
                    }}
                  >
                    <Check size={11} /> 保存样本
                  </Button>
                  <span className="text-[10px] text-mute">
                    续写时会作为【语感样本】注入，约 {sampleDraft.length} 字
                  </span>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11.5px] text-dim">系统提示词模板</span>
                  <span className="text-[10px] text-mute">
                    变量：{"{{title}} {{genre}} {{pov}} {{style}}"}
                  </span>
                </div>
                <TextArea
                  rows={12}
                  value={templateDraft}
                  onChange={(e) => setTemplateDraft(e.target.value)}
                  className="font-mono text-[11px] leading-[1.8]"
                  placeholder="留空则使用默认模板"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    const value =
                      templateDraft.trim() === DEFAULT_SYSTEM_TEMPLATE.trim()
                        ? ""
                        : templateDraft;
                    await savePromptTemplate(value);
                    toast("提示词模板已保存", "success");
                  }}
                >
                  <Check size={12} /> 保存模板
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTemplateDraft(DEFAULT_SYSTEM_TEMPLATE)}
                >
                  恢复默认
                </Button>
                <span className="flex-1" />
                <span className="text-[10px] text-mute">
                  {templateDraft.length} 字符
                </span>
              </div>
              <p className="text-[10px] leading-relaxed text-mute">
                这段文字会作为 system 消息发给模型。模板里的四条约束建议保留：不新增设定、只输出正文、不重复上文、对白用中文引号。
              </p>
            </div>
          ) : null}

          {tab === "appearance" ? (
            <div className="space-y-5">
              <div>
                <div className="mb-2 text-[11.5px] text-dim">主题</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: "dark" as const, label: "墨夜", desc: "深色，适合夜间长写", icon: Moon },
                    { key: "light" as const, label: "宣纸", desc: "暖白，接近纸面阅读", icon: Sun },
                  ].map((t) => {
                    const Icon = t.icon;
                    const on = theme === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => setTheme(t.key)}
                        className={cx(
                          "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors",
                          on ? "border-gold/45 bg-gold/[0.06]" : "border-line/70 hover:border-line"
                        )}
                      >
                        <span
                          className={cx(
                            "flex h-8 w-8 items-center justify-center rounded-lg",
                            on ? "bg-gold/15 text-gold" : "bg-surface2 text-mute"
                          )}
                        >
                          <Icon size={14} />
                        </span>
                        <span>
                          <span className="block text-[12px] text-ink">{t.label}</span>
                          <span className="text-[10px] text-mute">{t.desc}</span>
                        </span>
                        {on ? <Check size={12} className="ml-auto text-gold" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-line/60 bg-surface2/25 p-4">
                <div className="mb-2 text-[11.5px] text-dim">写作界面</div>
                <ul className="space-y-1.5 text-[11px] leading-relaxed text-mute">
                  <li>· 正文使用宋体（Noto Serif SC），行距 2.05，接近纸书排版</li>
                  <li>· Ctrl + Enter 续写，Ctrl + S 保存，Ctrl + K 命令面板</li>
                  <li>· 专注模式会隐藏左右两栏，只留正文</li>
                </ul>
              </div>
            </div>
          ) : null}

          {tab === "about" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/18 to-transparent">
                  <span className="font-serif text-[22px] text-gold">墨</span>
                </div>
                <div>
                  <div className="text-[14px] text-ink">墨隐 · Novel Studio</div>
                  <div className="text-[10.5px] text-mute">本地优先的 AI 小说创作工作台 v{version}</div>
                </div>
              </div>
              <p className="text-[11.5px] leading-[1.9] text-dim">
                所有作品、设定与密钥都存放在本机。AI 只在你点击生成时被调用，
                上下文由你掌控——设定卡、前情摘要与最近正文会按顺序拼装后发给模型。
              </p>
              <div className="rounded-xl border border-line/60 bg-surface2/25 p-3.5 text-[11px] leading-relaxed text-mute">
                <div className="mb-1 flex items-center gap-1.5 text-dim">
                  <Download size={11} /> 数据位置
                </div>
                %APPDATA%\com.moyin.novelstudio\moyin.db
                <div className="mt-2">导出格式：DOCX / Markdown / TXT（自动加章节标题与排版）</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
