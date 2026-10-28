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
export const DEFAULT_SYSTEM_TEMPLATE = `你在写长篇小说《{{title}}》，读者是普通人，不是评委。
类型：{{genre}}；视角：{{pov}}。
文风：{{style}}

把这一章写得像人写的：
1. 写具体的东西：动作、声音、气味、身体反应、手边的物件；不写抽象的情绪总结。
2. 让对话承担大部分信息。人物说话像真人：会停顿、会答非所问、会嘴硬。
3. 句子长短不齐，允许短句、断句、单句成段；不要每段都工整、都三行。
4. 不解释、不升华、不总结，不在正文里评价人物或点明主题。
5. 避开套语：仿佛、似乎、一丝、不禁、微微、缓缓、不由得、莫名的、难以言喻。

硬性约束：
1. 严格延续既有设定、人物性格、称谓、时间线；不得擅自新增重大设定、改名或改变人物关系。
2. 若资料之间有冲突，以【人物与设定】和【本章章纲】为准。
3. 只输出小说正文：不要标题、序号、markdown、括号说明，不要“好的”“以下是”，也不要复述要求。
4. 与上文自然衔接，不重复已有段落，不复述前情，不写“未完待续”。
5. 对白使用中文引号“”，段落之间空一行。
6. 不要询问、不要确认、不要解释，不要输出“收到”“好的”“以下是”“如果你想……”这类话；资料不足就按已有设定直接写，不要停下来要作者补充。`;

export type VoiceId = "light" | "web" | "literary" | "custom";

export interface VoicePreset {
  id: VoiceId;
  label: string;
  hint: string;
  style: string;
  rules: string;
}

/**
 * Voice presets appended to the system prompt. This is where "像人写的"
 * actually gets enforced — the base template stays editable, these rules
 * carry the genre-specific craft.
 */
export const VOICE_PRESETS: Record<VoiceId, VoicePreset> = {
  light: {
    id: "light",
    label: "轻小说",
    hint: "对话推进、心理吐槽、短句单句成段",
    style: "轻快、口语化，贴近视角人物，带一点自嘲和吐槽。",
    rules: `【文风执行细则 · 轻小说】
写成像日轻中译的连载：短、快、有吐槽，不是作文。
1. 视点：第一人称或第三人称限知。叙述者有自己的语气，会吐槽、会自嘲；只写视角人物知道的事，不写“他不知道的是”。
2. 对话：对话与动作占七成以上。每句对话独立成段，前后夹一个动作、表情或视线；允许打断、抢话、答非所问；不要每句都用“说道/问道”标注，用动作和语气代替。
3. 人物区分：每个角色有固定称呼、口癖和句长；遮住名字也能认出谁在说话。
4. 独白：短，单独成段或用（）标出；写吐槽和犹豫，不写长篇心理分析。
5. 段落：一段不超过三行，允许单句成段；拟声词、短感叹单独成段。
6. 场景：教室、走廊、天台、社团活动室、便利店、车站；写具体动作与距离感（并肩走、递东西、视线躲开）。
7. 情绪：用动作、独白和对话承载；不写“心中五味杂陈”这类总结。
8. 节奏：每 800-1200 字一个小转折或笑点；章末停在反转、误会或一句吐槽上。
9. 禁止：文学腔长句、成段环境描写、解释性旁白、每段工整对仗、NPC 式惊叹、排比升华、“空气仿佛凝固”“嘴角勾起一抹”“眼神深邃”。
10. 禁止套语：仿佛、似乎、一丝、不禁、微微、缓缓、不由得、莫名的、难以言喻。
11. 语感示例（只学节奏，不要照搬内容）：
“你迟到了三分钟。”
她头也不抬，把面包往我桌上一放。
（……这算什么，施舍吗？）
“路上有只猫挡道。”
“编。”`,
  },
  web: {
    id: "web",
    label: "网文",
    hint: "快节奏、强钩子、行动多于心理",
    style: "直给、利落、爽点清晰，少绕弯子。",
    rules: `【文风执行细则 · 网文】
1. 开篇 200 字内进入冲突或目标，不铺垫环境。
2. 主角每章至少做一次主动选择，不被动挨打。
3. 信息给读者，不藏着掖着；能力规则要清楚，代价要出现。
4. 对话短促，多行动少心理；爽点前先压，压完立刻给。
5. 每章结尾留钩子：新敌人、新线索、新误会。
6. 不用书面语堆砌；少用“仿佛/似乎/一丝/不禁/缓缓”。`,
  },
  literary: {
    id: "literary",
    label: "严肃文学",
    hint: "克制、留白、以物写情",
    style: "克制、准确，意象具体，不抒情。",
    rules: `【文风执行细则 · 严肃文学】
1. 克制：不解释情绪，用动作、物件、留白承载。
2. 句子长短交错，允许长句，但每句都要有信息。
3. 对话少而准，潜台词多于字面。
4. 不写总结段，不写主题升华。
5. 比喻要新，宁可不用。`,
  },
  custom: {
    id: "custom",
    label: "自定义",
    hint: "只用你写的文风说明",
    style: "",
    rules: "",
  },
};

