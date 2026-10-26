import { useEffect, useMemo } from "react";
import { Flame, PenLine, TrendingUp } from "lucide-react";
import { formatCount } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Modal } from "./ui";

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function StatsModal() {
  const open = useStore((s) => s.statsOpen);
  const setOpen = useStore((s) => s.setStatsOpen);
  const stats = useStore((s) => s.stats);
  const loadStats = useStore((s) => s.loadStats);
  const chapters = useStore((s) => s.chapters);
  const projects = useStore((s) => s.projects);
  const totalWords = projects.reduce((a, p) => a + p.wordCount, 0);

  useEffect(() => {
    if (open) void loadStats(30);
  }, [open, loadStats]);

  const days = useMemo(() => {
    const map = new Map(stats.map((s) => [s.day, s.words]));
    const out: { key: string; label: string; words: number }[] = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayKey(d);
      out.push({
        key,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        words: map.get(key) ?? 0,
      });
    }
    return out;
  }, [stats]);

  const max = Math.max(1, ...days.map((d) => d.words));
  const today = days[days.length - 1]?.words ?? 0;
  const week = days.slice(-7).reduce((a, d) => a + d.words, 0);

  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].words > 0) streak += 1;
    else if (i === days.length - 1) continue; // today may still be 0
    else break;
  }

  const written = chapters.filter((c) => c.wordCount > 0).length;

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="写作统计"
      subtitle="最近 14 天 · 所有作品"
      width="620px"
    >
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "今日新增", value: `${formatCount(today)} 字`, icon: PenLine },
          { label: "近 7 天", value: `${formatCount(week)} 字`, icon: TrendingUp },
          { label: "连续写作", value: `${streak} 天`, icon: Flame },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl border border-line/70 bg-surface2/25 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] text-mute">
                <Icon size={11} className="text-gold/70" /> {item.label}
              </div>
              <div className="text-[16px] tabular-nums text-ink">{item.value}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-line/70 bg-surface2/20 p-3">
        <div className="flex h-[150px] items-end gap-1.5">
          {days.map((d) => (
            <div key={d.key} className="group flex flex-1 flex-col items-center gap-1">
              <div className="relative flex h-[120px] w-full items-end">
                <div
                  className="w-full rounded-t-[3px] bg-gradient-to-t from-gold/30 to-gold/80 transition-all group-hover:from-gold/50 group-hover:to-gold"
                  style={{ height: `${Math.max(d.words > 0 ? 3 : 1, (d.words / max) * 118)}px` }}
                  title={`${d.label} · ${d.words} 字`}
                />
              </div>
              <span className="text-[8.5px] text-mute">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 text-[10.5px] text-mute">
        <span>
          全部作品 <span className="text-dim">{formatCount(totalWords)}</span> 字
        </span>
        <span>
          已动笔 <span className="text-dim">{written}</span> / {chapters.length} 章
        </span>
        <span className="flex-1" />
        <span>只统计在本机新增的字数，改写不计入</span>
      </div>
    </Modal>
  );
}
