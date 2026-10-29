import { create } from "zustand";
import { api } from "./api";
import { buildChatMessages, buildMessages, QUICK_ACTIONS, splitChatActions } from "./ai";
import { chineseNumber, cleanGenerated } from "./format";
import { analyzeHuman } from "./humanize";
import type {
  Candidate,
  ChapterMeta,
  ChatAction,
  ChatTurn,
  DailyStat,
  Entity,
  EntityKind,
  EntityPatch,
  GenDraft,
  GenKind,
  Profile,
  ProfileInput,
  Project,
  SearchHit,
  Selection,
  SettingsCandidate,
  Thread,
} from "./types";

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let toastSeq = 0;
/** 关闭流程重入锁：保存 → destroy 只走一次 */
let closing = false;

export type View = "write" | "outline" | "bible" | "threads";

export type ExportFormat = "docx" | "md" | "txt";

export interface MultiGen {
  items: Candidate[];
  kind: GenKind;
  anchor?: number;
  instruction: string;
  profileName: string;
  /** 正在让模型评估哪一版最好 */
  judging?: boolean;
  /** 推荐版本下标 */
  recommended?: number;
  /** 评估理由 */
  reason?: string;
  /** 每版得分，和 items 对齐 */
  scores?: number[];
}

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
  /** 可选操作（例如「撤销」），带操作时停留更久 */
  action?: { label: string; run: () => void | Promise<void> };
}

interface Store {
  booted: boolean;
  bootError: string | null;
  projects: Project[];
  activeProjectId: number | null;
  chapters: ChapterMeta[];
  activeChapterId: number | null;
  draft: { title: string; content: string } | null;
  dirty: boolean;
  draftRev: number;
  saving: boolean;
  savedAt: number | null;
  entities: Entity[];
  profiles: Profile[];
  activeProfileId: number | null;
  view: View;
  theme: "dark" | "light";
  focusMode: boolean;
  aiOpen: boolean;
  settingsOpen: boolean;
  projectModal: { mode: "new" | "edit" } | null;
  paletteOpen: boolean;
  gen: GenDraft | null;
  toasts: Toast[];
  selection: Selection | null;
  caret: number | null;
  caretRequest: number | null;
  summarizing: number[];
  summaryAttempted: string[];
  promptTemplate: string;
  multi: MultiGen | null;
  threads: Thread[];
  deletedChapters: ChapterMeta[];
  stats: DailyStat[];
  statsOpen: boolean;
  searchOpen: boolean;
  onboardingOpen: boolean;
  exportRequest: { format: ExportFormat; ids: number[] } | null;

  bootstrap: () => Promise<void>;
  setTheme: (theme: "dark" | "light") => void;
  toggleTheme: () => void;
  toast: (message: string, kind?: Toast["kind"], action?: Toast["action"]) => void;
  dismissToast: (id: number) => void;

  openProject: (id: number) => Promise<void>;
  createProject: (title: string, genre: string) => Promise<void>;
  updateProject: (patch: Partial<Project>) => Promise<void>;
  removeProject: (id: number) => Promise<void>;

  openChapter: (id: number) => Promise<void>;
  setDraft: (patch: Partial<{ title: string; content: string }>) => void;
  saveNow: () => Promise<boolean>;
  /** 保存成功后真正关闭窗口；保存失败则留在应用里 */
  requestClose: () => Promise<void>;
  createChapter: () => Promise<void>;
  removeChapter: (id: number) => Promise<void>;
  renameChapter: (id: number, title: string) => Promise<void>;
  moveChapter: (dragId: number, targetId: number) => Promise<void>;
  updateChapterSummary: (id: number, summary: string) => Promise<void>;
  updateChapterMeta: (
    id: number,
    patch: Partial<{ title: string; summary: string; outline: string; volume: string; status: string }>
  ) => Promise<void>;
  generateOutline: (chapterId: number) => Promise<string | null>;
  suggestChapterTitle: (chapterId: number) => Promise<string[] | null>;
  suggestVolumeName: (chapterId: number) => Promise<string[] | null>;

  loadEntities: () => Promise<void>;
  saveEntity: (entity: Entity, opts?: { silent?: boolean }) => Promise<void>;
  removeEntity: (id: number) => Promise<void>;
  /** 从一段任意文本识别设定候选，不写库 */
  extractSettings: (text: string) => Promise<SettingsCandidate[] | null>;
  /** 批量写入设定，返回真正落库的条目（用于撤销） */
  importEntities: (list: Entity[]) => Promise<Entity[]>;

  loadProfiles: () => Promise<void>;
  saveProfile: (input: ProfileInput) => Promise<Profile | null>;
  removeProfile: (id: number) => Promise<void>;
  makeDefaultProfile: (id: number) => Promise<void>;
  pickProfile: (id: number) => void;

  setView: (view: View) => void;
  setFocusMode: (v: boolean) => void;
  setAiOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  setProjectModal: (v: { mode: "new" | "edit" } | null) => void;
  setPaletteOpen: (v: boolean) => void;
  setStatsOpen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
  setOnboardingOpen: (v: boolean) => void;
  finishOnboarding: () => Promise<void>;
  setSelection: (sel: Selection | null) => void;
  setCaret: (pos: number | null) => void;
  setCaretRequest: (pos: number | null) => void;

  loadThreads: () => Promise<void>;
  saveThread: (thread: Thread) => Promise<void>;
  removeThread: (id: number) => Promise<void>;
  loadStats: (days?: number) => Promise<void>;
  loadDeleted: () => Promise<void>;
  restoreDeleted: (id: number) => Promise<void>;
  purgeDeleted: (id: number) => Promise<void>;
  extractEntities: (chapterId: number) => Promise<number>;
  openSearchHit: (hit: SearchHit) => Promise<void>;

  runAI: (kind: GenKind, instruction?: string) => Promise<void>;
  runAIMulti: (kind: GenKind, instruction?: string) => Promise<void>;
  cancelAI: () => Promise<void>;
  acceptAI: () => Promise<void>;
  discardAI: () => void;
  applyGenerated: (
    text: string,
    opts?: { anchor?: number; selection?: Selection; reason?: string; replace?: boolean }
  ) => Promise<void>;
  acceptCandidate: (index: number) => Promise<void>;
  cancelMulti: () => void;
  /** 三版都写完后，让模型自动评估哪一版最值得采用 */
  maybeJudgeCandidates: () => Promise<void>;
  /**
   * 「写完本章」没写够时接着往下写。默认只在不足目标 90% 且未满两轮时触发；
   * force 为真时由用户点「继续补写」强制再要一段。
   */
  continueShort: (force?: boolean) => Promise<void>;
  restoreSnapshot: (id: number) => Promise<void>;
  summarizeNow: (chapterId: number) => Promise<string | null>;
  maybeAutoSummarize: (chapterId: number) => Promise<void>;
  setPromptTemplate: (template: string) => Promise<void>;
  loadPromptTemplate: () => Promise<void>;
  importBook: () => Promise<void>;
  exportBook: (format: "txt" | "md" | "docx", chapterIds?: number[]) => Promise<void>;
  /** 打开导出弹窗；不传 ids 时默认全选 */
  openExport: (format?: ExportFormat, ids?: number[]) => void;
  closeExport: () => void;
  setExportFormat: (format: ExportFormat) => void;
  setExportIds: (ids: number[]) => void;

