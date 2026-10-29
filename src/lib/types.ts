export interface Project {
  id: number;
  title: string;
  synopsis: string;
  styleGuide: string;
  /** 文风预设：light / web / literary / romance / custom */
  voice: "light" | "web" | "literary" | "romance" | "custom";
  /** 可选：一段喜欢的文字，作为语感样本 */
  styleSample: string;
  pov: string;
  genre: string;
  targetWords: number;
  /** 每章目标字数：决定「写完本章」写多长，与全书目标分开 */
  chapterWords: number;
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

/** 多候选自动评估结果 */
export interface CandidateJudgement {
  /** 胜出版本号，从 1 开始 */
  best: number;
  reason: string;
  /** 每版 0-100，顺序与传入的候选一致 */
  scores: number[];
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

export type GenKind =
  | "continue"
  | "finish"
  | "expand"
  | "rewrite"
  | "rewriteChapter"
  | "outline"
  | "custom";

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
  /** 和 AI 写手对话时，这条回复属于哪一轮 */
  chatTurn?: number;
  /** 本次生成的目标字符数（含标点），用来判断写完没写够 */
  targetChars?: number;
  /** 开始生成时正文已有的字符数（不含空白），校验缺口时的基线 */
  baseChars?: number;
  /** 已经自动补写了几轮 */
  rounds?: number;
  /** 当前这一轮真正在跑的 requestId；自动补写会换 id，gen.id 保持不变 */
  requestId?: string;
  /** 正在自动补写（正文没写够，接着让模型往下写） */
  continuing?: boolean;
}

/** 与 AI 写手的一轮对话。 */
export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  status: "done" | "streaming" | "error";
  error?: string;
  /** 回复里提出的写作动作，用户点一下就能执行 */
  actions?: ChatAction[];
  /** 回复自带的章节标题（写正文时用） */
  title?: string;
  /** 用户是否已经把这条回复写进正文 */
  applied?: boolean;
  /** 回复里提出要改/补的设定卡 */
  entityPatches?: EntityPatch[];
  /** 这些设定卡是否已经写进设定库 */
  entitiesApplied?: boolean;
}

/** 一轮对话里提出的设定卡改动，按名字定位。 */
export interface EntityPatch {
  name: string;
  /** 是否已存在于设定库 */
  existing: boolean;
  kind?: EntityKind;
  role?: string;
  description?: string;
  aliases?: string;
  speechStyle?: string;
  speechLength?: "short" | "medium" | "long";
  speechWords?: string;
  speechTaboo?: string;
}

export type ChatActionKind = "continue" | "finish" | "rewriteChapter" | "outline";

export interface ChatAction {
  id: string;
  kind: ChatActionKind;
  label: string;
  /** 写死给模型的追加指令，例如「按刚才商量的方向续写」 */
  instruction?: string;
  done?: boolean;
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
  status: "streaming" | "done" | "stopped" | "error";
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
