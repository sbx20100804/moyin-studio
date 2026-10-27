import { create } from "zustand";
import { api } from "./api";
import { buildMessages, QUICK_ACTIONS } from "./ai";
import { chineseNumber, cleanGenerated } from "./format";
import type {
  Candidate,
  ChapterMeta,
  DailyStat,
  Entity,
  EntityKind,
  GenDraft,
  GenKind,
  Profile,
  ProfileInput,
  Project,
  SearchHit,
  Selection,
  Thread,
} from "./types";

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let toastSeq = 0;

export type View = "write" | "outline" | "bible" | "threads";

export interface MultiGen {
  items: Candidate[];
  kind: GenKind;
  anchor?: number;
  instruction: string;
  profileName: string;
}

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
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

  bootstrap: () => Promise<void>;
  setTheme: (theme: "dark" | "light") => void;
  toggleTheme: () => void;
  toast: (message: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;

  openProject: (id: number) => Promise<void>;
  createProject: (title: string, genre: string) => Promise<void>;
  updateProject: (patch: Partial<Project>) => Promise<void>;
  removeProject: (id: number) => Promise<void>;

  openChapter: (id: number) => Promise<void>;
  setDraft: (patch: Partial<{ title: string; content: string }>) => void;
  saveNow: () => Promise<boolean>;
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

  loadEntities: () => Promise<void>;
  saveEntity: (entity: Entity) => Promise<void>;
  removeEntity: (id: number) => Promise<void>;

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
    opts?: { anchor?: number; selection?: Selection; reason?: string }
  ) => Promise<void>;
  acceptCandidate: (index: number) => Promise<void>;
  cancelMulti: () => void;
  restoreSnapshot: (id: number) => Promise<void>;
  summarizeNow: (chapterId: number) => Promise<string | null>;
  maybeAutoSummarize: (chapterId: number) => Promise<void>;
  setPromptTemplate: (template: string) => Promise<void>;
  loadPromptTemplate: () => Promise<void>;
  importBook: () => Promise<void>;
  exportBook: (format: "txt" | "md" | "docx", chapterIds?: number[]) => Promise<void>;
}

function applyTheme(theme: "dark" | "light") {
  document.documentElement.classList.toggle("dark", theme === "dark");
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

  async bootstrap() {
    try {
      applyTheme("dark");
      const [projects, profiles, themeSetting, last, template] = await Promise.all([
        api.listProjects(),
        api.listProfiles(),
        api.getSetting("theme"),
        api.getSetting("last_project_id"),
        api.getSetting("prompt_system"),
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
    } catch (err) {
      set({ booted: true, bootError: String(err) });
    }
  },

  setTheme(theme) {
    applyTheme(theme);
    set({ theme });
    void api.setSetting("theme", theme);
  },

  toggleTheme() {
    get().setTheme(get().theme === "dark" ? "light" : "dark");
  },

  toast(message, kind = "info") {
    const id = ++toastSeq;
    set((s) => {
      // Don't stack identical errors; keep at most 3 toasts so the UI stays usable.
      if (s.toasts.some((t) => t.message === message && t.kind === kind)) return {};
      return { toasts: [...s.toasts, { id, message, kind }].slice(-3) };
    });
    setTimeout(() => get().dismissToast(id), 3200);
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
    });
    void api.setSetting("last_project_id", String(id));
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

  async createChapter() {
    const { activeProjectId, chapters } = get();
    if (activeProjectId == null) return;
    const saved = await get().saveNow();
    if (!saved) {
      get().toast("保存失败，已取消新建，避免丢稿", "error");
      return;
    }
    if (get().multi) get().cancelMulti();
    const title = `第${chineseNumber(chapters.length + 1)}章 未命名`;
    const chapter = await api.createChapter(activeProjectId, title);
    set((s) => ({
      chapters: [...s.chapters, chapter],
      activeChapterId: chapter.id,
      draft: { title: chapter.title, content: "" },
      dirty: false,
      selection: null,
      gen: null,
      multi: null,
      savedAt: Date.now(),
      aiOpen: s.aiOpen,
    }));
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === s.activeProjectId ? { ...p, chapterCount: s.chapters.length } : p
      ),
    }));
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

  async saveEntity(entity) {
    const saved = await api.upsertEntity(entity);
    set((s) => {
      const exists = s.entities.some((e) => e.id === saved.id);
      const entities = exists
        ? s.entities.map((e) => (e.id === saved.id ? saved : e))
        : [...s.entities, saved];
      return { entities };
    });
    get().toast("设定已保存", "success");
  },

  async removeEntity(id) {
    await api.deleteEntity(id);
    set((s) => ({ entities: s.entities.filter((e) => e.id !== id) }));
    get().toast("设定已删除");
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

    const quick = QUICK_ACTIONS.find((a) => a.kind === kind);
    const finalInstruction = instruction?.trim() || quick?.instruction || "";
    const anchor =
      kind === "rewrite"
        ? undefined
        : (s.selection?.end ?? s.caret ?? s.draft.content.length);

    // Keyword retrieval over earlier chapters + open plot threads.
    let retrieved: { title: string; text: string }[] = [];
    if (kind !== "rewrite" && s.draft.content.length > 200) {
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
      selection: s.selection ?? undefined,
      anchor,
      contextWindow: profile.contextWindow,
      promptTemplate: s.promptTemplate,
      maxTokens: profile.maxTokens,
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
    };
    set({ gen, aiOpen: true });
    try {
      await api.generate({
        requestId,
        profileId: profile.id,
        messages: built.messages,
        temperature: profile.temperature,
        maxTokens: profile.maxTokens,
      });
    } catch (err) {
      set((cur) =>
        cur.gen && cur.gen.id === requestId
          ? { gen: { ...cur.gen, status: "error", error: String(err) } }
          : {}
      );
    }
  },

  async cancelAI() {
    const gen = get().gen;
    if (!gen) return;
    await api.cancelGeneration(gen.id);
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

    await get().applyGenerated(text, {
      anchor: gen.anchor,
      selection: gen.kind === "rewrite" ? gen.selection : undefined,
      reason: gen.kind === "rewrite" ? "AI 改写前" : "AI 续写前",
    });
    set({ gen: { ...gen, applied: true } });
  },

  async applyGenerated(text, opts) {
    const s = get();
    if (!s.draft || s.activeChapterId == null) return;

    // Snapshot before touching the manuscript so every AI edit can be undone.
    if (s.draft.content.trim().length > 0) {
      try {
        await api.createSnapshot(s.activeChapterId, opts?.reason ?? "AI 写入前");
      } catch (err) {
        get().toast(`快照失败，仍继续应用：${err}`, "error");
      }
    }

    const cur = get();
    if (!cur.draft) return;
    const content = cur.draft.content;

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

    ids.forEach((id, i) => {
      const temperature = Math.min(
        1.5,
        Math.max(0, profile.temperature + (i - 1) * 0.12)
      );
      void api
        .generate({
          requestId: id,
          profileId: profile.id,
          messages: built.messages,
          temperature,
          maxTokens: profile.maxTokens,
        })
        .catch((err) => {
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
      if (it.status === "streaming") void api.cancelGeneration(it.id);
    });
    set({ multi: null });
  },

  discardAI() {
    const gen = get().gen;
    if (gen?.status === "streaming") void api.cancelGeneration(gen.id);
    set({ gen: null });
  },

  async restoreSnapshot(id) {
    try {
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
      get().toast("已恢复到所选版本，可再次从历史里恢复", "success");
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
      chapter.wordCount > chapter.summaryWords * 1.6 + 200;
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
    }));
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
