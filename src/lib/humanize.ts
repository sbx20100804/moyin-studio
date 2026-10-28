export interface HumanReport {
  score: number;
  banned: { word: string; count: number }[];
  dialogueRatio: number;
  avgSentence: number;
  sentenceVariance: number;
  paragraphCount: number;
  avgParagraphChars: number;
  notes: string[];
}

const BANNED = [
  "仿佛",
  "似乎",
  "一丝",
  "不禁",
  "微微",
  "缓缓",
  "不由得",
  "莫名的",
  "难以言喻",
  "心中一暖",
  "五味杂陈",
  "嘴角勾起",
  "眼神深邃",
  "空气仿佛",
  "如同……一般",
];

const SUMMARY_PHRASES = ["总之", "他知道", "她明白", "这意味着", "换句话说", "由此可见"];

/**
 * Sequential connectors are the fingerprint of a chronological list
 * ("然后…接着…于是…"). One or two is normal prose; a run of them means the
 * paragraph is reporting steps instead of playing a scene.
 */
const FLOW_WORDS = ["然后", "接着", "随后", "紧接着", "于是"];

function splitSentences(text: string) {
  return text
    .split(/[。！？!?…]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Rough, local heuristics for "does this read like a person wrote it".
 * Not a model — just enough signal to catch the obvious AI tells.
 */
export function analyzeHuman(text: string): HumanReport {
  const clean = text.trim();
  const chars = clean.replace(/\s/g, "").length;
  if (chars < 40) {
    return {
      score: 100,
      banned: [],
      dialogueRatio: 0,
      avgSentence: 0,
      sentenceVariance: 0,
      paragraphCount: 0,
      avgParagraphChars: 0,
      notes: [],
    };
  }

  const banned = BANNED.map((word) => ({
    word,
    count: clean.split(word).length - 1,
  })).filter((b) => b.count > 0);

  const bannedHits = banned.reduce((a, b) => a + b.count, 0);
  const summaryHits = SUMMARY_PHRASES.reduce(
    (a, p) => a + (clean.split(p).length - 1),
    0
  );
  const flowHits = FLOW_WORDS.reduce((a, w) => a + (clean.split(w).length - 1), 0);

  const quoted = clean.match(/[“「][\s\S]*?[”」]/g) ?? [];
  const dialogueChars = quoted.reduce((a, q) => a + q.replace(/\s/g, "").length, 0);
  const dialogueRatio = dialogueChars / chars;

  const sentences = splitSentences(clean);
  const lengths = sentences.map((s) => s.replace(/\s/g, "").length);
  const avgSentence = lengths.length
    ? lengths.reduce((a, b) => a + b, 0) / lengths.length
    : 0;
  const variance = lengths.length
    ? lengths.reduce((a, b) => a + (b - avgSentence) ** 2, 0) / lengths.length
    : 0;

  const paragraphs = clean.split(/\n+/).filter((p) => p.trim().length > 0);
  const paragraphCount = paragraphs.length;
  const avgParagraphChars = paragraphCount ? chars / paragraphCount : chars;

  let score = 100;
  score -= Math.min(40, bannedHits * 4);
  score -= Math.min(15, summaryHits * 5);
  if (chars >= 150 && flowHits >= 3) score -= Math.min(9, (flowHits - 2) * 3);
  if (dialogueRatio < 0.12) score -= 12;
  else if (dialogueRatio > 0.6) score -= 5;
  if (variance < 12) score -= 12;
  if (avgParagraphChars > 130) score -= 10;
  if (avgSentence > 42) score -= 8;
  if (chars > 300 && paragraphCount <= 2) score -= 6;

  const notes: string[] = [];
  if (bannedHits > 0) {
    notes.push(
      `套语 ${bannedHits} 处：${banned
        .slice(0, 4)
        .map((b) => `${b.word}×${b.count}`)
        .join("、")}`
    );
  }
  if (dialogueRatio < 0.12) notes.push("几乎没有对话，像在概述而不是演出来");
  if (variance < 12) notes.push("句子长度太齐，读起来像模板");
  if (avgParagraphChars > 130) notes.push("段落偏长，试试单句成段");
  if (summaryHits > 0) notes.push(`有 ${summaryHits} 处解释性总结（“${SUMMARY_PHRASES.find((p) => clean.includes(p))}”）`);
  if (chars >= 150 && flowHits >= 3)
    notes.push(
      `“然后/接着”这类串联词 ${flowHits} 处，像记流水账：让动作之间有阻碍或反应，或者直接跳到下一件事`
    );

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    banned,
    dialogueRatio,
    avgSentence,
    sentenceVariance: variance,
    paragraphCount,
    avgParagraphChars,
    notes,
  };
}
