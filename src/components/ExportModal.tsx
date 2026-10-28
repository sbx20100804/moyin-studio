import { useMemo } from "react";
import { FileDown } from "lucide-react";
import { useStore, type ExportFormat } from "@/lib/store";
import { cx, formatCount } from "@/lib/format";
import { Button, Modal } from "./ui";

const FORMAT_LABEL: Record<ExportFormat, string> = {
  docx: "Word",
  md: "Markdown",
  txt: "纯文本",
};

const FORMATS: ExportFormat[] = ["docx", "md", "txt"];

export default function ExportModal() {
  const req = useStore((s) => s.exportRequest);
  const chapters = useStore((s) => s.chapters);
  const activeChapterId = useStore((s) => s.activeChapterId);
  const exportBook = useStore((s) => s.exportBook);
  const closeExport = useStore((s) => s.closeExport);
  const setExportFormat = useStore((s) => s.setExportFormat);
  const setExportIds = useStore((s) => s.setExportIds);

  const volumes = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const c of chapters) {
      const key = c.volume || "未分卷";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c.id);
    }
    return [...map.entries()];
  }, [chapters]);

  if (!req) return null;

  const allIds = chapters.map((c) => c.id);
  const hasCurrent = activeChapterId != null && chapters.some((c) => c.id === activeChapterId);
  const count = req.ids.length;
  const allSelected = count > 0 && count === allIds.length;

  return (
    <Modal
      open
      onClose={closeExport}
      title={`导出为 ${FORMAT_LABEL[req.format]}`}
      subtitle="可以导出全部章节，也可以只导当前章或手动勾选；导出前会自动保存"
      width="560px"
      footer={
        <>
          <div className="mr-auto flex rounded-lg border border-line/70 p-0.5">
            {FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setExportFormat(f)}
                className={cx(
                  "rounded-md px-2 py-1 text-[10.5px] transition-colors",
                  req.format === f ? "bg-gold/15 text-gold" : "text-mute hover:text-dim"
                )}
              >
                {FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={closeExport}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={count === 0}
            onClick={() => {
              void exportBook(req.format, req.ids);
              closeExport();
            }}
          >
            <FileDown size={12} /> 导出 {count} 章
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setExportIds(allIds)}
          className={cx(
            "rounded-full border px-2.5 py-1 text-[10.5px] transition-colors",
            allSelected
              ? "border-gold/45 bg-gold/10 text-gold"
              : "border-line text-mute hover:text-dim"
          )}
        >
          全部章节 · {allIds.length}
        </button>
        <button
          onClick={() => {
            if (hasCurrent && activeChapterId != null) setExportIds([activeChapterId]);
          }}
          disabled={!hasCurrent}
          className={cx(
            "rounded-full border px-2.5 py-1 text-[10.5px] transition-colors",
            hasCurrent && count === 1 && req.ids[0] === activeChapterId
              ? "border-gold/45 bg-gold/10 text-gold"
              : "border-line text-mute hover:text-dim",
            !hasCurrent && "cursor-not-allowed opacity-40"
          )}
        >
          仅当前章
        </button>
        <button
          onClick={() => setExportIds([])}
          className="rounded-full border border-line px-2.5 py-1 text-[10.5px] text-mute transition-colors hover:text-dim"
        >
          清空
        </button>
        <span className="flex-1" />
        <span className="text-[10.5px] text-mute">
          已选 {count} / {allIds.length} 章
        </span>
      </div>

      {volumes.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {volumes.map(([volume, ids]) => (
            <button
              key={volume}
              onClick={() => setExportIds(ids)}
              className="rounded-full border border-line/70 px-2 py-0.5 text-[10px] text-mute transition-colors hover:border-gold/40 hover:text-gold"
            >
              {volume} · {ids.length} 章
            </button>
          ))}
        </div>
      ) : null}

      <div className="scroll-thin max-h-[46vh] space-y-0.5 overflow-y-auto">
        {chapters.map((c) => {
          const checked = req.ids.includes(c.id);
          return (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface2/60"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  setExportIds(
                    checked ? req.ids.filter((x) => x !== c.id) : [...req.ids, c.id]
                  )
                }
                className="h-3.5 w-3.5 accent-[var(--c-gold)]"
              />
              <span className="min-w-0 flex-1 truncate text-[12px] text-dim">{c.title}</span>
              <span className="shrink-0 text-[10px] text-mute">
                {c.wordCount > 0 ? `${formatCount(c.wordCount)} 字` : "空白"}
              </span>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}