  // ---- 与 AI 写手对话
  chat: ChatTurn[];
  chatBusy: boolean;
  /** 对话轮询到正文写手那条流式消息上的 request id */
  chatRequestId: string | null;
  sendChat: (text: string) => Promise<void>;
  cancelChat: () => Promise<void>;
  clearChat: () => void;
  /** 把对话里的回复直接写进左边正文（空章写入、有正文就接在文末） */
  applyChatText: (text: string, opts?: { title?: string }) => Promise<void>;
  /** 把对话里提出的设定卡改动写进设定库 */
  applyChatEntities: (patches: EntityPatch[]) => Promise<number>;
}

function applyTheme(theme: "dark" | "light") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

type SetFn = (partial: Partial<Store> | ((s: Store) => Partial<Store>)) => void;

/** 新建一章并切过去。标题按序号生成，也可以直接给死标题。 */
async function createChapterAt(
  projectId: number,
  count: number,
  forcedTitle: string | undefined,
  set: SetFn
) {
  const title = (forcedTitle ?? "").trim() || `第${chineseNumber(count + 1)}章 未命名`;
  const chapter = await api.createChapter(projectId, title);
  set((s) => ({
    chapters: [...s.chapters, chapter],
    activeChapterId: chapter.id,
    draft: { title: chapter.title, content: "" },
    dirty: false,
    selection: null,
    gen: null,
    multi: null,
    savedAt: Date.now(),
  }));
  set((s) => ({
    projects: s.projects.map((p) =>
      p.id === s.activeProjectId
        ? { ...p, chapterCount: (s.chapters ?? []).length }
        : p
    ),
  }));
}

/**
 * 每章目标字数：作品里单独设的 chapterWords 优先；
 * 没设（0）才退回 2000。「写完本章」按这个数字算缺口。
 */
function chapterWordsOf(project: Project | undefined): number {
  const words = project?.chapterWords ?? 0;
  if (words >= 300) return Math.min(8000, words);
  return 2000;
}

/** 单次输出上限：再高多数 OpenAI 兼容服务会直接 400。 */
const MAX_OUT_TOKENS = 16000;

/** 推理模型的思考过程也占 max_tokens，额度必须放大，否则正文写不了几个字。 */
function isReasoningModel(model: string): boolean {
  return /reason|thinking|deepseek-r1|(^|[-_/])r1($|[-_/])|(^|[-_/])o[13]($|[-_/])|qwq/i.test(
    model
  );
}

function activeProfile(s: { profiles: Profile[]; activeProfileId: number | null }) {
  return (
    s.profiles.find((p) => p.id === s.activeProfileId) ??
    s.profiles.find((p) => p.isDefault) ??
    s.profiles[0]
  );
}

/**
 * 把「还要写多少字」换算成 max_tokens。
 * 中文约 1.35 字符/token，留 15% 余量再留 400 给收尾；
 * 上限取 min(16000, 上下文窗口的一半)，保证输入不会被输出额度挤掉。
 */
function tokensForChars(
  chars: number,
  floor: number,
  contextWindow?: number,
  model?: string
): number {
  const need = Math.ceil((Math.max(chars, 0) / 1.35) * 1.15) + 400;
  const boosted = Math.ceil(need * (isReasoningModel(model ?? "") ? 1.8 : 1));
  const win = contextWindow && contextWindow > 0 ? contextWindow : 32768;
  const ceiling = Math.max(1024, Math.min(MAX_OUT_TOKENS, Math.floor(win / 2)));
  return Math.min(ceiling, Math.max(need, boosted, Math.min(floor, ceiling)));
}

/** 生成结果（含已补写的轮次）当前占多少字符，空白不算。 */
function producedChars(gen: { text: string; baseChars?: number }): number {
  return (gen.baseChars ?? 0) + gen.text.replace(/\s/g, "").length;
}

