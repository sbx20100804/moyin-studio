export interface Project {
  id: number;
  title: string;
  synopsis: string;
  styleGuide: string;
  /** 文风预设：light / web / literary / custom */
  voice: "light" | "web" | "literary" | "custom";
  /** 可选：一段喜欢的文字，作为语感样本 */
  styleSample: string;
  pov: string;
  genre: string;
  targetWords: number;
  accent: string;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
  chapterCount: number;
}

export interface ChapterMeta {
  id: number;
  projectId: number;
  title: string;
  summary: string;
  outline: string;
  volume: string;
  position: number;
  status: string;
  wordCount: number;
  summaryWords: number;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter extends ChapterMeta {
  content: string;
}

export type EntityKind = "character" | "location" | "faction" | "item" | "concept";

export interface Entity {
  id: number;
  projectId: number;
  kind: EntityKind;
  name: string;
  aliases: string;
  role: string;
  description: string;
  /** 口癖 / 语气（仅人物） */
  speechStyle: string;
  /** short / medium / long */
  speechLength: "short" | "medium" | "long";
  /** 常用词，逗号分隔 */
  speechWords: string;
  /** 禁用词，逗号分隔 */
  speechTaboo: string;
  updatedAt: string;
}

export interface SettingsCandidate {
  kind: EntityKind;
  name: string;
  aliases: string;
  role: string;
  description: string;
  speechStyle: string;
  speechLength: "short" | "medium" | "long";
  speechWords: string;
  speechTaboo: string;
  /** 原文里支撑这条设定的一句话 */
  source: string;
}

export interface Profile {
  id: number;
  name: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  isDefault: boolean;
  hasKey: boolean;
}

export interface ProfileInput {
  id: number;
  name: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  isDefault: boolean;
  apiKey?: string | null;
}

export interface SaveResult {
  id: number;
  wordCount: number;
  updatedAt: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type GenKind = "continue" | "rewrite" | "outline" | "custom";

export interface Selection {
  start: number;
  end: number;
  text: string;
}

export interface GenDraft {
  id: string;
  kind: GenKind;
  text: string;
  reasoning?: string;
  status: "idle" | "streaming" | "done" | "stopped" | "error";
  error?: string;
  instruction: string;
  selection?: Selection;
  anchor?: number;
  profileName: string;
  startedAt: number;
  applied?: boolean;
}

export interface SnapshotMeta {
  id: number;
  chapterId: number;
  projectId: number;
  title: string;
  reason: string;
  wordCount: number;
  preview: string;
  createdAt: string;
}

export interface Snapshot extends SnapshotMeta {
  content: string;
}

export interface Candidate {
  id: string;
  text: string;
  status: "streaming" | "done" | "error";
  error?: string;
}

export interface Thread {
  id: number;
  projectId: number;
  title: string;
  detail: string;
  status: string;
  setupChapterId: number | null;
  payoffChapterId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DailyStat {
  day: string;
  words: number;
}

export interface SearchHit {
  chapterId: number;
  title: string;
  snippet: string;
  offset: number;
  position: number;
}

export interface Retrieved {
  title: string;
  text: string;
}
