import { AnimatePresence, motion } from "motion/react";
import {
  Check,
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
import { DEFAULT_SYSTEM_TEMPLATE } from "@/lib/ai";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Profile } from "@/lib/types";
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
  const toast = useStore((s) => s.toast);

  const [tab, setTab] = useState<Tab>("model");
  const [templateDraft, setTemplateDraft] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(emptyForm(true));
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const hydrated = useRef<number>(-2);

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
    hydrated.current = -1;
    setSelectedId(null);
    setForm(emptyForm(profiles.length === 0));
    setTestResult(null);
    setModels([]);
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

  const runTest = async () => {
    if (!form.id) {
      toast("先保存配置，再测试连接", "error");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const reply = await api.testProfile(form.id);
      setTestResult({ ok: true, text: reply });
    } catch (err) {
      setTestResult({ ok: false, text: String(err) });
    } finally {
      setTesting(false);
    }
  };

  const fetchModels = async () => {
    if (!form.id) {
      toast("先保存配置，再拉取模型列表", "error");
      return;
    }
    setFetching(true);
    try {
      const list = await api.listModels(form.id);
      setModels(list);
      toast(list.length ? `找到 ${list.length} 个模型` : "服务没有返回模型列表", "success");
    } catch (err) {
      toast(String(err), "error");
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
          <span className="mr-auto text-[10px] text-mute">v0.1.0 · 本地单机</span>
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
                <div className="flex gap-2">
                  <TextInput
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="deepseek-chat"
                    list="model-options"
                    className="font-mono text-[12px]"
                  />
                  <datalist id="model-options">
                    {models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
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
                  <span className="text-[11.5px] text-dim">系统提示词模板</span>
                  <span className="text-[10px] text-mute">
                    变量：{"{{title}} {{genre}} {{pov}} {{style}}"}
                  </span>
                </div>
                <TextArea
                  rows={14}
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
                  <div className="text-[10.5px] text-mute">本地优先的 AI 小说创作工作台 v0.1.0</div>
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
