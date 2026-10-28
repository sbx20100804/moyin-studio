import { diffLines, diffWords } from "diff";
import { useMemo, useState } from "react";
import { cx } from "@/lib/format";

export default function DiffView({
  original,
  revised,
  className,
}: {
  original: string;
  revised: string;
  className?: string;
}) {
  const [mode, setMode] = useState<"block" | "inline">("block");

  const blocks = useMemo(() => {
    if (!original) return [{ value: revised, added: true, removed: false }];
    return diffLines(original, revised);
  }, [original, revised]);

  const words = useMemo(() => {
    if (!original) return [{ value: revised, added: true, removed: false }];
    return diffWords(original, revised);
  }, [original, revised]);

  const addedLines = blocks.filter((b) => b.added).length;
  const removedLines = blocks.filter((b) => b.removed).length;

  return (
    <div className={cx("flex flex-col", className)}>
      <div className="mb-2 flex items-center gap-2">
        <div className="flex rounded-lg border border-line/70 p-0.5">
          {(
            [
              { key: "block" as const, label: "分段对比" },
              { key: "inline" as const, label: "逐字对比" },
            ]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setMode(t.key)}
              className={cx(
                "rounded-md px-2 py-0.5 text-[9.5px] transition-colors",
                mode === t.key ? "bg-surface2 text-ink" : "text-mute hover:text-dim"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-1 text-[9.5px] text-mute">
          <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: "rgba(52,211,153,0.35)" }} />
          增 {addedLines}
        </span>
        <span className="flex items-center gap-1 text-[9.5px] text-mute">
          <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: "rgba(239,68,68,0.32)" }} />
          删 {removedLines}
        </span>
      </div>

      {mode === "block" ? (
        <div className="space-y-1.5 font-serif text-[13.5px] leading-[1.95]">
          {blocks.map((part, i) => {
            const text = part.value.trim();
            if (!text) return null;
            if (part.added) {
              return (
                <div
                  key={i}
                  className="whitespace-pre-wrap rounded-lg border-l-2 py-1.5 pl-2.5 pr-2 text-ink/95"
                  style={{ background: "rgba(52,211,153,0.08)", borderColor: "rgba(52,211,153,0.5)" }}
                >
                  {text}
                </div>
              );
            }
            if (part.removed) {
              return (
                <div
                  key={i}
                  className="whitespace-pre-wrap rounded-lg border-l-2 py-1.5 pl-2.5 pr-2 text-dim/70"
                  style={{ background: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.4)" }}
                >
                  {text}
                </div>
              );
            }
            return (
              <div key={i} className="whitespace-pre-wrap py-1 text-dim/80">
                {text}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="whitespace-pre-wrap font-serif text-[13.5px] leading-[2] text-ink/90">
          {words.map((part, i) =>
            part.added ? (
              <ins
                key={i}
                className="rounded-[3px] no-underline"
                style={{ background: "rgba(52,211,153,0.16)", color: "rgb(134, 239, 172)" }}
              >
                {part.value}
              </ins>
            ) : part.removed ? (
              <del
                key={i}
                className="rounded-[3px]"
                style={{ background: "rgba(239,68,68,0.13)", color: "rgba(248,113,113,0.75)" }}
              >
                {part.value}
              </del>
            ) : (
              <span key={i}>{part.value}</span>
            )
          )}
        </div>
      )}
    </div>
  );
}
