import type {
  ChapterMeta,
  ChatMessage,
  Entity,
  GenKind,
  Project,
  Selection,
} from "./types";
import { estimateTokens } from "./format";

const tail = (text: string, n: number) =>
  text.length <= n ? text : text.slice(text.length - n);

/**
 * Default system prompt. Users can override it in 设置 → 创作.
 * Variables: {{title}} {{genre}} {{pov}} {{style}}
 */
export const DEFAULT_SYSTEM_TEMPLATE = `你是一位资深中文小说家，也是作者的合写者与文字编辑。此刻你正在写长篇小说《{{title}}》。
类型：{{genre}}；叙事视角：{{pov}}。
文风：{{style}}

写作准则：
1. 贴着人物的感官与动作写，少用解释性旁白；情绪靠细节和留白，不靠形容词。
2. 句子长短交错，段落短促；每一段只推进一件事。
3. 对白要有潜台词，每个人物说话的方式都应能被认出来是谁。
4. 避免陈词滥调与套语（“仿佛”“似乎”“一丝”“不由得”“缓缓”之类），不要空洞的比喻。
5. 不写总结句（“总之”“可以看出”），不在正文里评价人物或解释主题。

硬性约束：
1. 严格延续既有设定、人物性格、称谓、时间线；不得擅自新增重大设定、改名或改变人物关系。
2. 若资料之间有冲突，以【人物与设定】和【本章章纲】为准。
3. 只输出小说正文：不要标题、序号、markdown、括号说明，不要“好的”“以下是”，也不要复述要求。
4. 与上文自然衔接，不重复已有段落，不复述前情，不写“未完待续”。
5. 对白使用中文引号“”，段落之间空一行。`;

export const DEFAULT_STYLE = "自然流畅，画面感强，避免陈词滥调。";

export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

export interface BuildResult {
  messages: ChatMessage[];
  meta: {
    chars: number;
    tokens: number;
    entityCount: number;
    hasPrev: boolean;
    summaryCount: number;
    tailChars: number;
    outlineChars: number;
    contextWindow: number;
    tailBudget: number;
    retrievedCount: number;
    foreshadowCount: number;
    /** True when context had to be trimmed to fit the window. */
    trimmed: boolean;
  };
}

const KIND_ORDER: Record<string, number> = {
  character: 0,
  location: 1,
  faction: 2,
  item: 3,
  concept: 4,
};

function entityScore(entity: Entity, sceneText: string): number {
  const names = [entity.name, ...entity.aliases.split(/[，,、;；\s]+/)]
    .map((n) => n.trim())
    .filter((n) => n.length >= 2);
  let score = 0;
  for (const name of names) {
    let idx = sceneText.indexOf(name);
    while (idx !== -1) {
      score += 1;
      idx = sceneText.indexOf(name, idx + name.length);
    }
  }
  return score;
}

export interface RetrievedSnippet {
  title: string;
  text: string;
}

function continueTask(length: number) {
  return `【任务】从标记处直接续写，约 ${length} 字。
- 承接最后一句的语感、节奏与视角，不跳场、不总结。
- 这一段要有自己的小起伏：一个动作、一次试探、或一个没被说出口的念头。
- 结尾停在钩子上，不要收束整章。
不要重复上文最后一段。直接从下一句开始。`;
}

function rewriteTask(instruction: string) {
  return `【任务】只改写表达，不改情节、信息、人名地名；保持原有视角与时态。
改写要求：${instruction}
【输出要求】只输出改写后的正文，段落数与原文大致相当。`;
}

