import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { KIND_LABEL, useStore } from "@/lib/store";
import type { Entity, EntityKind, SettingsCandidate } from "@/lib/types";
import { cx } from "@/lib/format";
import { Button, Modal, Select, TextArea, TextInput } from "./ui";

interface Props {
  open: boolean;
  onClose: () => void;
  /** 当前章节正文，用于「从本章正文」入口 */
  chapterText: string;
}

type Mode = "new" | "merge" | "skip";

interface Draft extends SettingsCandidate {
  key: string;
  checked: boolean;
  mode: Mode;
  conflict?: Entity;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
const parts = (s: string) =>
  s
    .split(/[,，、/]/)
    .map(norm)
    .filter(Boolean);

function findConflict(candidate: SettingsCandidate, entities: Entity[]): Entity | undefined {
  const names = new Set([norm(candidate.name), ...parts(candidate.aliases)]);
  if (!names.size) return undefined;
  return entities.find((e) => {
    const own = new Set([norm(e.name), ...parts(e.aliases)]);
    for (const n of names) if (own.has(n)) return true;
    return false;
  });
}

export default function ImportSettings({ open, onClose, chapterText }: Props) {
  const projectId = useStore((s) => s.activeProjectId);
  const entities = useStore((s) => s.entities);
  const extractSettings = useStore((s) => s.extractSettings);
  const importEntities = useStore((s) => s.importEntities);
  const saveEntity = useStore((s) => s.saveEntity);
  const toast = useStore((s) => s.toast);

  const [tab, setTab] = useState<"text" | "chapter">("text");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    if (!open) return;
    setTab("text");
    setText("");
    setDrafts([]);
    setBusy(false);
    setWriting(false);
  }, [open]);

  const source = tab === "chapter" ? chapterText : text;

  const selected = useMemo(
    () => drafts.filter((d) => d.checked && d.mode !== "skip" && d.name.trim()),
    [drafts]
  );
  const allChecked = drafts.length > 0 && drafts.every((d) => d.checked);

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const runExtract = async () => {
    if (source.trim().length < 8) {
      toast(
        tab === "chapter" ? "本章还没有正文，先写一点或改用粘贴" : "至少粘贴一段话",
        "error"
      );
      return;
    }
    setBusy(true);
    const list = await extractSettings(source);
    setBusy(false);
    if (!list) return;
    const mapped: Draft[] = list.map((c, i) => {
      const conflict = findConflict(c, entities);
      return {
        ...c,
        key: `${i}-${c.name}`,
        checked: !conflict,
        mode: conflict ? "skip" : "new",
        conflict,
      };
    });
    setDrafts(mapped);
  };

  const write = async () => {
    if (projectId == null || !selected.length) return;
    setWriting(true);
    const fresh: Entity[] = [];
    const merges: Entity[] = [];
    for (const d of selected) {
      if (d.mode === "merge" && d.conflict) {
        merges.push({
          ...d.conflict,
          aliases: d.conflict.aliases || d.aliases.trim(),
          role: d.conflict.role || d.role.trim(),
          description: d.conflict.description || d.description.trim(),
          speechStyle: d.conflict.speechStyle || d.speechStyle.trim(),
          speechWords: d.conflict.speechWords || d.speechWords.trim(),
          speechTaboo: d.conflict.speechTaboo || d.speechTaboo.trim(),
        });
      } else {
        fresh.push({
          id: 0,
          projectId,
          kind: d.kind,
          name: d.name.trim(),
          aliases: d.aliases.trim(),
          role: d.role.trim(),
          description: d.description.trim(),
          speechStyle: d.speechStyle.trim(),
          speechLength: d.speechLength,
          speechWords: d.speechWords.trim(),
          speechTaboo: d.speechTaboo.trim(),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    if (fresh.length) await importEntities(fresh);
    for (const m of merges) await saveEntity(m, { silent: true });
    if (merges.length) toast(`已合并 ${merges.length} 条现有设定`);
    setWriting(false);
    onClose();
  };

  const kindOptions = (Object.keys(KIND_LABEL) as EntityKind[]).map((k) => ({
    value: k,
    label: KIND_LABEL[k],
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI 识别设定"
      subtitle="粘贴一段话，AI 抽出人物、地点、势力、物品和世界观；确认后才会写进设定库。"
      width="760px"
      footer={
        <>
          <span className="mr-auto text-[10.5px] text-mute">
            {drafts.length
              ? `识别出 ${drafts.length} 条 · 已选 ${selected.length} 条`
              : "AI 只抽取，不会直接改你的设定"}
          </span>
          {drafts.length ? (
            <Button variant="ghost" onClick={() => setDrafts([])}>
              重新识别
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            loading={busy || writing}
            disabled={busy || writing || (drafts.length > 0 && selected.length === 0)}
            onClick={() => (drafts.length ? void write() : void runExtract())}
          >
            {drafts.length ? `写入 ${selected.length} 条` : "开始识别"}
          </Button>
        </>
      }
    >
      {drafts.length === 0 ? (
        <div className="space-y-4">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTab("text")}
              className={cx(
                "rounded-full border px-3 py-1 text-[11px] transition-colors",
                tab === "text"
                  ? "border-gold/45 bg-gold/10 text-gold"
                  : "border-line text-mute hover:text-dim"
              )}
            >
              粘贴一段话
            </button>
            <button
              onClick={() => setTab("chapter")}
              className={cx(
                "rounded-full border px-3 py-1 text-[11px] transition-colors",
                tab === "chapter"
                  ? "border-gold/45 bg-gold/10 text-gold"
                  : "border-line text-mute hover:text-dim"
              )}
            >
              当前章节正文
            </button>
            {tab === "chapter" ? (
              <span className="text-[10.5px] text-mute">
                {chapterText.trim() ? `约 ${chapterText.length} 字，只读` : "本章还没有正文"}
              </span>
            ) : null}
          </div>

          {tab === "text" ? (
            <div>
              <TextArea
                rows={12}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  "把人物小传、故事大纲、设定草稿或随便一段正文粘进来。\n\n例如：\n沈砚，二十八岁，前巡捕房探长，右肩有旧伤，雨天发作。说话极省，习惯用问句代替判断。\n顾青梧，报馆校对，记忆过人，左手腕有一道浅疤。\n青石渡是城西老渡口，入夜后无船。"
                }
                autoFocus
              />
              <p className="mt-2 text-[10.5px] leading-relaxed text-mute">
                只抽文本里真实写到的内容，不会脑补。长文超过 2 万字会截断。
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-line/70 bg-surface2/25 p-4">
              <p className="whitespace-pre-wrap text-[12px] leading-[1.9] text-dim/90">
                {chapterText.trim()
                  ? chapterText.slice(0, 600) + (chapterText.length > 600 ? "……" : "")
                  : "当前章节还没有正文。先回编辑器写一段，或者改用「粘贴一段话」。"}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-dim">识别结果</span>
            <span className="text-[10.5px] text-mute">勾选要写入的条目，可先改名字和描述</span>
            <span className="flex-1" />
            <button
              onClick={() =>
                setDrafts((list) => list.map((d) => ({ ...d, checked: !allChecked })))
              }
              className="text-[10.5px] text-gold hover:underline"
            >
              {allChecked ? "全不选" : "全选"}
            </button>
          </div>

          <p className="rounded-lg border border-line/60 bg-surface2/25 px-3 py-2 text-[10.5px] leading-relaxed text-mute">
            重名条目默认跳过。选「合并」只补空字段，不覆盖你已写好的内容；写入后新增条目可以撤销。
          </p>

          {drafts.map((d) => (
            <div
              key={d.key}
              className={cx(
                "rounded-2xl border p-3.5 transition-colors",
                d.checked ? "border-gold/30 bg-gold/4" : "border-line/70 bg-surface2/20"
              )}
            >
              <div className="flex items-start gap-2.5">
                <button
                  aria-label={d.checked ? "取消选择" : "选择"}
                  aria-checked={d.checked}
                  role="checkbox"
                  onClick={() => {
                    const next = !d.checked;
                    update(d.key, {
                      checked: next,
                      // 勾选重名条目时默认按「合并」处理，避免勾了却不写入
                      ...(next && d.conflict && d.mode === "skip"
                        ? { mode: "merge" as Mode }
                        : {}),
                    });
                  }}
                  className={cx(
                    "mt-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    d.checked ? "border-gold bg-gold text-[#131313]" : "border-line text-transparent"
                  )}
                >
                  <Check size={10} strokeWidth={3} />
                </button>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="grid grid-cols-[1.5fr_0.75fr_1fr] gap-2">
                    <TextInput
                      value={d.name}
                      onChange={(e) => update(d.key, { name: e.target.value })}
                      placeholder="名称"
                    />
                    <Select
                      value={d.kind}
                      onChange={(v) => update(d.key, { kind: v as EntityKind })}
                      options={kindOptions}
                    />
                    <TextInput
                      value={d.role}
                      onChange={(e) => update(d.key, { role: e.target.value })}
                      placeholder="身份标签"
                    />
                  </div>

                  <TextArea
                    rows={2}
                    value={d.description}
                    onChange={(e) => update(d.key, { description: e.target.value })}
                    placeholder="描述"
                  />

                  {d.kind === "character" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <TextInput
                        value={d.speechStyle}
                        onChange={(e) => update(d.key, { speechStyle: e.target.value })}
                        placeholder="口癖 / 语气"
                      />
                      <TextInput
                        value={d.speechWords}
                        onChange={(e) => update(d.key, { speechWords: e.target.value })}
                        placeholder="常用词（逗号分隔）"
                      />
                    </div>
                  ) : null}

                  {d.source ? (
                    <div className="line-clamp-2 text-[10px] leading-relaxed text-mute">
                      原文：{d.source}
                    </div>
                  ) : null}

                  {d.conflict ? (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gold/25 bg-gold/6 px-2.5 py-1.5 text-[10.5px] text-gold/90">
                      <AlertTriangle size={11} />
                      <span>已有「{d.conflict.name}」，默认跳过</span>
                      <span className="flex-1" />
                      {(
                        [
                          ["merge", "合并"],
                          ["skip", "跳过"],
                          ["new", "仍要新建"],
                        ] as [Mode, string][]
                      ).map(([m, label]) => (
                        <button
                          key={m}
                          onClick={() => update(d.key, { mode: m })}
                          className={cx(
                            "rounded-full border px-2 py-0.5 transition-colors",
                            d.mode === m
                              ? "border-gold bg-gold/15 text-gold"
                              : "border-line text-mute hover:text-dim"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
