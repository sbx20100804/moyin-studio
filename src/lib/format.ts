export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function countWords(text: string) {
  return text.replace(/\s/g, "").length;
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.round(text.length / 1.6));
}

export function formatCount(n: number) {
  if (n >= 10000) {
    const v = n / 10000;
    return `${v >= 100 ? Math.round(v) : v.toFixed(1)} 万`;
  }
  return String(n);
}

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function timeLabel(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function relativeDay(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff <= 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff < 7) return `${diff} 天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function chineseNumber(n: number) {
  const digits = "零一二三四五六七八九";
  if (n <= 10) return n === 10 ? "十" : digits[n];
  if (n < 20) return `十${digits[n % 10]}`;
  if (n < 100) {
    const t = Math.floor(n / 10);
    const r = n % 10;
    return `${digits[t]}十${r ? digits[r] : ""}`;
  }
  return String(n);
}

export function readingMinutes(words: number) {
  return Math.max(1, Math.round(words / 420));
}

export function cleanGenerated(text: string) {
  return text
    .replace(/^\s*(好的|当然|以下是|这是)[^\n]{0,20}\n+/, "")
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
}