export const useStore = create<Store>((set, get) => ({
  booted: false,
  bootError: null,
  projects: [],
  activeProjectId: null,
  chapters: [],
  activeChapterId: null,
  draft: null,
  dirty: false,
  draftRev: 0,
  saving: false,
  savedAt: null,
  entities: [],
  profiles: [],
  activeProfileId: null,
  view: "write",
  theme: "dark",
  focusMode: false,
  aiOpen: true,
  settingsOpen: false,
  projectModal: null,
  paletteOpen: false,
  gen: null,
  toasts: [],
  selection: null,
  caret: null,
  caretRequest: null,
  summarizing: [],
  summaryAttempted: [],
  promptTemplate: "",
  multi: null,
  threads: [],
  deletedChapters: [],
  stats: [],
  statsOpen: false,
  searchOpen: false,
  onboardingOpen: false,
  exportRequest: null,
  chat: [],
  chatBusy: false,
  chatRequestId: null,

  async bootstrap() {
    try {
      applyTheme("dark");
      const [projects, profiles, themeSetting, last, template, onboarded] = await Promise.all([
        api.listProjects(),
        api.listProfiles(),
        api.getSetting("theme"),
        api.getSetting("last_project_id"),
        api.getSetting("prompt_system"),
        api.getSetting("onboarded"),
      ]);
      const theme = themeSetting === "light" ? "light" : "dark";
      applyTheme(theme);
      const active = profiles.find((p) => p.isDefault) ?? profiles[0] ?? null;
      set({
        projects,
        profiles,
        theme,
        activeProfileId: active?.id ?? null,
        promptTemplate: template ?? "",
        booted: true,
      });
      if (projects.length) {
        const wanted = Number(last);
        const target = projects.find((p) => p.id === wanted) ?? projects[0];
        await get().openProject(target.id);
      }
      if (onboarded !== "1") set({ onboardingOpen: true });
    } catch (err) {
      set({ booted: true, bootError: String(err) });
    }
  },

  setTheme(theme) {
    applyTheme(theme);
    set({ theme });
    void api.setSetting("theme", theme).catch(() => {});
  },

  toggleTheme() {
    get().setTheme(get().theme === "dark" ? "light" : "dark");
  },

  toast(message, kind = "info", action) {
    const id = ++toastSeq;
    set((s) => {
      // Don't stack identical errors; keep at most 3 toasts so the UI stays usable.
      if (s.toasts.some((t) => t.message === message && t.kind === kind)) return {};
      return { toasts: [...s.toasts, { id, message, kind, action }].slice(-3) };
    });
    setTimeout(() => get().dismissToast(id), action ? 6500 : 3200);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  async openProject(id) {
    if (get().activeProjectId === id && get().chapters.length) {
      set({ view: "write" });
      return;
    }
    const saved = await get().saveNow();
    if (!saved) {
      get().toast("保存失败，已取消切换，避免丢稿", "error");
      return;
    }
    const [chapters, entities, threads] = await Promise.all([
      api.listChapters(id),
      api.listEntities(id),
      api.listThreads(id),
    ]);
    set({
      activeProjectId: id,
      chapters,
      entities,
      threads,
      activeChapterId: null,
      draft: null,
      dirty: false,
      view: "write",
      gen: null,
      multi: null,
      selection: null,
      // 对话历史跟着作品走：切作品还留着上一个作品的上下文，模型会当成同一本书。
      chat: [],
      chatBusy: false,
      chatRequestId: null,
    });
    void api.setSetting("last_project_id", String(id)).catch(() => {});
    if (chapters[0]) await get().openChapter(chapters[0].id);
  },

  async createProject(title, genre) {
    const project = await api.createProject(title, genre);
    set((s) => ({ projects: [project, ...s.projects], projectModal: null }));
    await get().openProject(project.id);
    await get().createChapter();
    get().toast(`已创建《${project.title}》`, "success");
  },

  async updateProject(patch) {
    const current = get().projects.find((p) => p.id === get().activeProjectId);
    if (!current) return;
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await api.updateProject(next);
    set((s) => ({
      projects: s.projects.map((p) => (p.id === next.id ? next : p)),
      projectModal: null,
    }));
    get().toast("作品信息已更新", "success");
  },

  async removeProject(id) {
    await api.deleteProject(id);
    const rest = get().projects.filter((p) => p.id !== id);
    set({
      projects: rest,
      activeProjectId: null,
      chapters: [],
      activeChapterId: null,
      draft: null,
      entities: [],
    });
    if (rest[0]) await get().openProject(rest[0].id);
    get().toast("作品已删除");
  },

  async openChapter(id) {
    if (get().activeChapterId === id) return;
    const saved = await get().saveNow();
    if (!saved) {
      get().toast("保存失败，已取消切换，避免丢稿", "error");
      return;
    }
    // Multi-candidate results belong to the chapter they were generated in.
    if (get().multi) get().cancelMulti();
    const chapter = await api.getChapter(id);
    set({
      activeChapterId: id,
      draft: { title: chapter.title, content: chapter.content },
      dirty: false,
      selection: null,
      caret: null,
      gen: null,
      savedAt: Date.now(),
    });
    void get().maybeAutoSummarize(id);
  },

  setDraft(patch) {
    set((s) =>
      s.draft ? { draft: { ...s.draft, ...patch }, dirty: true, draftRev: s.draftRev + 1 } : {}
    );
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void get().saveNow();
    }, 900);
  },

  async saveNow() {
    const { draft, dirty, activeChapterId, draftRev } = get();
    if (!dirty || !draft || activeChapterId == null) return true;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    set({ saving: true });
    try {
      const res = await api.saveChapter(activeChapterId, draft.title, draft.content);
      // The user may have kept typing while the request was in flight.
      const stillClean = get().draftRev === draftRev;
      set((s) => {
        const chapters = s.chapters.map((c) =>
          c.id === res.id
            ? { ...c, title: draft.title, wordCount: res.wordCount, updatedAt: res.updatedAt }
            : c
        );
        const wordCount = chapters.reduce((a, c) => a + c.wordCount, 0);
        return {
          saving: false,
          dirty: stillClean ? false : true,
          savedAt: Date.now(),
          chapters,
          projects: s.projects.map((p) =>
            p.id === s.activeProjectId
              ? { ...p, wordCount, chapterCount: chapters.length, updatedAt: res.updatedAt }
              : p
          ),
        };
      });
      if (!stillClean) {
        saveTimer = setTimeout(() => {
          void get().saveNow();
        }, 600);
      }
      // Long chapters with no summary get one automatically (once).
      void get().maybeAutoSummarize(res.id);
      return true;
    } catch (err) {
      set({ saving: false });
      get().toast(`保存失败：${err}`, "error");
      return false;
    }
  },

  async requestClose() {
    if (closing) return;
    closing = true;
    try {
      const saved = await get().saveNow();
      if (!saved) {
        closing = false;
        get().toast("保存失败，已取消关闭，避免丢稿", "error");
        return;
      }
      await api.close();
    } catch (err) {
      closing = false;
      get().toast(`关闭失败：${err}`, "error");
    }
  },

  async createChapter() {
    const { activeProjectId, chapters } = get();
    if (activeProjectId == null) return;
    const saved = await get().saveNow();
    if (!saved) {
      get().toast("保存失败，已取消新建，避免丢稿", "error");
      return;
    }
    if (get().multi) get().cancelMulti();
    await createChapterAt(activeProjectId, chapters.length, undefined, set);
  },

  /** 从对话插入正文：已有正文就接在文末，空章就写进去；可选顺便定标题。 */
  async applyChatText(text, opts) {
    const s = get();
    const cleaned = text.trim();
    if (!cleaned) return;
    const title = opts?.title?.trim();
    const chapterId = s.activeChapterId;
    if (chapterId == null) {
      get().toast("先选一个章节", "error");
      return;
    }
    if (!s.draft) return;

    const savedNow = await get().saveNow();
    if (!savedNow) {
      get().toast("保存失败，已取消写入，避免丢稿", "error");
      return;
    }
    try {
      await api.createSnapshot(chapterId, "AI 对话写入前");
    } catch (err) {
      get().toast(`快照失败，仍继续写入：${err}`, "error");
    }
    if (title) {
      await get().updateChapterMeta(chapterId, { title: title.slice(0, 60) });
    }

    const cur = get().draft?.content ?? "";
    if (!cur.trim()) {
      // 空章：直接写进去
      get().setDraft({ content: cleaned });
      set({ caretRequest: cleaned.length });
      get().toast("AI 已写入本章，可以继续让它往下写", "success");
      return;
    }
    // 已有正文：接在文末
    const sep = cur.endsWith("\n\n") ? "" : cur.endsWith("\n") ? "\n" : "\n\n";
    get().setDraft({ content: cur + sep + cleaned });
    set({ caretRequest: cur.length + sep.length + cleaned.length });
    get().toast("AI 已接着文末写完", "success");
  },

  /** 把对话里提出的设定卡改动写进设定库（按名字匹配：有就覆盖填了的字段，没有就新建）。 */
  async applyChatEntities(patches) {
    const projectId = get().activeProjectId;
    if (projectId == null || !patches.length) return 0;
    const norm = (n: string) => n.trim().toLowerCase();
    let written = 0;
    for (const p of patches) {
      const existing = get().entities.find((e) => norm(e.name) === norm(p.name));
      const base: Entity =
        existing ?? {
          id: 0,
          projectId,
          kind: p.kind ?? "concept",
          name: p.name.trim(),
          aliases: "",
          role: "",
          description: "",
          speechStyle: "",
          speechLength: "medium",
          speechWords: "",
          speechTaboo: "",
          updatedAt: new Date().toISOString(),
        };
      // 覆盖式：只写模型给了的字段，没给的保留原值
      await get().saveEntity(
        {
          ...base,
          kind: p.kind ?? base.kind,
          role: p.role ?? base.role,
          description: p.description ?? base.description,
          aliases: p.aliases ?? base.aliases,
          speechStyle: p.speechStyle ?? base.speechStyle,
          speechLength: p.speechLength ?? base.speechLength,
          speechWords: p.speechWords ?? base.speechWords,
          speechTaboo: p.speechTaboo ?? base.speechTaboo,
          updatedAt: new Date().toISOString(),
        },
        { silent: true }
      );
      written += 1;
    }
    get().toast(`已更新 ${written} 张设定卡`, "success");
    return written;
  },

  async removeChapter(id) {
    const { chapters, activeChapterId } = get();
    await api.deleteChapter(id);
    const rest = chapters.filter((c) => c.id !== id);
    set((s) => ({
      chapters: rest,
      projects: s.projects.map((p) =>
        p.id === s.activeProjectId
          ? {
              ...p,
              chapterCount: rest.length,
              wordCount: rest.reduce((a, c) => a + c.wordCount, 0),
            }
          : p
      ),
    }));
    if (activeChapterId === id) {
      const next = rest[Math.min(chapters.findIndex((c) => c.id === id), rest.length - 1)];
      set({ activeChapterId: null, draft: null });
      if (next) await get().openChapter(next.id);
    }
    get().toast("章节已删除");
  },

  async renameChapter(id, title) {
    await api.updateChapterMeta(id, { title });
    set((s) => ({
      chapters: s.chapters.map((c) => (c.id === id ? { ...c, title } : c)),
      draft: s.activeChapterId === id && s.draft ? { ...s.draft, title } : s.draft,
    }));
  },

  async moveChapter(dragId, targetId) {
    const { chapters } = get();
    const from = chapters.findIndex((c) => c.id === dragId);
    const to = chapters.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...chapters];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const ordered = next.map((c, i) => ({ ...c, position: i }));
    set({ chapters: ordered });
    await api.reorderChapters(ordered.map((c) => c.id));
  },

  async updateChapterSummary(id, summary) {
    await api.updateChapterMeta(id, { summary });
    set((s) => ({
      chapters: s.chapters.map((c) => (c.id === id ? { ...c, summary } : c)),
    }));
    get().toast("章节摘要已保存", "success");
  },

  async loadEntities() {
    const { activeProjectId } = get();
    if (activeProjectId == null) return;
    const entities = await api.listEntities(activeProjectId);
    set({ entities });
  },

  async saveEntity(entity: Entity, opts?: { silent?: boolean }) {
    const saved = await api.upsertEntity(entity);
    set((s) => {
      const exists = s.entities.some((e) => e.id === saved.id);
      const entities = exists
        ? s.entities.map((e) => (e.id === saved.id ? saved : e))
        : [...s.entities, saved];
      return { entities };
    });
    if (!opts?.silent) get().toast("设定已保存", "success");
  },

  async removeEntity(id) {
    await api.deleteEntity(id);
    set((s) => ({ entities: s.entities.filter((e) => e.id !== id) }));
    get().toast("设定已删除");
  },

  async extractSettings(text) {
    const s = get();
    if (s.activeProjectId == null) {
      get().toast("先打开一个作品", "error");
      return null;
    }
    const profile =
      s.profiles.find((p) => p.id === s.activeProfileId) ??
      s.profiles.find((p) => p.isDefault) ??
      s.profiles[0];
    if (!profile) {
      get().toast("还没有模型配置，无法识别设定", "error");
      return null;
    }
    if (!profile.hasKey) {
      get().toast("该模型还没有填写 API Key", "error");
      return null;
    }
    try {
      return await api.extractSettings(text, s.activeProjectId, profile.id);
    } catch (err) {
      get().toast(`识别失败：${err}`, "error");
      return null;
    }
  },

  async importEntities(list) {
    const saved: Entity[] = [];
    for (const entity of list) {
      try {
        saved.push(await api.upsertEntity(entity));
      } catch (err) {
        get().toast(`写入失败：${err}`, "error");
      }
    }
    if (!saved.length) return saved;
    set((s) => {
      const map = new Map(s.entities.map((e) => [e.id, e]));
      for (const row of saved) map.set(row.id, row);
      return { entities: Array.from(map.values()) };
    });
    get().toast(`已加入 ${saved.length} 条设定`, "success", {
      label: "撤销",
      run: async () => {
        for (const row of saved) {
          try {
            await api.deleteEntity(row.id);
          } catch {
            /* 条目可能已被手动删除，忽略 */
          }
        }
        set((s) => ({
          entities: s.entities.filter((e) => !saved.some((x) => x.id === e.id)),
        }));
        get().toast("已撤销本次导入");
      },
    });
    return saved;
  },

  async loadProfiles() {
    const profiles = await api.listProfiles();
    const active =
      profiles.find((p) => p.id === get().activeProfileId) ??
      profiles.find((p) => p.isDefault) ??
      profiles[0] ??
      null;
    set({ profiles, activeProfileId: active?.id ?? null });
  },

  async saveProfile(input) {
    try {
      const saved = await api.saveProfile(input);
      await get().loadProfiles();
      set({ activeProfileId: saved.id });
      get().toast("模型配置已保存", "success");
      return saved;
    } catch (err) {
      get().toast(String(err), "error");
      return null;
    }
  },

  async removeProfile(id) {
    await api.deleteProfile(id);
    await get().loadProfiles();
    get().toast("配置已删除");
  },

  async makeDefaultProfile(id) {
    await api.setDefaultProfile(id);
    await get().loadProfiles();
    // "Set default" should also start using it right away.
    set({ activeProfileId: id });
  },

  pickProfile(id) {
    set({ activeProfileId: id });
  },

  setView(view) {
    set({ view });
  },
  setFocusMode(focusMode) {
    set({ focusMode });
  },
  setAiOpen(aiOpen) {
    set({ aiOpen });
  },
  setSettingsOpen(settingsOpen) {
    set({ settingsOpen });
  },
  setProjectModal(projectModal) {
    set({ projectModal });
  },
  setPaletteOpen(paletteOpen) {
    set({ paletteOpen });
  },
  setStatsOpen(statsOpen) {
    set({ statsOpen });
  },
  setSearchOpen(searchOpen) {
    set({ searchOpen });
  },
  setOnboardingOpen(onboardingOpen) {
    set({ onboardingOpen });
  },
  async finishOnboarding() {
    set({ onboardingOpen: false });
    await api.setSetting("onboarded", "1");
  },
  setSelection(selection) {
    set({ selection });
  },
  setCaret(caret) {
    set({ caret });
  },
  setCaretRequest(caretRequest) {
    set({ caretRequest });
  },

  async runAI(kind, instruction) {
    const s = get();
    if (s.gen?.status === "streaming") {
      get().toast("正在生成中，请稍候或先停止", "error");
      return;
    }
    if (s.multi) {
      get().toast("多候选正在生成，请先采用或丢弃", "error");
      return;
    }
    const project = s.projects.find((p) => p.id === s.activeProjectId);
    const chapter = s.chapters.find((c) => c.id === s.activeChapterId);
    if (!project || !chapter || !s.draft) {
      get().toast("请先选择章节", "error");
      return;
    }
    if (kind === "rewrite" && !s.selection?.text.trim()) {
      get().toast("请先在正文中选中要改写的段落", "error");
      return;
    }
    if (kind === "expand" && !s.draft.content.trim()) {
      get().toast("这一章还没有正文，没什么可扩写的", "error");
      return;
    }
    if (kind === "rewriteChapter" && !s.draft.content.trim()) {
      get().toast("这一章还没有正文，没什么可重写的", "error");
      return;
    }
    const profile = activeProfile(s);
    if (!profile) {
      get().toast("还没有模型配置，先添加一个", "error");
      set({ settingsOpen: true });
      return;
    }
    if (!profile.hasKey) {
      get().toast("该模型还没有填写 API Key", "error");
      set({ settingsOpen: true });
      return;
    }

    const quick = QUICK_ACTIONS.find((a) => a.kind === kind);
    const finalInstruction = instruction?.trim() || quick?.instruction || "";
    const anchor =
      kind === "rewrite" || kind === "rewriteChapter" || kind === "expand"
        ? undefined
        : kind === "finish"
          ? s.draft.content.length
          : (s.selection?.end ?? s.caret ?? s.draft.content.length);

    // Keyword retrieval over earlier chapters + open plot threads.
    const textOnTask = kind === "rewrite" || kind === "rewriteChapter" || kind === "expand";
    let retrieved: { title: string; text: string }[] = [];
    if (!textOnTask && s.draft.content.length > 200) {
      const query = `${s.draft.content.slice(-600)}\n${chapter.outline}\n${finalInstruction}`;
      try {
        retrieved = await api.retrieveContext(project.id, query, chapter.id, 4);
      } catch {
        retrieved = [];
      }
    }
    const foreshadows = s.threads
      .filter((t) => t.status === "open")
      .slice(0, 8)
      .map((t) => (t.detail.trim() ? `${t.title}：${t.detail.trim()}` : t.title));

    const chapterWords = chapterWordsOf(project);
    const writtenChars = s.draft.content.replace(/\s/g, "").length;
    const chapterTargetChars = Math.round(chapterWords * 1.2);

    // 输出额度按「这次真的要写多少字」算，别再让 profile 里的默认 max_tokens 卡住。
    // 改写/重写/扩写原来一律吃 2400，长段落会被硬切在半截（再被截断保护拒掉）。
    const selectionChars = s.selection?.text.replace(/\s/g, "").length ?? 0;
    const contentChars = s.draft.content.replace(/\s/g, "").length;
    let needChars: number;
    switch (kind) {
      case "finish":
        needChars = Math.max(chapterTargetChars - writtenChars, chapterWords * 0.6);
        break;
      case "rewrite":
        needChars = selectionChars * 1.1 + 200;
        break;
      case "expand":
        // 有选中就扩到两倍；没选中是整章扩写，产出至少不比原章短。
        needChars =
          selectionChars > 0
            ? selectionChars * 2.1
            : Math.max(chapterTargetChars, contentChars * 1.2 + 200);
        break;
      case "rewriteChapter":
        needChars = contentChars * 1.2 + 200;
        break;
      case "outline":
        needChars = 600;
        break;
      case "custom":
        needChars = selectionChars > 0 ? selectionChars * 1.3 + 400 : 1800;
        break;
      default:
        // 续写一段：文风预设最长约 1100 字，按 1200 字给额度。
        needChars = 1200;
    }
    const maxTokens = tokensForChars(
      needChars,
      profile.maxTokens,
      profile.contextWindow,
      profile.model
    );

    const built = buildMessages({
      project,
      chapters: s.chapters,
      entities: s.entities,
      chapter,
      content: s.draft.content,
      kind,
      instruction: finalInstruction,
      selection: s.selection ?? undefined,
      anchor,
      contextWindow: profile.contextWindow,
      promptTemplate: s.promptTemplate,
      maxTokens,
      chapterWords,
      retrieved,
      foreshadows,
    });

    const requestId = crypto.randomUUID();
    const gen: GenDraft = {
      id: requestId,
      kind,
      text: "",
      status: "streaming",
      instruction: finalInstruction,
      selection: s.selection ?? undefined,
      anchor,
      profileName: profile.model,
      startedAt: Date.now(),
      requestId,
      baseChars: writtenChars,
      rounds: 0,
      // 只有「写完本章」承诺了整章字数；其它动作没有可核对的目标。
      targetChars: kind === "finish" ? chapterTargetChars : undefined,
    };
    set({ gen, aiOpen: true });

    try {
      await api.generate({
        requestId,
        profileId: profile.id,
        messages: built.messages,
        temperature: profile.temperature,
        maxTokens,
      });
    } catch (err) {
      set((cur) =>
        cur.gen && (cur.gen.requestId ?? cur.gen.id) === requestId
          ? { gen: { ...cur.gen, status: "error", error: String(err) } }
          : {}
      );
    }
  },

  async cancelAI() {
    const gen = get().gen;
    if (!gen) return;
    await api.cancelGeneration(gen.requestId ?? gen.id);
  },

  async acceptAI() {
    const s = get();
    const gen = s.gen;
    if (!gen || !s.draft) return;
    const text = cleanGenerated(gen.text);
    if (!text) return;

    if (gen.kind === "outline") {
      void navigator.clipboard.writeText(text);
      get().toast("章纲已复制到剪贴板", "success");
      set({ gen: { ...gen, applied: true } });
      return;
    }

    const replaceAll = gen.kind === "rewriteChapter";
    // 扩写：选中了一段就替换那段，没选中就把整章换成扩写后的版本。
    const expandWhole = gen.kind === "expand" && !gen.selection?.text.trim();
    await get().applyGenerated(text, {
      anchor: gen.anchor,
      selection:
        gen.kind === "rewrite" || gen.kind === "expand" ? gen.selection : undefined,
      reason: replaceAll
        ? "AI 整章重写前"
        : gen.kind === "rewrite"
          ? "AI 改写前"
          : gen.kind === "expand"
            ? "AI 扩写前"
            : "AI 续写前",
      replace: replaceAll || expandWhole,
    });
    if (gen.kind === "expand") {
      get().toast(
        expandWhole ? "已按扩写后的版本替换整章" : "已替换为扩写后的段落",
        "success"
      );
    }
    set({ gen: { ...gen, applied: true } });
  },

  async applyGenerated(text, opts) {
    const s = get();
    if (!s.draft || s.activeChapterId == null) return;

    // 快照要基于编辑器里的最新草稿：先落库再快照。
    // 否则「恢复到 AI 改写前」会退回到比用户实际写过的更早的版本。
    if (s.draft.content.trim().length > 0) {
      const saved = await get().saveNow();
      if (!saved) {
        get().toast("保存失败，已取消写入，避免快照与正文对不上", "error");
        return;
      }
      const chapterId = get().activeChapterId;
      if (chapterId == null) return;
      try {
        await api.createSnapshot(chapterId, opts?.reason ?? "AI 写入前");
      } catch (err) {
        get().toast(`快照失败，仍继续应用：${err}`, "error");
      }
    }

    const cur = get();
    if (!cur.draft) return;
    const content = cur.draft.content;

    if (opts?.replace) {
      // 防截断：模型可能写到一半就停，直接替换会把后半章吃掉。
      if (content.trim().length > 400 && text.length < content.length * 0.6) {
        get().toast("重写结果明显短于原文，可能被截断，已取消替换", "error");
        return;
      }
      get().setDraft({ content: text });
      set({ selection: null, caretRequest: 0 });
      get().toast("已按新写法重写整章", "success");
      return;
    }

    if (opts?.selection) {
      const start = Math.min(opts.selection.start, content.length);
      const end = Math.min(opts.selection.end, content.length);
      get().setDraft({ content: content.slice(0, start) + text + content.slice(end) });
      set({ selection: null, caretRequest: start + text.length });
      get().toast("已替换选中段落", "success");
      return;
    }

    const at = Math.min(opts?.anchor ?? content.length, content.length);
    const before = content.slice(0, at);
    const after = content.slice(at);
    const prefix = before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const suffix = after.length === 0 ? "" : after.startsWith("\n") ? "" : "\n\n";
    get().setDraft({ content: before + prefix + text + suffix + after });
    set({ selection: null, caretRequest: at + prefix.length + text.length });
    get().toast(at < content.length ? "已插入光标处" : "已插入正文", "success");
  },

  async runAIMulti(kind = "continue", instruction) {
    const s = get();
    if (s.gen?.status === "streaming") {
      get().toast("正在生成中，请稍候或先停止", "error");
      return;
    }
    if (s.multi) return;
    const project = s.projects.find((p) => p.id === s.activeProjectId);
    const chapter = s.chapters.find((c) => c.id === s.activeChapterId);
    if (!project || !chapter || !s.draft) {
      get().toast("请先选择章节", "error");
      return;
    }
    if (kind === "rewrite") {
      get().toast("多候选只支持续写或自定义", "error");
      return;
    }
    const profile =
      s.profiles.find((p) => p.id === s.activeProfileId) ??
      s.profiles.find((p) => p.isDefault) ??
      s.profiles[0];
    if (!profile) {
      get().toast("还没有模型配置，先添加一个", "error");
      set({ settingsOpen: true });
      return;
    }
    if (!profile.hasKey) {
      get().toast("该模型还没有填写 API Key", "error");
      set({ settingsOpen: true });
      return;
    }

    const finalInstruction = instruction?.trim() || "";
    const anchor = s.selection?.end ?? s.caret ?? s.draft.content.length;

    // 三版同写不是「写三段随缘的几百字」，而是把这一章的缺口拆成三份：
    // 每版各写一段，每段的目标 = (目标字数 − 已写) ÷ 3。这样挑一版接上去，
    // 加起来正好接近「每章字数」。
    const chapterWords = chapterWordsOf(project);
    const written = s.draft.content.replace(/\s/g, "").length;
    const remainChars = Math.max(chapterWords * 1.2 - written, chapterWords * 0.6);
    const segmentWords = Math.round(remainChars / 1.2 / 3);

    let retrieved: { title: string; text: string }[] = [];
    if (s.draft.content.length > 200) {
      const query = `${s.draft.content.slice(-600)}\n${chapter.outline}\n${finalInstruction}`;
      try {
        retrieved = await api.retrieveContext(project.id, query, chapter.id, 4);
      } catch {
        retrieved = [];
      }
    }
    const foreshadows = s.threads
      .filter((t) => t.status === "open")
      .slice(0, 8)
      .map((t) => (t.detail.trim() ? `${t.title}：${t.detail.trim()}` : t.title));

    const built = buildMessages({
      project,
      chapters: s.chapters,
      entities: s.entities,
      chapter,
      content: s.draft.content,
      kind,
      instruction: finalInstruction,
      anchor,
      contextWindow: profile.contextWindow,
      promptTemplate: s.promptTemplate,
      maxTokens: profile.maxTokens,
      chapterWords,
      segmentWords,
      retrieved,
      foreshadows,
    });

    const ids = [0, 1, 2].map(() => crypto.randomUUID());
    set({
      multi: {
        items: ids.map((id) => ({ id, text: "", status: "streaming" as const })),
        kind,
        anchor,
        instruction: finalInstruction,
        profileName: profile.model,
      },
      gen: null,
      aiOpen: true,
    });

    // 三版并发时，中转站/网关经常把其中一发直接掐断（ECONNRESET）。
    // 单版失败先自动重试一次，避免"第 3 版 失败"这种白丢一版。
    // 输出上限也要放大：默认 max_tokens 只有一千多，长段落会被硬切在半截。
    console.info(
      `[multi] 每章目标 ${chapterWords} 字，已写 ${written} 字，每版目标 ${segmentWords} 字`
    );
    const multiMaxTokens = Math.min(
      16000,
      Math.max(profile.maxTokens, Math.ceil((segmentWords * 1.2) / 1.35) * 1.3 + 400)
    );
    const launch = (id: string, temperature: number, attempt: number) => {
      void api
        .generate({
          requestId: id,
          profileId: profile.id,
          messages: built.messages,
          temperature,
          maxTokens: multiMaxTokens,
        })
        .catch((err) => {
          if (attempt === 0) {
            const stillThere = get().multi?.items.some((it) => it.id === id);
            if (!stillThere) return;
            // 先把已经流出来的半截清掉，重试才不会拼接成两遍。
            set((cur) =>
              cur.multi
                ? {
                    multi: {
                      ...cur.multi,
                      items: cur.multi.items.map((it) =>
                        it.id === id
                          ? { ...it, text: "", status: "streaming" as const, error: undefined }
                          : it
                      ),
                    },
                  }
                : {}
            );
            setTimeout(() => launch(id, temperature, 1), 700);
            return;
          }
          set((cur) =>
            cur.multi
              ? {
                  multi: {
                    ...cur.multi,
                    items: cur.multi.items.map((it) =>
                      it.id === id
                        ? { ...it, status: "error" as const, error: String(err) }
                        : it
                    ),
                  },
                }
              : {}
          );
        });
    };

    ids.forEach((id, i) => {
      const temperature = Math.min(
        1.5,
        Math.max(0, profile.temperature + (i - 1) * 0.12)
      );
      launch(id, temperature, 0);
    });
  },

  async acceptCandidate(index) {
    const s = get();
    const multi = s.multi;
    const item = multi?.items[index];
    if (!multi || !item) return;
    const text = cleanGenerated(item.text);
    if (!text) return;
    await get().applyGenerated(text, {
      anchor: multi.anchor,
      reason: "AI 多候选采纳前",
    });
    set({ multi: null });
  },

  cancelMulti() {
    const multi = get().multi;
    if (!multi) return;
    multi.items.forEach((it) => {
      if (it.status === "streaming") void api.cancelGeneration(it.id).catch(() => {});
    });
    set({ multi: null });
  },

  async maybeJudgeCandidates() {
    const s = get();
    const multi = s.multi;
    if (!multi || multi.judging || multi.recommended != null) return;
    if (multi.items.some((it) => it.status === "streaming")) return;
    const done = multi.items.filter((it) => it.status === "done" && it.text.trim());
    if (done.length < 2) return;
    const profile =
      s.profiles.find((p) => p.id === s.activeProfileId) ??
      s.profiles.find((p) => p.isDefault) ??
      s.profiles[0];
    if (!profile?.hasKey) return;

    set({ multi: { ...multi, judging: true } });
    const runId = multi.items[0]?.id;
    const stillSame = (cur: { multi: MultiGen | null }) =>
      Boolean(cur.multi && cur.multi.items[0]?.id === runId);
    const chapter = s.chapters.find((c) => c.id === s.activeChapterId);
    const context = [chapter?.title, chapter?.outline, s.draft?.content.slice(-700)]
      .filter(Boolean)
      .join("\n");

    try {
      const res = await api.judgeCandidates(
        done.map((it) => it.text),
        context,
        profile.id
      );
      const winner = done[Math.max(0, Math.min(done.length - 1, res.best - 1))];
      const recommended = multi.items.findIndex((it) => it.id === winner.id);
      const scores = multi.items.map((it) => {
        const k = done.indexOf(it);
        return k >= 0 ? res.scores[k] ?? 0 : 0;
      });
      set((cur) =>
        stillSame(cur)
          ? {
              multi: {
                ...cur.multi!,
                judging: false,
                recommended,
                reason: res.reason,
                scores,
              },
            }
          : {}
      );
    } catch {
      // 评估失败不打扰作者：退回本地文风分，仍然标一个推荐版本。
      const scores = multi.items.map((it) =>
        it.status === "done" && it.text.trim() ? analyzeHuman(it.text).score : 0
      );
      let recommended = 0;
      scores.forEach((v, i) => {
        if (v > scores[recommended]) recommended = i;
      });
      set((cur) =>
        stillSame(cur)
          ? {
              multi: {
                ...cur.multi!,
                judging: false,
                recommended,
                reason: "AI 评估失败，按本地文风分兜底",
                scores,
              },
            }
          : {}
      );
    }
  },

  discardAI() {
    const gen = get().gen;
    if (gen?.status === "streaming") void api.cancelGeneration(gen.requestId ?? gen.id).catch(() => {});
    set({ gen: null });
  },

  /**
   * 「写完本章」最大的问题是：模型写一半就收尾，前端从来不核对。
   * 这里按实际字数算缺口，差得多就自动再要一段（最多两轮），
   * 每轮都把已生成的内容当成「已写正文」重新算「还差多少字」。
   */
  async continueShort(force = false) {
    const s = get();
    const gen = s.gen;
    if (!gen || gen.kind !== "finish" || gen.continuing) return;
    // 自动补写只认正常写完；用户点过「停止」就不再自动续，手动按钮除外。
    if (force ? gen.status !== "done" && gen.status !== "stopped" : gen.status !== "done") return;
    if (gen.applied) return;
    const target = gen.targetChars ?? 0;
    if (target <= 0) return;
    const rounds = gen.rounds ?? 0;
    if (!force && rounds >= 2) return;
    const produced = producedChars(gen);
    if (!force && produced >= target * 0.9) return;

    const project = s.projects.find((p) => p.id === s.activeProjectId);
    const chapter = s.chapters.find((c) => c.id === s.activeChapterId);
    const draft = s.draft;
    const profile = activeProfile(s);
    if (!project || !chapter || !draft || !profile?.hasKey) return;

    const cleaned = cleanGenerated(gen.text);
    if (!cleaned.trim()) return;
    // 把这一轮已经写出来的正文也交给模型，续写才不会重复、缺口才算得对。
    const combined = `${draft.content}${draft.content.trim() ? "\n\n" : ""}${cleaned}`;

    const chapterWords = chapterWordsOf(project);
    const needChars = Math.max(
      Math.round(chapterWords * 1.2) - combined.replace(/\s/g, "").length,
      400
    );
    const foreshadows = s.threads
      .filter((t) => t.status === "open")
      .slice(0, 8)
      .map((t) => (t.detail.trim() ? `${t.title}：${t.detail.trim()}` : t.title));

    const maxTokens = tokensForChars(
      needChars,
      profile.maxTokens,
      profile.contextWindow,
      profile.model
    );
    const built = buildMessages({
      project,
      chapters: s.chapters,
      entities: s.entities,
      chapter,
      content: combined,
      kind: "finish",
      instruction: gen.instruction,
      contextWindow: profile.contextWindow,
      promptTemplate: s.promptTemplate,
      maxTokens,
      chapterWords,
      foreshadows,
    });

    const shortfall = Math.max(0, Math.round((target - produced) / 1.2));
    const requestId = crypto.randomUUID();
    set({
      gen: {
        ...gen,
        status: "streaming",
        continuing: true,
        rounds: rounds + 1,
        requestId,
        text: gen.text + (/\n\s*$/.test(gen.text) ? "" : "\n\n"),
      },
    });
    get().toast(`还差约 ${shortfall} 字，正在补写第 ${rounds + 1} 段…`);

    try {
      await api.generate({
        requestId,
        profileId: profile.id,
        messages: built.messages,
        temperature: profile.temperature,
        maxTokens,
      });
    } catch (err) {
      set((cur) =>
        cur.gen && (cur.gen.requestId ?? cur.gen.id) === requestId
          ? { gen: { ...cur.gen, status: "error", continuing: false, error: String(err) } }
          : {}
      );
    }
  },

  async restoreSnapshot(id) {
    // 先把编辑器里的草稿落库：否则恢复会直接盖掉最近几百字，
    // 而数据库里那句「恢复前自动备份」备份的也是旧版本，救不回来。
    const saved = await get().saveNow();
    if (!saved) {
      get().toast("保存失败，已取消恢复，避免丢稿", "error");
      return;
    }
    try {
      const activeId = get().activeChapterId;
      const res = await api.restoreSnapshot(id);
      const chapter = await api.getChapter(res.id);
      set((s) => {
        const chapters = s.chapters.map((c) =>
          c.id === res.id ? { ...c, wordCount: res.wordCount, updatedAt: res.updatedAt } : c
        );
        const wordCount = chapters.reduce((a, c) => a + c.wordCount, 0);
        return {
          chapters,
          projects: s.projects.map((p) =>
            p.id === s.activeProjectId ? { ...p, wordCount, chapterCount: chapters.length } : p
          ),
          draft:
            s.activeChapterId === res.id
              ? { title: chapter.title, content: chapter.content }
              : s.draft,
          dirty: s.activeChapterId === res.id ? false : s.dirty,
          savedAt: Date.now(),
          selection: null,
          gen: null,
        };
      });
      get().toast(
        activeId === res.id
          ? "已恢复到所选版本，可再次从历史里恢复"
          : `已恢复《${chapter.title}》，切到该章即可查看`,
        "success"
      );
    } catch (err) {
      get().toast(`恢复失败：${err}`, "error");
    }
  },

  async summarizeNow(chapterId) {
    const s = get();
    const profile =
      s.profiles.find((p) => p.id === s.activeProfileId) ??
      s.profiles.find((p) => p.isDefault) ??
      s.profiles[0];
    if (!profile) {
      get().toast("还没有模型配置，无法生成摘要", "error");
      return null;
    }
    if (!profile.hasKey) {
      get().toast("该模型还没有填写 API Key", "error");
      return null;
    }
    if (s.summarizing.includes(chapterId)) return null;
    set((st) => ({ summarizing: [...st.summarizing, chapterId] }));
    try {
      const summary = await api.summarizeChapter(chapterId, profile.id);
      set((st) => ({
        chapters: st.chapters.map((c) => (c.id === chapterId ? { ...c, summary } : c)),
        summarizing: st.summarizing.filter((x) => x !== chapterId),
      }));
      return summary;
    } catch (err) {
      set((st) => ({ summarizing: st.summarizing.filter((x) => x !== chapterId) }));
      get().toast(`摘要生成失败：${err}`, "error");
      return null;
    }
  },

  async maybeAutoSummarize(chapterId) {
    const s = get();
    const chapter = s.chapters.find((c) => c.id === chapterId);
    if (!chapter) return;
    if (chapter.wordCount < 300) return;
    if (s.summarizing.includes(chapterId)) return;

    // Don't nag with failures when no key is configured yet.
    const profile =
      s.profiles.find((p) => p.id === s.activeProfileId) ??
      s.profiles.find((p) => p.isDefault) ??
      s.profiles[0];
    if (!profile?.hasKey) return;

    const stale =
      !chapter.summary.trim() ||
      chapter.wordCount > chapter.summaryWords * 1.6 + 200 ||
      // 恢复到更早（更短）的版本后，摘要会比正文还长，也是过期。
      chapter.summaryWords > chapter.wordCount * 1.6 + 200;
    if (!stale) return;

    // One attempt per chapter per ~300 words, so refreshes happen eventually
    // without hammering the API on every autosave.
    const key = `${chapterId}:${Math.floor(chapter.wordCount / 300)}`;
    if (s.summaryAttempted.includes(key)) return;
    set((st) => ({ summaryAttempted: [...st.summaryAttempted, key] }));

    const hadSummary = Boolean(chapter.summary.trim());
    const summary = await get().summarizeNow(chapterId);
    if (summary) {
      get().toast(hadSummary ? "章节摘要已按最新正文更新" : "已自动生成章节摘要", "success");
    }
  },

  async updateChapterMeta(id, patch) {
    await api.updateChapterMeta(id, patch);
    set((s) => ({
      chapters: s.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      draft:
        s.activeChapterId === id && s.draft && patch.title
          ? { ...s.draft, title: patch.title }
          : s.draft,
    }));
  },

  async suggestChapterTitle(chapterId) {
    const s = get();
    const profile =
      s.profiles.find((p) => p.id === s.activeProfileId) ??
      s.profiles.find((p) => p.isDefault) ??
      s.profiles[0];
    if (!profile) {
      get().toast("还没有模型配置，无法命名", "error");
      return null;
    }
    if (!profile.hasKey) {
      get().toast("该模型还没有填写 API Key", "error");
      return null;
    }
    try {
      return await api.generateTitle(chapterId, profile.id);
    } catch (err) {
      get().toast(`AI 命名失败：${err}`, "error");
      return null;
    }
  },

  async suggestVolumeName(chapterId) {
    const s = get();
    const profile =
      s.profiles.find((p) => p.id === s.activeProfileId) ??
      s.profiles.find((p) => p.isDefault) ??
      s.profiles[0];
    if (!profile) {
      get().toast("还没有模型配置，无法命名", "error");
      return null;
    }
    if (!profile.hasKey) {
      get().toast("该模型还没有填写 API Key", "error");
      return null;
    }
    try {
      return await api.generateVolumeName(chapterId, profile.id);
    } catch (err) {
      get().toast(`AI 卷名失败：${err}`, "error");
      return null;
    }
  },

  async generateOutline(chapterId) {
    const s = get();
    const profile =
      s.profiles.find((p) => p.id === s.activeProfileId) ??
      s.profiles.find((p) => p.isDefault) ??
      s.profiles[0];
    if (!profile) {
      get().toast("还没有模型配置，无法生成章纲", "error");
      return null;
    }
    if (!profile.hasKey) {
      get().toast("该模型还没有填写 API Key", "error");
      return null;
    }
    try {
      const outline = await api.generateOutline(chapterId, profile.id);
      set((st) => ({
        chapters: st.chapters.map((c) => (c.id === chapterId ? { ...c, outline } : c)),
      }));
      get().toast("章纲已生成", "success");
      return outline;
    } catch (err) {
      get().toast(`章纲生成失败：${err}`, "error");
      return null;
    }
  },

  async setPromptTemplate(template) {
    set({ promptTemplate: template });
    await api.setSetting("prompt_system", template);
  },

  async loadPromptTemplate() {
    const template = await api.getSetting("prompt_system");
    set({ promptTemplate: template ?? "" });
  },

  async importBook() {
    try {
      const project = await api.importBook();
      if (!project) return;
      set((s) => ({ projects: [project, ...s.projects] }));
      await get().openProject(project.id);
      get().toast(`已导入《${project.title}》，共 ${project.chapterCount} 章`, "success");
    } catch (err) {
      get().toast(`导入失败：${err}`, "error");
    }
  },

  async exportBook(format, chapterIds) {
    const { activeProjectId } = get();
    if (activeProjectId == null) return;
    await get().saveNow();
    try {
      const path = await api.exportBook(activeProjectId, format, chapterIds);
      if (path) get().toast(`已导出到 ${path}`, "success");
    } catch (err) {
      get().toast(`导出失败：${err}`, "error");
    }
  },

  openExport(format = "docx", ids) {
    const all = get().chapters.map((c) => c.id);
    set({ exportRequest: { format, ids: ids ?? all } });
  },

  closeExport() {
    set({ exportRequest: null });
  },

  setExportFormat(format) {
    set((s) =>
      s.exportRequest ? { exportRequest: { ...s.exportRequest, format } } : {}
    );
  },

  setExportIds(ids) {
    set((s) => (s.exportRequest ? { exportRequest: { ...s.exportRequest, ids } } : {}));
  },

  async sendChat(text) {
    const clean = text.trim();
    if (!clean || get().chatBusy) return;
    const s = get();
    const project = s.projects.find((p) => p.id === s.activeProjectId);
    if (!project || !s.draft) {
      get().toast("先打开一个作品和章节", "error");
      return;
    }
    const profile =
      s.profiles.find((p) => p.id === s.activeProfileId) ??
      s.profiles.find((p) => p.isDefault) ??
      s.profiles[0];
    if (!profile?.hasKey) {
      get().toast("还没有可用的模型配置", "error");
      set({ settingsOpen: true });
      return;
    }
    const chapter = s.chapters.find((c) => c.id === s.activeChapterId);

    const history = s.chat
      .filter((t) => t.status === "done" && (t.role === "user" || t.role === "assistant"))
      .map((t) => ({ role: t.role, content: t.content }));
    const messages = buildChatMessages({
      project,
      chapter,
      outline: chapter?.outline ?? "",
      content: s.draft.content,
      entities: s.entities,
      threads: s.threads,
      history,
    });
    // 每次都以「上下文简报 → 握手 → 历史 → 这次的问题」的顺序发给模型，
    // 保证最新一章的正文永远在上下文里，而不是只在第一轮。
    messages.push({ role: "user", content: clean });

    const userTurn: ChatTurn = {
      id: crypto.randomUUID(),
      role: "user",
      content: clean,
      createdAt: Date.now(),
      status: "done",
    };
    const replyId = crypto.randomUUID();
    const reply: ChatTurn = {
      id: replyId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      status: "streaming",
    };
    set((cur) => ({ chat: [...cur.chat, userTurn, reply], chatBusy: true }));
    const requestId = crypto.randomUUID();
    set({ chatRequestId: requestId });

    try {
      await api.generate({
        requestId,
        profileId: profile.id,
        messages,
        temperature: 0.7,
        maxTokens: 1200,
      });
    } catch (err) {
      set((cur) => ({
        chatBusy: false,
        chatRequestId: null,
        chat: cur.chat.map((t) =>
          t.id === replyId ? { ...t, status: "error", error: String(err) } : t
        ),
      }));
    }
  },

  async cancelChat() {
    const id = get().chatRequestId;
    if (!id) return;
    await api.cancelGeneration(id);
    set((cur) => ({
      chatBusy: false,
      chat: cur.chat.map((t) =>
        t.status === "streaming" ? { ...t, status: "error", error: "已停止" } : t
      ),
    }));
  },

  clearChat() {
    set({ chat: [], chatBusy: false, chatRequestId: null });
  },

  async loadThreads() {
    const id = get().activeProjectId;
    if (id == null) return;
    const threads = await api.listThreads(id);
    set({ threads });
  },

  async saveThread(thread) {
    const saved = await api.upsertThread(thread);
    set((s) => {
      const exists = s.threads.some((t) => t.id === saved.id);
      return {
        threads: exists
          ? s.threads.map((t) => (t.id === saved.id ? saved : t))
          : [saved, ...s.threads],
      };
    });
    get().toast("线索已保存", "success");
  },

  async removeThread(id) {
    await api.deleteThread(id);
    set((s) => ({ threads: s.threads.filter((t) => t.id !== id) }));
    get().toast("线索已删除");
  },

  async loadStats(days = 14) {
    const stats = await api.dailyStats(days);
    set({ stats });
  },

  async loadDeleted() {
    const id = get().activeProjectId;
    if (id == null) return;
    const deletedChapters = await api.listDeletedChapters(id);
    set({ deletedChapters });
  },

  async restoreDeleted(id) {
    await api.restoreChapter(id);
    const projectId = get().activeProjectId;
    if (projectId != null) {
      const chapters = await api.listChapters(projectId);
      set((s) => ({
        chapters,
        deletedChapters: s.deletedChapters.filter((c) => c.id !== id),
        projects: s.projects.map((p) =>
          p.id === projectId ? { ...p, chapterCount: chapters.length } : p
        ),
      }));
    }
    get().toast("章节已恢复", "success");
  },

  async purgeDeleted(id) {
    await api.purgeChapter(id);
    set((s) => ({ deletedChapters: s.deletedChapters.filter((c) => c.id !== id) }));
    get().toast("章节已彻底删除");
  },

  async extractEntities(chapterId) {
    const s = get();
    const profile =
      s.profiles.find((p) => p.id === s.activeProfileId) ??
      s.profiles.find((p) => p.isDefault) ??
      s.profiles[0];
    if (!profile) {
      get().toast("还没有模型配置，无法抽取设定", "error");
      return 0;
    }
    if (!profile.hasKey) {
      get().toast("该模型还没有填写 API Key", "error");
      return 0;
    }
    try {
      const added = await api.extractEntities(chapterId, profile.id);
      if (added.length) {
        set((st) => ({ entities: [...st.entities, ...added] }));
        get().toast(`已从正文抽取 ${added.length} 条设定`, "success");
      } else {
        get().toast("没有发现新的设定（已有条目会自动跳过）");
      }
      return added.length;
    } catch (err) {
      get().toast(`抽取失败：${err}`, "error");
      return 0;
    }
  },

  async openSearchHit(hit) {
    await get().openChapter(hit.chapterId);
    set({ view: "write", searchOpen: false, caretRequest: hit.offset });
  },
}));

export const KIND_LABEL: Record<EntityKind, string> = {
  character: "人物",
  location: "地点",
  faction: "势力",
  item: "物品",
  concept: "设定",
};

// Dev-only handle for automated UI checks; removed from production builds.
if (import.meta.env.DEV) {
  (window as unknown as { __moyin: typeof useStore }).__moyin = useStore;
}
