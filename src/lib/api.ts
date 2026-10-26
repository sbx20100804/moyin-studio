import { invoke } from "@tauri-apps/api/core";
import type {
  Chapter,
  ChapterMeta,
  ChatMessage,
  DailyStat,
  Entity,
  Profile,
  ProfileInput,
  Project,
  Retrieved,
  SaveResult,
  SearchHit,
  Snapshot,
  SnapshotMeta,
  Thread,
} from "./types";

export const api = {
  // window
  startDrag: () => invoke<void>("win_start_drag"),
  minimize: () => invoke<void>("win_minimize"),
  toggleMaximize: () => invoke<boolean>("win_toggle_maximize"),
  isMaximized: () => invoke<boolean>("win_is_maximized"),
  close: () => invoke<void>("win_close"),

  // projects
  listProjects: () => invoke<Project[]>("list_projects"),
  createProject: (title: string, genre: string) =>
    invoke<Project>("create_project", { title, genre }),
  updateProject: (project: Project) => invoke<void>("update_project", { project }),
  deleteProject: (id: number) => invoke<void>("delete_project", { id }),

  // chapters
  listChapters: (projectId: number) =>
    invoke<ChapterMeta[]>("list_chapters", { projectId }),
  getChapter: (id: number) => invoke<Chapter>("get_chapter", { id }),
  createChapter: (projectId: number, title: string) =>
    invoke<ChapterMeta>("create_chapter", { projectId, title }),
  saveChapter: (id: number, title: string, content: string) =>
    invoke<SaveResult>("save_chapter", { id, title, content }),
  updateChapterMeta: (
    id: number,
    patch: {
      title?: string;
      summary?: string;
      outline?: string;
      volume?: string;
      status?: string;
    }
  ) => invoke<void>("update_chapter_meta", { id, ...patch }),
  deleteChapter: (id: number) => invoke<void>("delete_chapter", { id }),
  reorderChapters: (ids: number[]) => invoke<void>("reorder_chapters", { ids }),

  // entities
  listEntities: (projectId: number) =>
    invoke<Entity[]>("list_entities", { projectId }),
  upsertEntity: (entity: Entity) => invoke<Entity>("upsert_entity", { entity }),
  deleteEntity: (id: number) => invoke<void>("delete_entity", { id }),

  // profiles
  listProfiles: () => invoke<Profile[]>("list_profiles"),
  saveProfile: (profile: ProfileInput) => invoke<Profile>("save_profile", { profile }),
  deleteProfile: (id: number) => invoke<void>("delete_profile", { id }),
  setDefaultProfile: (id: number) => invoke<void>("set_default_profile", { id }),
  listModels: (profileId: number) => invoke<string[]>("list_models", { profileId }),
  testProfile: (profileId: number) => invoke<string>("test_profile", { profileId }),

  // settings
  getSetting: (key: string) => invoke<string | null>("get_setting", { key }),
  setSetting: (key: string, value: string) =>
    invoke<void>("set_setting", { key, value }),

  // ai
  generate: (args: {
    requestId: string;
    profileId: number;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }) => invoke<void>("generate", { req: args }),
  cancelGeneration: (requestId: string) =>
    invoke<void>("cancel_generation", { requestId }),

  // snapshots
  createSnapshot: (chapterId: number, reason: string) =>
    invoke<SnapshotMeta>("create_snapshot", { chapterId, reason }),
  listSnapshots: (chapterId: number) =>
    invoke<SnapshotMeta[]>("list_snapshots", { chapterId }),
  getSnapshot: (id: number) => invoke<Snapshot>("get_snapshot", { id }),
  restoreSnapshot: (id: number) => invoke<SaveResult>("restore_snapshot", { id }),

  // export / import
  exportBook: (
    projectId: number,
    format: "txt" | "md" | "docx",
    chapterIds?: number[]
  ) =>
    invoke<string | null>("export_book", {
      projectId,
      format,
      chapterIds: chapterIds ?? null,
    }),
  importBook: () => invoke<Project | null>("import_book"),

  // deleted chapters (soft delete / recycle bin)
  listDeletedChapters: (projectId: number) =>
    invoke<ChapterMeta[]>("list_deleted_chapters", { projectId }),
  restoreChapter: (id: number) => invoke<void>("restore_chapter", { id }),
  purgeChapter: (id: number) => invoke<void>("purge_chapter", { id }),

  // plot threads
  listThreads: (projectId: number) =>
    invoke<Thread[]>("list_threads", { projectId }),
  upsertThread: (thread: Thread) => invoke<Thread>("upsert_thread", { thread }),
  deleteThread: (id: number) => invoke<void>("delete_thread", { id }),

  // stats / search / retrieval
  dailyStats: (days: number) => invoke<DailyStat[]>("daily_stats", { days }),
  searchChapters: (projectId: number, query: string, limit = 50) =>
    invoke<SearchHit[]>("search_chapters", { projectId, query, limit }),
  retrieveContext: (
    projectId: number,
    query: string,
    excludeChapterId: number,
    limit = 4
  ) =>
    invoke<Retrieved[]>("retrieve_context", {
      projectId,
      query,
      excludeChapterId,
      limit,
    }),

  summarizeChapter: (chapterId: number, profileId: number) =>
    invoke<string>("summarize_chapter", { chapterId, profileId }),

  generateOutline: (chapterId: number, profileId: number) =>
    invoke<string>("generate_outline", { chapterId, profileId }),

  extractEntities: (chapterId: number, profileId: number) =>
    invoke<Entity[]>("extract_entities", { chapterId, profileId }),
};