export const DEFAULT_STYLE = "自然流畅，像人写的，避免套语。";

/** Always appended, even with a custom template, so the model never chats back. */
export const OUTPUT_DISCIPLINE = `【输出纪律】
只输出小说正文。不要询问、不要确认、不要解释，不要输出“收到”“好的”“以下是”“如果你想……”之类的话；资料不足就按已有设定直接写，不要停下来要作者补充。`;

/** Extra craft notes for specific genres (appended to the system prompt). */
export const GENRE_HINTS: Record<string, string> = {
  "日本校园轻小说": `【题材补充 · 日本校园轻小说】
场景以学校与放学后为主：教室、走廊、天台、社团活动室、便利店、车站。日常里埋小事件，靠对话和吐槽推进；青春感来自具体动作与距离感（并肩走、递东西、视线躲开），不要写成职场或黑暗奇幻。文化祭、体育祭、夏日祭、换座位、值日都可以当节点。`,
};

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
    voiceCount: number;
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

function continueTask(length: number, voice: VoiceId) {
  const extra =
    voice === "light"
      ? "- 优先用对话或动作接住，不要用一段环境描写开场；允许单句成段。"
      : voice === "web"
        ? "- 直接推进冲突或目标，不要回顾；动作多于心理。"
        : "- 接住最后一句的语气，不要急着解释。";
  return `【任务】从【续写从这里开始 ↓】标记之后直接续写，约 ${length} 字。
- 承接最后一句的语感、节奏与视角，不跳场、不总结。
- 这一段要有自己的小起伏：一个动作、一次试探、或一个没被说出口的念头。
${extra}
- 结尾停在钩子上，不要收束整章。
不要重复上文最后一段。直接输出正文，不要询问、不要确认、不要解释。`;
}

function startTask(length: number, voice: VoiceId) {
  const opening =
    voice === "light"
      ? "先用一句对白或一个具体动作开场，不要环境铺陈；允许单句成段。"
      : voice === "web"
        ? "第一段就进入冲突或目标，不要铺垫。"
        : "从一个具体的动作或物件开始，不要先讲背景。";
  return `【任务】本章还没有正文。从第一段开始写，约 ${length} 字。
- ${opening}
- 用【人物与设定】【本章章纲】里已有的信息推进；名字、称谓按给定内容，不要自行改名。
- 如果资料不足以交代某件事，就用最自然的写法带过，不要停下来提问。
- 只输出正文，不要“收到”“好的”“以下是”，不要解释或询问作者。`;
}

function rewriteTask(instruction: string) {
  return `【任务】只改写表达，不改情节、信息、人名地名；保持原有视角与时态。
改写要求：${instruction}
【输出要求】只输出改写后的正文，段落数与原文大致相当。`;
}

