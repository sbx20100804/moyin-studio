import { useEffect, useMemo, useState } from "react";
import { FileSearch, Replace, Search } from "lucide-react";
import { api } from "@/lib/api";
import { countWords } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { SearchHit } from "@/lib/types";
import { Button, Modal, TextInput } from "./ui";

function occurrences(hay: string, needle: string) {
  if (!needle) return 0;
  return hay.split(needle).length - 1;
}

export default function SearchModal() {
  const open = useStore((s) => s.searchOpen);
  const setOpen = useStore((s) => s.setSearchOpen);
  const projectId = useStore((s) => s.activeProjectId);
  const openSearchHit = useStore((s) => s.openSearchHit);
  const draft = useStore((s) => s.draft);
  const setDraft = useStore((s) => s.setDraft);
  const toast = useStore((s) => s.toast);

  const [q, setQ] = useState("");
  const [replacement, setReplacement] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setReplacement("");
    setHits([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (!query || projectId == null) {
      setHits([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await api.searchChapters(projectId, query, 80);
        setHits(found);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 260);
    return () => clearTimeout(timer);
  }, [q, projectId, open]);

  const chapterMatches = useMemo(
    () => (draft ? occurrences(draft.content, q.trim()) : 0),
    [draft, q]
  );

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="全文搜索"
      subtitle="跨章节查找；替换只作用于当前章节"
      width="720px"
    >
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
        <TextInput
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="输入要查找的文字，支持中文与英文"
          className="pl-9"
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Replace size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <TextInput
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="替换为（留空即删除）"
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!q.trim() || !draft || chapterMatches === 0}
          onClick={() => {
            if (!draft) return;
            setDraft({ content: draft.content.split(q).join(replacement) });
            toast(`已替换本章 ${chapterMatches} 处`, "success");
          }}
        >
          替换本章 {chapterMatches} 处
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[10.5px] text-mute">
        <FileSearch size={11} />
        {searching ? "搜索中…" : `找到 ${hits.length} 处`}
        <span className="flex-1" />
        <span>点击结果跳转到对应章节</span>
      </div>

      <div className="scroll-thin mt-1.5 max-h-[46vh] space-y-1 overflow-y-auto">
        {hits.map((hit, i) => (
          <button
            key={`${hit.chapterId}-${hit.offset}-${i}`}
            onClick={() => void openSearchHit(hit)}
            className="block w-full rounded-xl border border-line/60 px-3 py-2 text-left transition-colors hover:border-gold/40 hover:bg-surface2/50"
          >
            <div className="mb-0.5 flex items-center gap-2">
              <span className="truncate text-[11.5px] text-ink">{hit.title}</span>
              <span className="shrink-0 text-[9.5px] text-mute">第 {hit.offset} 字</span>
            </div>
            <div className="line-clamp-2 text-[11px] leading-relaxed text-dim">{hit.snippet}</div>
          </button>
        ))}
        {!searching && q.trim() && hits.length === 0 ? (
          <div className="py-10 text-center text-[11.5px] text-mute">没有找到匹配的内容</div>
        ) : null}
      </div>

      <div className="mt-3 text-[10px] text-mute">
        当前章「{draft?.title ?? "未打开"}」约 {draft ? countWords(draft.content) : 0} 字
      </div>
    </Modal>
  );
}
