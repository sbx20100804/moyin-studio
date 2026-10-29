import type {
  ChatAction,
  ChapterMeta,
  ChatMessage,
  Entity,
  GenKind,
  Project,
  Selection,
  Thread,
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

export type VoiceId = "light" | "web" | "literary" | "romance" | "custom";

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
    hint: "第一人称、一场戏、短段、吐槽",
    style: "轻快、口语化，贴近视角人物，带一点自嘲和吐槽。",
    rules: `【文风执行细则 · 轻小说（ラノベ）】
按日本网络轻小说（なろう／カクヨム）的实际写法来：短句、单场景、有吐槽。不是作文，也不是散文。

一、一场戏，不要事件串联（最重要）
1. 章纲只是事件清单：只挑其中一件事写成戏，其余留到以后，不要为了“把章纲写完”在一段里塞进三件事。
2. 这场戏的骨架：有人开口向主角要东西 → 主角想推 → 推不掉 → 让步 → 代价落到具体的东西上（接下书包、合上还没动的便当、答应明天再做）。
3. 全场只允许一次真正的转折。转折之前在同一件事上反复加压：先被推回来，再被堵死，最后不得不让。不要靠不断冒出新事件制造起伏。

二、写完自己检查（像流水账就重写）
4. 相邻两段之间，若能塞进“然后”而毫不违和，就是流水账。
5. 每个动作背后要有目的、阻碍或反应，三样都没有就删。
6. 时间直接跳：“午前六时。”“十分钟后。”“第二天午休。”不写过程。
7. 禁止“先……然后……接着……最后……”，禁止“起身—走过去—推开门”这类没有阻碍的动作链。

三、段落与节奏
8. 一段一件事，多数段落一到两句、二十到四十字；允许一个词成段（“体育祭。”“夕莉。”）。
9. 对白独立成段，与叙述交替；不要连续四段以上都是对白，也不要连续三段都是叙述。
10. 对白占四到五成，不要写到七成——通篇对话会变成聊天记录，缺了地の文，一眼就看得出是机器写的。
11. 短句为主，长短交错；能砍的形容词全砍。

四、叙述
12. 叙述者就是“我”，地の文也带我的口气，允许吐槽、自嘲、说半句。
13. 不写“我心里很难受”，写别人怎么反应：表情、手上的动作、沉默、换了称呼。
14. 情绪落在物件和行为上：冷掉的便当、塞进手里的书包、打到一点半的电话。

五、对白
15. 每句对白都要有目的：要东西、推责任、试探、掩饰、撒娇。纯交换信息的对白删掉。
16. 三句里至少一句不按字面回答：回避、反问、说反话、抢话，或者干脆不说话。
17. 遮住名字也要能认出谁在说话；称呼变化要当事件用。

六、具体，不造气氛
18. 每三百字至少一个能看见的物件或动作。
19. 禁用：仿佛、似乎、一丝、不禁、微微、缓缓、不由得、莫名的、难以言喻；禁用“空气仿佛凝固”“嘴角勾起一抹”“眼神深邃”。
20. 不写总结段，不写升华，不写“他不知道的是”。

七、开头与收尾
21. 第一段就进入已经在发生的事，或用一句怪话开场；不要从起床、走路、进教室写起。
22. 结尾停在刚被说出口的一个具体事实、一句台词或一个决定上，不要“隐约不安”。

八、语感（只学节奏，不要照抄情节）
示例一：
“英语的作业，今天要交。”
电话那头理直气壮。我看了一眼闹钟，六点零五。
（……昨天说已经写完了的是谁。）
“你昨天说写完了。”
“那是数学。”
“英语也说完了。”
“……悠星真啰嗦。”
最后还是我爬起来，一题一题讲给她听。讲到第四题，她开始说起昨天的电视剧。
挂掉电话，七点十分。桌上自己那份作业，一页没动。

示例二：
“这个，帮我拿一下。”
书包塞过来的时候，我还在系鞋带。
“你自己没手？”
“有啊。可是我要看手机。”
她真的低头看手机了，走得比我还慢。
我抱着两个书包走了一段，听见她在后面小声说：
“……谢谢。”
（现在说这个，太晚了。）`,
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
  romance: {
    id: "romance",
    label: "言情",
    hint: "关系位移、三拍、克制的对白",
    style: "克制、具体，情绪落在动作、距离和物件上。",
    rules: `【文风执行细则 · 言情】
写关系，不写事件清单。读者要看的不是他们今天做了几件事，而是两个人之间的距离有没有动。

一、一章一场戏，只有一次位移
1. 章纲只是事件清单：只挑其中一件事写成戏，其余留到以后。
2. 这场戏结束时，两人的关系必须移动一格：靠近、退开、错认，或确认。位移要用动作落地（谁先松手、谁先走、伞倾向谁），不许用“她终于明白了”总结。
3. 全场只允许一次真正的转折。转折前在同一件事上加压：一次试探、一次被避开、一次不得不开口。

二、三拍：现状 → 越界 → 收回或确认
4. 第一拍交代此刻的处境，一句话就够（她在等，他还没来）。
5. 第二拍必须有一次越界：一个不该做的动作、一句不该说的话、一件不该带来的东西。
6. 第三拍不许圆满收场：要么收回，要么把话岔开，要么让第三个人出现。

三、情绪的物理刻度
7. 情绪只准写成可测量的东西：距离（半步、三厘米）、时间（两秒、第七分钟）、动作（指尖在杯壁上磨）、物件（凉掉的汤、被捏皱的收据）。
8. 禁止直接命名情绪：“她很难过”“他很愧疚”一律改成身体反应或行为。允许生理反应（喉咙发紧、耳根热、心跳乱一拍），但一章最多两次。

四、叙述者会撒谎
9. 视角人物说的话可以和心里想的不一样；让读者从细节看出矛盾（嘴上说不在意，却记得他几点下班）。
10. 不替读者解释心理：“其实她只是……”这类句子删掉。

五、对白
11. 每句对白至少做一件事：试探、说反话、拿第三个人当刀（“苏念今天也来了”）、假装没听懂。
12. 重要的话不要一次说完：被打断、被咽回去、说到一半改口。
13. 三个人在场时，让其中一个人不说话——沉默也是台词。

六、收尾
14. 停在关系的变化上：一个称呼变了、一把伞倾向了别人、一通没接的电话。不要停在“她隐约觉得不安”。

七、禁止
15. 禁止：仿佛、似乎、一丝、不禁、微微、缓缓、不由得、难以言喻；“空气凝固”“嘴角勾起”“眼神深邃”“心里五味杂陈”。
16. 不写总结段、不写升华、不写“多年以后”。

【示例（只学节奏，不要照抄情节）】
“汤凉了。”
她没说这是自己熬的。保温桶搁在他公司楼下的花坛边，盖子上凝了一圈水汽。
“等多久了？”
“刚到。”
手机在包里亮了一下——三小时前那条“我在楼下”，还挂着未读。
他没接保温桶，先看了一眼手表。
（……赶时间啊。）
“你忙的话，我放这儿。”
“放这儿会凉。”
“那就别喝了。”
她转身走了两步，听见身后塑料盖被拧开的声音。
“咸了。”
“我没放盐。”
“我说的是你。”`,
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

/**
 * 原创的日轻风格范文，用来一键填进「语感样本」。
 * 不是任何已出版作品的原文，避免版权问题；用户可以换成自己合法持有的段落。
 */
export const LIGHT_STYLE_SAMPLES: { label: string; text: string }[] = [
  {
    label: "教室",
    text: `“昨天那封信，是你放的吧。”
她把书包往桌上一放，没坐下。
（……来了。）
“什么信。”我说。
“就是你假装没看见、塞进我鞋柜的那封。”
窗外有人在喊值日生。她没回头，手指在桌沿敲了两下。
“我鞋柜里只有鞋。”我说，“你翻我鞋柜了？”
她终于看我，眼睛眯起来。
“所以你没否认信。”`,
  },
  {
    label: "天台",
    text: `天台的门锁着，但锁是坏的。
她坐在水塔阴影里，膝盖上摊着一本没翻开的书。
“你迟到了。”
“你约的是午休。”
“午休已经过去十二分钟。”
我在她旁边坐下，铁皮被晒得发烫。
“找我有事？”
“没事。”她把书合上，“就是想知道你会不会来。”`,
  },
  {
    label: "便利店",
    text: `冷柜的灯坏了一半，饭团那排暗暗的。
“最后一个。”她把手里的饭团举起来，像举奖杯。
“你抢的。”
“我先看到的。”
“你从后门进来的时候，我还在挑饮料。”
她低头看了眼饭团，又看我。
“那分你一半。”
“饭团怎么分一半。”
“用牙。”`,
  },
];

/** Always appended, even with a custom template, so the model never chats back. */
export const OUTPUT_DISCIPLINE = `【输出纪律】
只输出小说正文。不要询问、不要确认、不要解释，不要输出“收到”“好的”“以下是”“如果你想……”之类的话；资料不足就按已有设定直接写，不要停下来要作者补充。`;

/**
 * 「有趣」不是文笔问题，是事件密度与欲望/阻力的问题。
 * 这几条每次生成都追加，避免模型把「写得像人」理解成「写氛围」。
 */
export const INTEREST_RULES = `【让读者想往下读】
1. 这一场必须有人想要一个具体的东西（现在就要，拿不到会难受），并且被具体的人、规矩或自己的性格挡住。
2. 整段只允许一次真正的转折，转折要演出来，不要用“他决定”“她发现”一句话汇报。转折之前在同一件事上反复加压，不要靠不断冒出新事件制造起伏——那是流水账。只有气氛、没有阻力的段落，删掉。
3. 对白不是问答。每三句里至少一句在回避、试探、撒谎、反问或说反话；重要的话不要一次说完。
4. 允许人物犯错、出丑、说蠢话、判断错——有趣来自失控和意外，不来自每句话都得体正确。
5. 结尾留一个具体的未解问题（新事实、新决定、新威胁），不要“他隐约觉得”“似乎有什么”这种空钩子。
6. 具体压过抽象：写得出牌子的汽水、磨破的袖口、谁先移开视线，就不写“复杂的心情”。

【写场景，不写流程】
- 不写没有阻力的日常流程：起床、洗漱、走路、进教室、放书包、点餐、翻书。必须过渡时一句话跳过（“到学校时已经打铃了”），不要逐个动作直播。
- 禁止用“先……然后……接着……随后……最后……”串联动作。用一句对白、一个意外或一个反应打断它。
- 每个动作至少要有：目的、阻碍、反应中的一项。三项都没有的动作，删掉。
- 时间可以跳。没有张力的一段，直接切到下一件正在发生的事。
- 反例（不要这样写）：他起床，洗漱，出门，走到学校，进教室，坐下，拿出课本。
- 正例（这样写）：他冲进教室时鞋带还散着。“你迟到了三分钟。”她把面包往他桌上一放。
- 流水账不是“写了日常”，而是“日常里没有阻力”：同样是早上出门，如果每一步都有人拦住他、向他要东西、让他欠下人情，那就不是流水账；如果只是起床、洗漱、出门、进教室，那就一步都别写。`;

/** Extra craft notes for specific genres (appended to the system prompt). */
export const GENRE_HINTS: Record<string, string> = {
  "日本校园轻小说": `【题材补充 · 日本校园轻小说】
场景以学校与放学后为主：教室、走廊、天台、社团活动室、便利店、车站、图书馆。
不要写“普通的上学日”：在日常里放一个具体的小异常（换座位、谁没来、鞋柜里的东西、贩卖机卖光了），靠对话和动作被发现，不要用旁白宣布。
青春感来自距离：并肩走时谁放慢半步、递东西时手指碰到没有、视线躲开、称呼改口。
文化祭、体育祭、夏日祭、值日、社团合宿都可以当节点；每个节点要有一个具体目标和一个阻碍。
不要写成职场或黑暗奇幻；冲突可以小，但必须具体。`,
  "言情": `【题材补充 · 言情】
读者要的是“差一点”：想靠近又退开，话说了一半。
一场戏只解决一件事：这次见面之后，两人的距离近了还是远了。
用第三个人制造压力（前任、家人、同事、白月光），但别让他抢戏。
冲突来自性格、立场和说不出口的话，不靠车祸、失忆、绝症这类巧合。
环境只用来施压，不用来抒情：雨、冷气、打烊的店、末班车，都要对人物有实际影响。`,
};

/** 题材补充：先精确匹配，再退化成包含匹配（比如“都市言情”也能命中“言情”）。 */
export function genreHint(genre: string | undefined): string {
  const g = (genre ?? "").trim();
  if (!g) return "";
  if (GENRE_HINTS[g]) return GENRE_HINTS[g];
  const hit = Object.entries(GENRE_HINTS).find(
    ([key]) => g.includes(key) || key.includes(g)
  );
  return hit?.[1] ?? "";
}

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
      ? "- 用对白或动作接住，不要用环境描写开场；允许单句成段。\n- 只推进一件事：这一段里不换场、不塞进第二个事件。"
      : voice === "romance"
        ? "- 接住最后一句的情绪，不要解释它；让两人的距离在这一段里移动一格。\n- 情绪用动作、距离、物件写，不要命名。"
        : voice === "web"
          ? "- 直接推进冲突或目标，不要回顾；动作多于心理。"
          : "- 接住最后一句的语气，不要急着解释。";
  return `【任务】从【续写从这里开始 ↓】标记之后直接续写，约 ${length} 字（允许 ${Math.round(
    length * 0.8
  )}—${Math.round(length * 1.2)} 字）。
- 字数是硬指标：写到 ${length} 字左右才收。不够就把这场戏写细（动作、对白来回、具体物件、人物反应），
  但不要用总结句、景物堆砌、心理独白凑字数；也不要把一场戏写成三件事的流水账。
- 承接最后一句的语感、节奏与视角，不跳场、不总结。
- 这一段必须有一场有阻力的戏：谁想要什么、被谁挡住、他做了什么反应。不要用事件清单代替戏，也不要用“一个没说出口的念头”当起伏。
- 不要从起床、走路、进教室这类流程写起；直接切入已经在发生的动作或对白。
- 至少一句对白带潜台词，至少一个具体到能看见的细节（物件、动作、距离）。
- 没有章纲时，自己先定：某人想要什么、谁在挡、这段结束时什么变了，再动笔，但不要把这三句写出来。
${extra}
- 结尾留一个具体的未解问题；不要每段都强行反转，也不要收束整章。
不要重复上文最后一段。直接输出正文，不要询问、不要确认、不要解释。`;
}

/**
 * 写完本章：把这一章收尾，而不是再挤一小段。
 * 字数是硬指标 —— 模型默认只会写几百字，必须把「还差多少」算给它看。
 */
function finishChapterTask(
  voice: VoiceId,
  writtenChars: number,
  targetChars: number,
  hasOutline: boolean
) {
  // 缺口要照实说：已经写了 1900 字就别再要 400 字，模型会白写一段。
  const remain = Math.max(120, targetChars - writtenChars);
  // 提示词里写的字数一律用「中文字数」，别拿含标点、空白的字符数去要求模型，
  // 否则 4500 字的章会让它以为要写 5400。
  const targetWords = Math.round(targetChars / 1.2);
  const remainWords = Math.max(100, Math.round(remain / 1.2));
  const sceneRule =
    voice === "light" || voice === "web" || voice === "romance"
      ? "- 这一章只写一场戏；已经写过的那场不要重述，直接从它结束的地方推进。"
      : "- 保持与上文同一场景与视角，不要重述已经写过的事。";
  return `【任务】把本章写完，不是再写一小段。
- 目标：本章总字数约 ${targetWords} 字。目前已写约 ${Math.round(
    writtenChars / 1.2
  )} 字，还差约 ${remainWords} 字，请把剩下的部分全部写完。
- 「还差 ${remainWords} 字」是硬要求：写到这个量级才收尾。不够就把戏写细（动作、对白来回、具体物件、人物反应），不要用总结句、景物堆砌或心理独白凑字数。
${sceneRule}
${hasOutline ? "- 按【本章章纲】推进：把没写到的那几拍写完，直到章末的钩子落地。章纲几拍没写完，就不许收尾。" : "- 这一章写得短了，就在同一个场景里把冲突推到底，用一个具体的未解问题收尾。"}
- 承接最后一句的语感与视角，不跳场、不总结、不复述前情。
- 写到最后一句就停：章末留一个具体的钩子（一句台词、一个动作、一个新事实），然后结束。
- 不要写「未完待续」，不要写下一章的内容，不要询问、不要确认、不要解释。直接输出正文。`;
}

function startTask(length: number, voice: VoiceId) {
  const opening =
    voice === "light"
      ? "先用一句对白或一个具体动作开场，不要环境铺陈；允许单句成段。"
      : voice === "romance"
        ? "从一个动作或一件带过来的东西开场（一把伞、一只保温桶、一部亮起来的手机），不要先介绍人物关系。"
        : voice === "web"
          ? "第一段就进入冲突或目标，不要铺垫。"
          : "从一个具体的动作或物件开始，不要先讲背景。";
  return `【任务】本章还没有正文。从第一段开始写，约 ${length} 字。
- ${opening}
- 第一段就让人物撞上麻烦，或说出第一句带刺的话；不要从起床、上学、进教室的流程写起。
- 用【人物与设定】【本章章纲】里已有的信息推进；名字、称谓按给定内容，不要自行改名。
- 若章纲为空，自己补一条：目标 → 阻力 → 这段结束时的变化，但不要写出来。
- 如果资料不足以交代某件事，就用最自然的写法带过，不要停下来提问。
- 只输出正文，不要“收到”“好的”“以下是”，不要解释或询问作者。`;
}

function rewriteTask(instruction: string) {
  return `【任务】只改写表达，不改情节、信息、人名地名；保持原有视角与时态。
改写要求：${instruction}
【输出要求】只输出改写后的正文，段落数与原文大致相当。`;
}

/**
 * 扩写：把已有文字变长，不是重写一遍，也不是在后面续写。
 * 加的是能看见的东西（动作、对白来回、物件、反应），不是形容词和内心独白。
 */
function expandTask(
  sourceChars: number,
  targetWords: number,
  voice: VoiceId,
  instruction?: string,
  wholeChapter = false
) {
  const scene = wholeChapter
    ? "- 全章扩写：按原文顺序逐段加密度，不要重排段落，不要合并段落，不要跳过任何一段。"
    : voice === "light" || voice === "romance" || voice === "web"
      ? "- 只在这一场戏里加密度：把被概括掉的动作展开成具体动作，把一句对白变成有来有回的几句。"
      : "- 在同一场景、同一视角里加密度，不要另起场景。";
  return `【任务】扩写【待扩写原文】：把它写成一个更长的版本，不是重写、也不是在后面续写。
- 原文约 ${Math.round(sourceChars / 1.2)} 字，扩写到约 ${targetWords} 字（允许 ${Math.round(
    targetWords * 0.85
  )}—${Math.round(targetWords * 1.2)} 字）。
- 情节、人物、顺序、已有信息全部保留：原文写到的每一件事都还在，一句不删。
- 加的是能看见的东西：动作、对白来回、具体物件、别人的反应、手上的细节。
- 不要用形容词堆砌、景物描写和心理独白凑字数；同一句话不许换个说法说两遍。
- 不许新增设定、人物或事件；原有对白可以拆成几句、中间夹动作，但不改意思。
${scene}
${instruction ? `- 额外要求：${instruction}` : ""}
- 直接输出扩写后的完整正文：不要解释改了什么，不要分段标注，不要加标题。`;
}

function rewriteChapterTask(targetLength: number, sourceChars: number) {
  return `【任务】把【待重写全章】整章重写一遍：只换写法，不改故事。
- 情节、人物、称谓、时间线、场景顺序、每段写的事全部保持原样；不许合并段落、跳过段落或概括。
- 必须写到原文最后一句为止，不能写到一半停下。
- 篇幅与原文相当：原文约 ${sourceChars} 字，目标 ${targetLength}—${Math.round(
    sourceChars * 1.15
  )} 字。
- 按上面的文风细则重写句子节奏、对白与细节；信息量不能变少，也不能新增事件。
- 只输出重写后的完整正文：不要标题、不要分章、不要“以下是”，不要解释改了什么。`;
}

const VOICE_LENGTH: Record<VoiceId, number> = {
  light: 650,
  web: 950,
  literary: 750,
  romance: 800,
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
  /** 写完本章时的目标总字数（章节字数），缺省按每章 2000 字算。 */
  chapterWords?: number;
  /** 续写时希望这一段写多长（字数）；多候选会拆成几段各自传，汇总到目标字数。 */
  segmentWords?: number;
  /** Snippets retrieved from earlier chapters (keyword RAG). */
  retrieved?: RetrievedSnippet[];
  /** Open plot threads to pay off. */
  foreshadows?: string[];
}): BuildResult {
  const { project, chapters, entities, chapter, content, kind, selection, anchor } = opts;

  const contextWindow = Math.max(2048, opts.contextWindow || 32768);
  // 输出额度要按这次真实的 max_tokens 预留。推理模型和长章会开到 8k–16k，
  // 还按 4096 封顶就会让输入把窗口吃满，服务商要么报错，要么把正文截短。
  const outTokens = Math.max(600, opts.maxTokens || 2400);
  const reserve = Math.min(outTokens, Math.floor(contextWindow * 0.5)) + 900;
  // 输入必须给输出留位置：窗口 − 预留额度，再留 5% 给 token 估算误差。
  const capTokens = Math.max(1200, Math.floor((contextWindow - reserve) * 0.95));
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
  const hint = genreHint(project.genre);
  const system = [base, voice.rules, hint, INTEREST_RULES, OUTPUT_DISCIPLINE]
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
  // 多候选会把「目标字数 ÷ 3」作为每段的目标传进来；普通续写仍按文风预设的长度。
  const targetLength = Math.max(
    300,
    opts.segmentWords || VOICE_LENGTH[voiceId] + (index % 3) * 80
  );
  // 写完本章：按「整章目标字数」算缺口，而不是再挤 VOICE_LENGTH 那么一小段。
  const chapterWords = Math.max(600, opts.chapterWords || 2000);
  const chapterTargetChars = Math.round(chapterWords * 1.2);
  const writtenChars = content.replace(/\s/g, "").length;

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
      const lines = shown.map((e) => {
        const role = [e.role, e.aliases ? `别名：${e.aliases}` : ""]
          .filter(Boolean)
          .join("｜");
        const desc = e.description.trim().replace(/\n+/g, " ").slice(0, 180);
        return `· ${e.name}${role ? `（${role}）` : ""}：${desc || "（暂无描述）"}`;
      });
      // 有角色卡就叫「人物与设定」，只有地点/物品就叫「设定」。
      const hasCharacter = shown.some((e) => e.kind === "character");
      parts.push(`【${hasCharacter ? "人物与设定" : "设定"}】\n${lines.join("\n")}`);
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
    if (outline && kind !== "rewrite" && kind !== "expand") {
      parts.push(
        `【本章章纲（事件清单，只取其中一件写成一场戏；其余事件不要提，也不要一句带过）】\n${outline.slice(0, 1200)}`
      );
    }

    const sample = project.styleSample?.trim() ?? "";
    if (sample && (kind === "continue" || kind === "custom")) {
      parts.push(
        `【语感样本（只学语气、节奏与用词习惯，不要照抄内容、人名或情节）】\n${sample.slice(0, 1200)}`
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
    } else if (kind === "expand") {
      // 扩写：有选中就扩选中的那段，没有就把整章扩到「每章字数」。
      const useSelection = Boolean(selection?.text.trim());
      const text = (useSelection ? selection!.text : content).slice(0, 30000);
      tailChars = text.length;
      const sourceWords = Math.round(text.replace(/\s/g, "").length / 1.2);
      const targetWords = useSelection
        ? Math.max(300, sourceWords * 2)
        : Math.max(chapterWords, sourceWords + 300);
      parts.push(
        `【待扩写${useSelection ? "选段" : "全章"}（原文约 ${sourceWords} 字）】\n${text}`
      );
      parts.push(
        expandTask(
          text.replace(/\s/g, "").length,
          targetWords,
          voiceId,
          instruction,
          !useSelection
        )
      );
    } else if (kind === "rewriteChapter") {
      // 整章重写：把全章交给模型换写法，情节与信息不动。
      const text = content.slice(0, 30000);
      tailChars = text.length;
      parts.push(`【待重写全章】\n${text}`);
      parts.push(rewriteChapterTask(targetLength, text.length));
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
        parts.push(
          kind === "finish"
            ? finishChapterTask(voiceId, writtenChars, chapterTargetChars, Boolean(outline))
            : ask
        );
      } else if (kind === "custom" && instruction) {
        parts.push(
          `${instruction}\n\n【输出要求】只输出正文，不要询问、不要确认、不要解释。`
        );
      } else if (kind === "finish") {
        // 空章节也要能一次写完。
        parts.push(finishChapterTask(voiceId, 0, chapterTargetChars, Boolean(outline)));
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
  // 扩写/改写/重写时正文块就是任务本身，先砍辅助层，正文只在不砍就放不下时才缩。
  const textOnTask = kind === "rewrite" || kind === "expand" || kind === "rewriteChapter";
  for (let i = 0; i < 16 && built.chars > capChars; i += 1) {
    trimmed = true;
    if (textOnTask) {
      if (budgets.ragN > 0) budgets = { ...budgets, ragN: budgets.ragN - 1 };
      else if (budgets.entN > 4) budgets = { ...budgets, entN: budgets.entN - 2 };
      else if (budgets.sumB > 200) budgets = { ...budgets, sumB: Math.floor(budgets.sumB * 0.75) };
      else if (budgets.tailB > 600) budgets = { ...budgets, tailB: Math.floor(budgets.tailB * 0.9) };
      else break;
    } else if (budgets.ragN > 0) budgets = { ...budgets, ragN: budgets.ragN - 1 };
    else if (budgets.entN > 4) budgets = { ...budgets, entN: budgets.entN - 2 };
    else if (budgets.sumB > 200) budgets = { ...budgets, sumB: Math.floor(budgets.sumB * 0.75) };
    else if (budgets.tailB > 600) budgets = { ...budgets, tailB: Math.floor(budgets.tailB * 0.8) };
    else break;
    built = assemble(budgets);
  }

  // 兜底：整章重写 / 写完本章这种要交完整正文的任务，正文块不能被砍，
  // 只能从最贵的辅助层（旧文召回 → 语感样本 → 章纲 → 设定卡）往下减。
  for (let i = 0; i < 12 && built.chars > capChars; i += 1) {
    trimmed = true;
    if (budgets.tailB <= 800) break;
    budgets = {
      ...budgets,
      tailB: Math.floor(budgets.tailB * 0.8),
      ragN: Math.max(0, budgets.ragN - 1),
      entN: Math.max(4, budgets.entN - 4),
    };
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

/* ------------------------------------------------------------------ 与 AI 写手对话 */

export interface ChatContextOpts {
  project: Project;
  chapter?: ChapterMeta;
  outline: string;
  content: string;
  entities: Entity[];
  threads: Thread[];
  history: { role: "user" | "assistant"; content: string }[];
}

const CHAT_SYSTEM = `你是这本书的 AI 写手，和作者一起写稿。你不是客服，也不讲写作课。

默认行为：
- 作者让你写，你就直接写正文，不要先讲思路、不要反问、不要等他确认。
- 作者只是问意见，你再讨论。拿不准时，先按「他要正文」处理。
- 中文，句子短。不吹捧、不客套。作者问「好不好」，说清楚好在哪、差在哪，必要时直接反对。

写正文的规矩：
- 承接当前正文最后一个字的语感、视角、时态与人称，不跳场、不总结、不复述前情。
- 一次只推进一场戏，不要在一段里塞三件事。
- 人物说话和设定卡一致；对白要能分辨出谁在说话。
- 老规矩：不要「仿佛/似乎/一丝/不禁/微微/缓缓」这类套语，不写总结句和解释性旁白。
- 作者要标题就先给标题，再给正文。

你要知道的：
- 你能看到作品设定、本章章纲、本章正文，以这些为准，别凭空编人物或设定。

格式：
- 作者要正文时：第一行只写章节标题（像「第二章 借来的笔记」），空一行，从第二行开始写正文。
  用纯文本，不要 # 、不要 markdown、不要加粗。
- 只给意见时：短句分条，不要标题行。
- 纯正文回复不要输出 actions 数组。

改设定卡：
- 作者让你补或改设定时，在回复最后另起一行输出：
{"entities":[{"name":"唐棠","kind":"character","role":"女主·校花","description":"要写进设定卡的完整描述","speechStyle":"…","speechWords":"…","speechTaboo":"…"}]}
- name 必须和设定库里已有的名字完全一致（改已有的就只写要改的字段，这是覆盖不是追加）。
- 新角色要写全 kind 和 description。一次最多 6 条。
- 不要自己编设定库里没有的人：只补作者提到或正文里已经写到的。
- 没有要改的设定就不要输出这个数组。定位用名字就够了，不要输出 id。
- 当你建议一个写作动作时，在回复最后另起一行输出 JSON，最多两个：
{"actions":[{"kind":"continue|finish|rewriteChapter|outline","label":"不超过八个字","instruction":"追加要求，一句话"}]}
含义：continue=从文末接着写一段；finish=把本章按目标字数写完；rewriteChapter=整章换写法；outline=推演接下来五章。
纯正文回复不要输出这个数组。`;

function entityBrief(e: Entity): string {
  const desc = e.description.trim().replace(/\n+/g, " ").slice(0, 90);
  const role = e.role.trim();
  return `· ${e.name}${role ? `（${role}）` : ""}${desc ? `：${desc}` : ""}`;
}

/** 把作品上下文压成写手能看的简报；超长时就近裁切，保住最近的正文。 */
export function buildChatMessages(opts: ChatContextOpts): ChatMessage[] {
  const { project, chapter, outline, content, entities, threads, history } = opts;

  const cast = entities
    .filter((e) => e.kind === "character")
    .slice(0, 12)
    .map(entityBrief);
  const places = entities
    .filter((e) => e.kind !== "character" && e.kind !== "concept")
    .slice(0, 8)
    .map(entityBrief);

  const open = threads
    .filter((t) => t.status === "open")
    .slice(0, 6)
    .map((t) => `· ${t.title}${t.detail.trim() ? `：${t.detail.trim().slice(0, 80)}` : ""}`);

  const parts = [
    `【作品】《${project.title}》`,
    `类型：${project.genre || "未指定"}；视角：${project.pov || "未指定"}；每章约 ${project.chapterWords || 2000} 字`,
    project.synopsis.trim() ? `【梗概】\n${project.synopsis.trim().slice(0, 900)}` : "",
    cast.length ? `【人物】\n${cast.join("\n")}` : "",
    places.length ? `【设定】\n${places.join("\n")}` : "",
    open.length ? `【待回收伏笔】\n${open.join("\n")}` : "",
    chapter ? `【当前章节】${chapter.title}` : "",
    outline.trim() ? `【本章章纲】\n${outline.trim().slice(0, 1200)}` : "",
    content.trim()
      ? `【本章正文（${content.replace(/\s/g, "").length} 字）】\n${tail(content, 6000)}`
      : "【本章正文】还是空的",
  ].filter(Boolean);

  return [
    { role: "system", content: CHAT_SYSTEM },
    { role: "user", content: parts.join("\n\n") },
    { role: "assistant", content: "（我已经读过这本书的设定和当前章节了。说你想聊什么。）" },
    ...history.slice(-24).map((h) => ({
      role: h.role as ChatMessage["role"],
      content: h.content,
    })),
  ];
}

const ACTION_KINDS = ["continue", "finish", "rewriteChapter", "outline"] as const;
type ActionKind = (typeof ACTION_KINDS)[number];

const MD_HEADING = /^\s{0,3}#{1,6}\s+/;
/** 只吃行首的 markdown 列表符号，正文里的数字和小数点不动。 */
const BULLET_PREFIX = /^\s*(?:[-*•]\s+|\d{1,2}[.)]\s+)/;
/** 一串「- xxx」连成列表时才当列表看；单独一行带短横可能是正文里的破折号，不动它。 */
const LIST_HEAVY_RATIO = 0.6;

/**
 * 对话回复里常混着 markdown：强调符号、小标题（「# 第二章 借来的笔记」）、
 * 列表符号。聊天面板按纯文本渲染，这些符号会原样露出来，所以在这里洗掉。
 */
export function cleanChatMarkdown(text: string): string {
  const lines = text.split("\n");
  const nonEmpty = lines.filter((l) => l.trim());
  const bulleted = nonEmpty.filter((l) => BULLET_PREFIX.test(l)).length;
  const isList = nonEmpty.length >= 2 && bulleted / nonEmpty.length >= LIST_HEAVY_RATIO;

  return lines
    .map((line) =>
      line
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/__(.+?)__/g, "$1")
        .replace(MD_HEADING, "")
        .replace(isList ? BULLET_PREFIX : /^\s*[-*•]\s+/, "")
    )
    .join("\n");
}

export interface EntityPatch {
  name: string;
  kind?: string;
  role?: string;
  description?: string;
  aliases?: string;
  speechStyle?: string;
  speechLength?: string;
  speechWords?: string;
  speechTaboo?: string;
}

// actions 和 entities 可能在回复里出现任意次、任意顺序，逐个抠出来再统一拼接正文。
const BLOCK_RE = /\{\s*"(actions|entities)"\s*:\s*\[[\s\S]*?\]\s*\}/g;
const BLOCK_RE_LOOSE = /\{\s*(actions|entities)\s*:\s*\[[\s\S]*?\]\s*\}/g;

/** 把回复末尾那段 actions / entities JSON 摘出来，正文里不留痕迹。 */
export function splitChatActions(raw: string): {
  text: string;
  title?: string;
  actions: Omit<ChatAction, "id">[];
  entities: EntityPatch[];
} {
  const actions: Omit<ChatAction, "id">[] = [];
  const entities: EntityPatch[] = [];
  const tolerant = (s: string) => s.replace(/([{,]\s*)([a-zA-Z_]+)\s*:/g, '$1"$2":');
  const str = (v: unknown, n: number) =>
    typeof v === "string" ? v.trim().slice(0, n) : undefined;

  // 两套正则的结果取并集，按位置排序后剪掉
  const blocks: { start: number; end: number; body: string; kind: string }[] = [];
  for (const re of [BLOCK_RE, BLOCK_RE_LOOSE]) {
    re.lastIndex = 0;
    for (const m of raw.matchAll(re)) {
      if (m.index == null) continue;
      const start = m.index;
      const end = start + m[0].length;
      if (blocks.some((b) => b.start <= start && end <= b.end)) continue;
      blocks.push({ start, end, body: m[0], kind: m[1] });
    }
  }
  blocks.sort((a, b) => a.start - b.start);

  for (const b of blocks) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(tolerant(b.body)) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (b.kind === "actions" && actions.length === 0) {
      for (const a of (parsed.actions as Record<string, unknown>[]) ?? []) {
        const kind = a.kind as ActionKind;
        if (!ACTION_KINDS.includes(kind)) continue;
        actions.push({
          kind,
          label: str(a.label, 12) || kind,
          instruction: str(a.instruction, 200),
        });
        if (actions.length >= 2) break;
      }
    }
    if (b.kind === "entities") {
      for (const e of ((parsed.entities as Record<string, unknown>[]) ?? []).slice(0, 6)) {
        const name = str(e.name, 40);
        if (!name) continue;
        const kindRaw = str(e.kind, 16)?.toLowerCase();
        entities.push({
          name,
          kind: ["character", "location", "faction", "item", "concept"].includes(kindRaw ?? "")
            ? kindRaw
            : undefined,
          role: str(e.role, 24),
          description: str(e.description, 400),
          aliases: str(e.aliases, 120),
          speechStyle: str(e.speechStyle, 80),
          speechLength: ["short", "medium", "long"].includes(str(e.speechLength, 8) ?? "")
            ? str(e.speechLength, 8)
            : undefined,
          speechWords: str(e.speechWords, 80),
          speechTaboo: str(e.speechTaboo, 80),
        });
      }
      if (entities.length >= 6) break;
    }
  }

  let text = raw;
  for (const b of blocks.slice().reverse()) {
    text = text.slice(0, b.start) + text.slice(b.end);
  }
  const cleaned = cleanChatMarkdown(text).replace(/\n{3,}/g, "\n\n").trim();
  // 回复第一行如果是「第二章 借来的笔记」这种标题，摘出来给章节用，正文里不留。
  const firstLine = cleaned.split("\n")[0] ?? "";
  const asTitle = firstLine.replace(/^第.{1,4}章[\s　:：、-]*/, "").trim();
  const isTitleLine =
    firstLine.length <= 30 &&
    !/[。！？!?…]/.test(firstLine) &&
    (/^第[一二三四五六七八九十百零〇\d]+[章回节]/.test(firstLine) ||
      /^[《「【].{1,20}[》」】]$/.test(firstLine) ||
      (cleaned.split("\n").length > 2 && asTitle.length > 0 && asTitle.length <= 24 && !/[，,；;]/.test(firstLine)));

  if (isTitleLine) {
    const rest = cleaned.split("\n").slice(1).join("\n").replace(/^\s*\n+/, "").trim();
    if (rest) {
      return {
        text: rest,
        title: firstLine.replace(/^[《「【]|[》」】]$/g, "").trim().slice(0, 60),
        actions,
        entities,
      };
    }
  }
  return { text: cleaned, actions, entities };
}

export const CHAT_OPENERS = [
  "这一章的节奏怎么样",
  "结尾的钩子够不够",
  "帮我推演接下来五章",
  "哪一段可以删",
];

export const QUICK_ACTIONS = [
  {
    kind: "continue" as GenKind,
    label: "续写本章",
    hint: "接住最后一句话往下写",
    instruction: "",
  },
  {
    kind: "finish" as GenKind,
    label: "写完本章",
    hint: "按目标字数把这一章收尾",
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