export function buildMessages(opts: {
  project: Project;
  chapters: ChapterMeta[];
  entities: Entity[];
  chapter: ChapterMeta;
  content: string;
  kind: GenKind;
  instruction?: string;
  selection?: Selection;
  /** Insertion point for continue/custom; falls back to the end of the chapter. */
  anchor?: number;
  contextWindow?: number;
  promptTemplate?: string;
  maxTokens?: number;
  /** Snippets retrieved from earlier chapters (keyword RAG). */
  retrieved?: RetrievedSnippet[];
  /** Open plot threads to pay off. */
  foreshadows?: string[];
}): BuildResult {
  const { project, chapters, entities, chapter, content, kind, selection, anchor } = opts;

  const contextWindow = Math.max(2048, opts.contextWindow || 32768);
  const reserve = Math.min(4096, opts.maxTokens || 2400) + 900;
  const capTokens = Math.floor(contextWindow * 0.92);
  const capChars = Math.floor(capTokens * 1.6);

  const style = project.styleGuide.trim();
  const template = opts.promptTemplate?.trim() || DEFAULT_SYSTEM_TEMPLATE;
  const system = renderTemplate(template, {
    title: project.title,
    genre: project.genre || "未指定",
    pov: project.pov || "第三人称",
    style: style || DEFAULT_STYLE,
  });

  const sceneText = `${tail(content, 3000)}\n${chapter.outline}`;
  const ranked = [...entities]
    .map((e) => ({ e, score: entityScore(e, sceneText) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (KIND_ORDER[a.e.kind] ?? 9) - (KIND_ORDER[b.e.kind] ?? 9);
    })
    .map((x) => x.e);

  const index = Math.max(0, chapters.findIndex((c) => c.id === chapter.id));
  const prevChapters = chapters.slice(0, index);

  const instruction =
    opts.instruction?.trim() ||
    (kind === "rewrite"
      ? "润色这段文字：去掉多余的形容词与解释，让句子更短、更有画面感，情节与信息不变。"
      : "");
  const targetLength = 600 + (index % 3) * 100;

  const assemble = (budgets: {
    tailB: number;
    sumB: number;
    entN: number;
    ragN: number;
  }) => {
    const parts: string[] = [];

    if (project.synopsis.trim()) {
      parts.push(`【故事梗概】\n${project.synopsis.trim()}`);
    }

    const shown = ranked.slice(0, budgets.entN);
    if (shown.length) {
      const kindLabel: Record<string, string> = {
        character: "人物",
        location: "地点",
        faction: "势力",
        item: "物品",
        concept: "设定",
      };
      const lines = shown.map((e) => {
        const role = [e.role, e.aliases ? `别名：${e.aliases}` : ""]
          .filter(Boolean)
          .join("｜");
        const desc = e.description.trim().replace(/\n+/g, " ").slice(0, 180);
        return `· ${e.name}${role ? `（${role}）` : ""}：${desc || "（暂无描述）"}`;
      });
      parts.push(
        `【${kindLabel[shown[0].kind] ? "人物与设定" : "设定"}】\n${lines.join("\n")}`
      );
    }

    const summaryLines: string[] = [];
    let summaryChars = 0;
    for (let i = prevChapters.length - 1; i >= 0; i -= 1) {
      const prev = prevChapters[i];
      const summary = prev.summary.trim();
      if (!summary) continue;
      const line = `${prev.title}：${summary}`;
      if (summaryChars + line.length > budgets.sumB && summaryLines.length >= 2) break;
      summaryLines.unshift(line);
      summaryChars += line.length;
      if (summaryLines.length >= 8) break;
    }
    if (summaryLines.length) {
      parts.push(`【前情提要（按时间顺序，越靠后越近）】\n${summaryLines.join("\n")}`);
    }

    if (opts.foreshadows?.length) {
      parts.push(
        `【待回收伏笔（可自然推进，不要生硬点破）】\n${opts.foreshadows
          .slice(0, 8)
          .map((f) => `· ${f}`)
          .join("\n")}`
      );
    }

    const outline = chapter.outline.trim();
    if (outline) {
      parts.push(`【本章章纲（尽力贴合，不要机械罗列）】\n${outline.slice(0, 1200)}`);
    }

    const rag = (opts.retrieved ?? []).slice(0, budgets.ragN);
    if (rag.length) {
      parts.push(
        `【相关旧文（只用于保持细节一致，不要照抄）】\n${rag
          .map((r) => `〔${r.title}〕${r.text}`)
          .join("\n")}`
      );
    }

    let tailChars = 0;

    if (kind === "rewrite") {
      const text = selection?.text ?? "";
      tailChars = text.length;
      parts.push(`【待改写原文】\n${text}`);
      parts.push(rewriteTask(instruction));
    } else if (kind === "outline") {
      const context = tail(content, Math.min(1200, budgets.tailB));
      tailChars = context.length;
      if (context.trim()) parts.push(`【近期正文】\n${context}`);
      parts.push(
        `【任务】为《${project.title}》设计接下来的 5 个章节，承接现有情节。\n` +
          "每章一行，格式：第N章 标题 —— 一句话梗概，点出本章的冲突与转折。\n" +
          "只输出这 5 行，不要解释。"
      );
    } else {
      const cursor =
        anchor != null ? Math.min(Math.max(anchor, 0), content.length) : content.length;
      const context = tail(content.slice(0, cursor), budgets.tailB);
      tailChars = context.length;
      if (context.trim()) {
        parts.push(`【本章已写内容（节选，结尾即为续写起点）】\n${context}`);
      }
      const ask =
        kind === "custom"
          ? instruction || continueTask(targetLength)
          : continueTask(targetLength);
      parts.push(ask);
    }

    const user = parts.join("\n\n");
    return {
      user,
      chars: system.length + user.length,
      entityCount: shown.length,
      summaryCount: summaryLines.length,
      tailChars,
      retrievedCount: rag.length,
      outlineChars: outline.length,
    };
  };

  const available = Math.max(1200, Math.floor((contextWindow - reserve) * 1.6));
  let budgets = {
    tailB: Math.min(16000, Math.max(1200, Math.floor(available * 0.52))),
    sumB: Math.min(3000, Math.max(400, Math.floor(available * 0.16))),
    entN: 14,
    ragN: opts.retrieved?.length ? 4 : 0,
  };

  let built = assemble(budgets);
  let trimmed = false;

  // Hard guarantee: never exceed the model window. Sacrifice the cheapest
  // layers first (RAG → entities → summary → tail text).
  for (let i = 0; i < 12 && built.chars > capChars; i += 1) {
    trimmed = true;
    if (budgets.ragN > 0) budgets = { ...budgets, ragN: budgets.ragN - 1 };
    else if (budgets.entN > 4) budgets = { ...budgets, entN: budgets.entN - 2 };
    else if (budgets.sumB > 200) budgets = { ...budgets, sumB: Math.floor(budgets.sumB * 0.75) };
    else if (budgets.tailB > 600) budgets = { ...budgets, tailB: Math.floor(budgets.tailB * 0.8) };
    else break;
    built = assemble(budgets);
  }

  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: built.user },
    ],
    meta: {
      chars: built.chars,
      tokens: estimateTokens(system + built.user),
      entityCount: built.entityCount,
      hasPrev: built.summaryCount > 0,
      summaryCount: built.summaryCount,
      tailChars: built.tailChars,
      outlineChars: built.outlineChars,
      contextWindow,
      tailBudget: budgets.tailB,
      retrievedCount: built.retrievedCount,
      foreshadowCount: opts.foreshadows?.length ?? 0,
      trimmed,
    },
  };
}

export const QUICK_ACTIONS = [
  {
    kind: "continue" as GenKind,
    label: "续写本章",
    hint: "接住最后一句话往下写",
    instruction: "",
  },
  {
    kind: "rewrite" as GenKind,
    label: "润色选中",
    hint: "凝练文字，保留情节",
    instruction: "润色这段文字：去掉多余的形容词与解释，让句子更短、更有画面感，情节与信息不变。",
  },
  {
    kind: "outline" as GenKind,
    label: "推演章纲",
    hint: "接下来五章怎么走",
    instruction: "",
  },
  {
    kind: "custom" as GenKind,
    label: "自定义指令",
    hint: "例如：把这段改成对白",
    instruction: "",
  },
];