const VOICE_LENGTH: Record<VoiceId, number> = {
  light: 650,
  web: 950,
  literary: 750,
  custom: 700,
};

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
  const capChars = Math.floor(capTokens * 1.35);

  const voiceId: VoiceId =
    project.voice && project.voice in VOICE_PRESETS ? project.voice : "light";
  const voice = VOICE_PRESETS[voiceId];
  const style = project.styleGuide.trim() || voice.style || DEFAULT_STYLE;
  const template = opts.promptTemplate?.trim() || DEFAULT_SYSTEM_TEMPLATE;
  const base = renderTemplate(template, {
    title: project.title,
    genre: project.genre || "未指定",
    pov: project.pov || "第三人称",
    style,
  });
  const hint = project.genre?.includes("轻小说")
    ? GENRE_HINTS["日本校园轻小说"] ?? ""
    : "";
  const system = [base, voice.rules, hint, OUTPUT_DISCIPLINE]
    .filter(Boolean)
    .join("\n\n");

  const sceneText = `${tail(content, 3000)}\n${chapter.outline}\n${selection?.text ?? ""}`;
  const scored = [...entities]
    .map((e) => ({ e, score: entityScore(e, sceneText) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (KIND_ORDER[a.e.kind] ?? 9) - (KIND_ORDER[b.e.kind] ?? 9);
    });
  const ranked = scored.map((x) => x.e);

  const hasVoice = (e: Entity) =>
    Boolean(
      e.speechStyle.trim() ||
        e.speechWords.trim() ||
        e.speechTaboo.trim() ||
        (e.speechLength && e.speechLength !== "medium")
    );
  const voiced = scored.filter((x) => x.e.kind === "character" && hasVoice(x.e));
  const appearing = voiced.filter((x) => x.score > 0).map((x) => x.e);
  // 只给真正在场景里出现的人物注入语气；没人出场就不要硬塞别人的腔调。
  const voiceCharacters = appearing;

  const index = Math.max(0, chapters.findIndex((c) => c.id === chapter.id));
  const prevChapters = chapters.slice(0, index);

  const instruction =
    opts.instruction?.trim() ||
    (kind === "rewrite"
      ? "把这段改得像人写的：删掉套语与解释性句子，把抽象情绪改成动作、对话或身体反应；句子长短错开。情节与信息不变。"
      : "");
  const targetLength = VOICE_LENGTH[voiceId] + (index % 3) * 80;

  const assemble = (budgets: {
    tailB: number;
    sumB: number;
    entN: number;
    ragN: number;
  }) => {
    const parts: string[] = [];

    if (project.synopsis.trim()) {
      parts.push(`【故事梗概】\n${project.synopsis.trim().slice(0, 600)}`);
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

    const voiceLines = voiceCharacters.slice(0, 6).map((e) => {
      const bits: string[] = [];
      if (e.speechStyle.trim()) bits.push(`语气：${e.speechStyle.trim().slice(0, 60)}`);
      if (e.speechLength && e.speechLength !== "medium") {
        bits.push(`句长：${e.speechLength === "short" ? "短" : "长"}`);
      }
      if (e.speechWords.trim()) bits.push(`常用：${e.speechWords.trim().slice(0, 40)}`);
      if (e.speechTaboo.trim()) bits.push(`忌用：${e.speechTaboo.trim().slice(0, 40)}`);
      if (!bits.length) return "";
      return `· ${e.name}｜${bits.join("｜")}`;
    }).filter(Boolean);
    if (voiceLines.length) {
      parts.push(
        `【角色语气（对白要能分辨出是谁在说话，不要人人都一个腔调）】\n${voiceLines.join("\n")}`
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

    const sample = project.styleSample?.trim() ?? "";
    if (sample && (kind === "continue" || kind === "custom")) {
      parts.push(
        `【语感样本（只学语气、节奏与用词习惯，不要照抄内容、人名或情节）】\n${sample.slice(0, 500)}`
      );
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
        parts.push(
          `【本章已写内容（节选，结尾即为续写起点）】\n${context}\n\n【续写从这里开始 ↓】`
        );
        const ask =
          kind === "custom"
            ? instruction || continueTask(targetLength, voiceId)
            : continueTask(targetLength, voiceId);
        parts.push(ask);
      } else if (kind === "custom" && instruction) {
        parts.push(
          `${instruction}\n\n【输出要求】只输出正文，不要询问、不要确认、不要解释。`
        );
      } else {
        parts.push(startTask(targetLength, voiceId));
      }
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
      voiceCount: voiceLines.length,
    };
  };

  const available = Math.max(1200, Math.floor((contextWindow - reserve) * 1.35));
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

  let user = built.user;
  // 兜底：系统提示、梗概、章纲、语感样本这些固定块本身也可能超预算。
  // 真超了就从前往后丢，保住最近的正文和任务指令。
  if (built.chars > capChars && user.length > 400) {
    const keep = Math.max(500, capChars - system.length);
    if (user.length > keep) {
      const cut = user.length - keep;
      const boundary = user.indexOf("\n\n【", cut);
      const start = boundary !== -1 && boundary - cut < 600 ? boundary + 2 : cut;
      user = "（前文设定过长，已省略）\n\n" + user.slice(start);
      trimmed = true;
    }
  }

  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    meta: {
      chars: system.length + user.length,
      tokens: estimateTokens(system + user),
      entityCount: built.entityCount,
      hasPrev: built.summaryCount > 0,
      summaryCount: built.summaryCount,
      tailChars: built.tailChars,
      outlineChars: built.outlineChars,
      contextWindow,
      tailBudget: budgets.tailB,
      retrievedCount: built.retrievedCount,
      foreshadowCount: opts.foreshadows?.length ?? 0,
      voiceCount: built.voiceCount,
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
    label: "去 AI 味",
    hint: "删套语、改成人话",
    instruction:
      "把这段改得像人写的：删掉“仿佛/似乎/一丝/不禁/微微/缓缓”这类套语和解释性句子；把抽象的情绪改写成动作、对话或身体反应；让句子长短错开，允许单句成段。情节、信息与人名不变。",
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
