import { useMemo, useState } from "react";
import { BookMarked, Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";
import type { Thread } from "@/lib/types";
import { Button, Field, Modal, Select, TextArea, TextInput } from "./ui";

const STATUS: Record<string, string> = {
  open: "待回收",
  paid: "已回收",
  dropped: "已放弃",
};

const empty = (projectId: number): Thread => ({
  id: 0,
  projectId,
  title: "",
  detail: "",
  status: "open",
  setupChapterId: null,
  payoffChapterId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export default function Threads() {
  const projectId = useStore((s) => s.activeProjectId);
  const threads = useStore((s) => s.threads);
  const chapters = useStore((s) => s.chapters);
  const saveThread = useStore((s) => s.saveThread);
  const removeThread = useStore((s) => s.removeThread);
  const [editing, setEditing] = useState<Thread | null>(null);
  const [confirm, setConfirm] = useState<Thread | null>(null);

  const byId = useMemo(() => new Map(chapters.map((c) => [c.id, c.title])), [chapters]);
  const groups = useMemo(() => {
    return ["open", "paid", "dropped"]
      .map((status) => ({ status, list: threads.filter((t) => t.status === status) }))
      .filter((g) => g.list.length > 0);
  }, [threads]);

  if (projectId == null) return null;

  return (
    <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line/50 px-5">
        <span className="text-[10.5px] tracking-[0.18em] text-mute">THREADS</span>
        <span className="text-mute/50">/</span>
        <span className="text-[10.5px] text-mute">
          待回收 {threads.filter((t) => t.status === "open").length} 条
        </span>
        <div className="flex-1" />
        <Button size="xs" variant="outline" onClick={() => setEditing(empty(projectId))}>
          <Plus size={11} /> 新增线索
        </Button>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] px-9 py-8">
          <div className="mb-6">
            <h1 className="font-serif text-[24px] font-medium tracking-wide text-ink">伏笔台账</h1>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-mute">
              埋下的承诺、物件、疑点记在这里。待回收的线索会作为【待回收伏笔】注入提示词，
              AI 续写时会留出回收的余地。
            </p>
          </div>

          {threads.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <BookMarked size={20} className="mb-3 text-mute" />
              <p className="text-[12px] text-mute">还没有线索。想想有什么是读者会惦记的。</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setEditing(empty(projectId))}
              >
                记下第一条
              </Button>
            </div>
          ) : null}

          {groups.map((group) => (
            <div key={group.status} className="mb-7">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] tracking-[0.24em] text-mute">
                  {STATUS[group.status]} · {group.list.length}
                </span>
                <span className="h-px flex-1 bg-line/60" />
              </div>
              <div className="space-y-1.5">
                {group.list.map((t) => (
                  <div
                    key={t.id}
                    className={cx(
                      "group rounded-2xl border p-3.5 transition-colors",
                      t.status === "open"
                        ? "border-line/70 bg-surface2/20"
                        : "border-line/50 bg-transparent opacity-70"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => setEditing(t)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cx(
                              "font-serif text-[14px]",
                              t.status === "open" ? "text-ink" : "text-dim line-through"
                            )}
                          >
                            {t.title}
                          </span>
                          {t.setupChapterId && byId.get(t.setupChapterId) ? (
                            <span className="text-[9.5px] text-mute">
                              埋于「{byId.get(t.setupChapterId)}」
                            </span>
                          ) : null}
                          {t.payoffChapterId && byId.get(t.payoffChapterId) ? (
                            <span className="text-[9.5px] text-gold/70">
                              收于「{byId.get(t.payoffChapterId)}」
                            </span>
                          ) : null}
                        </div>
                        {t.detail ? (
                          <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-dim">
                            {t.detail}
                          </p>
                        ) : null}
                      </button>
                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {t.status === "open" ? (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                              void saveThread({ ...t, status: "paid", payoffChapterId: null })
                            }
                          >
                            <Check size={10} /> 已回收
                          </Button>
                        ) : (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => void saveThread({ ...t, status: "open" })}
                          >
                            <RotateCcw size={10} /> 重新打开
                          </Button>
                        )}
                        <Button size="xs" variant="ghost" onClick={() => setConfirm(t)}>
                          <Trash2 size={10} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "编辑线索" : "新增线索"}
        subtitle="写清「读者在等什么」，回收时才不会忘"
        width="600px"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={!editing?.title.trim()}
              onClick={() => {
                if (!editing) return;
                void saveThread(editing);
                setEditing(null);
              }}
            >
              保存
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-3.5">
            <Field label="线索名称">
              <TextInput
                autoFocus
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="例如：那枚缺角的铜扣"
              />
            </Field>
            <Field label="细节与承诺">
              <TextArea
                rows={4}
                value={editing.detail}
                onChange={(e) => setEditing({ ...editing, detail: e.target.value })}
                placeholder="它是什么、为什么重要、读者在期待什么答案。"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="埋设章节">
                <Select
                  value={editing.setupChapterId ? String(editing.setupChapterId) : ""}
                  onChange={(v) =>
                    setEditing({ ...editing, setupChapterId: v ? Number(v) : null })
                  }
                  options={[
                    { value: "", label: "未指定" },
                    ...chapters.map((c) => ({ value: String(c.id), label: c.title })),
                  ]}
                />
              </Field>
              <Field label="回收章节">
                <Select
                  value={editing.payoffChapterId ? String(editing.payoffChapterId) : ""}
                  onChange={(v) =>
                    setEditing({ ...editing, payoffChapterId: v ? Number(v) : null })
                  }
                  options={[
                    { value: "", label: "尚未回收" },
                    ...chapters.map((c) => ({ value: String(c.id), label: c.title })),
                  ]}
                />
              </Field>
            </div>
            <Field label="状态">
              <Select
                value={editing.status}
                onChange={(v) => setEditing({ ...editing, status: v })}
                options={[
                  { value: "open", label: "待回收" },
                  { value: "paid", label: "已回收" },
                  { value: "dropped", label: "已放弃" },
                ]}
              />
            </Field>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title="删除线索"
        width="400px"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm) void removeThread(confirm.id);
                setConfirm(null);
              }}
            >
              删除
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-dim">
          删除「{confirm?.title}」后，AI 不会再收到这条伏笔提醒。
        </p>
      </Modal>
    </section>
  );
}
