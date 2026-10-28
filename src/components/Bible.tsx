import { AnimatePresence, motion } from "motion/react";
import {
  MapPin,
  MessageSquare,
  Package,
  Plus,
  Swords,
  Sparkles,
  Trash2,
  Users,
  Pencil,
} from "lucide-react";
import { useMemo, useState } from "react";
import { KIND_LABEL, useStore } from "@/lib/store";
import type { Entity, EntityKind } from "@/lib/types";
import { cx } from "@/lib/format";
import ImportSettings from "./ImportSettings";
import { Button, Chip, Field, Modal, Select, TextArea, TextInput } from "./ui";

const KIND_ICON: Record<EntityKind, typeof Users> = {
  character: Users,
  location: MapPin,
  faction: Swords,
  item: Package,
  concept: Sparkles,
};

const KIND_HINT: Record<EntityKind, string> = {
  character: "性格、外貌、动机、当前状态",
  location: "地理、氛围、在故事中的作用",
  faction: "组织、立场、与主角的关系",
  item: "来历、能力、限制",
  concept: "规则、术语、世界观设定",
};

const emptyEntity = (projectId: number, kind: EntityKind): Entity => ({
  id: 0,
  projectId,
  kind,
  name: "",
  aliases: "",
  role: "",
  description: "",
  speechStyle: "",
  speechLength: "medium",
  speechWords: "",
  speechTaboo: "",
  updatedAt: new Date().toISOString(),
});

export default function Bible() {
  const entities = useStore((s) => s.entities);
  const projectId = useStore((s) => s.activeProjectId);
  const draft = useStore((s) => s.draft);
  const saveEntity = useStore((s) => s.saveEntity);
  const removeEntity = useStore((s) => s.removeEntity);
  const [filter, setFilter] = useState<"all" | EntityKind>("all");
  const [editing, setEditing] = useState<Entity | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const shown = useMemo(
    () => (filter === "all" ? entities : entities.filter((e) => e.kind === filter)),
    [entities, filter]
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: entities.length };
    for (const e of entities) map[e.kind] = (map[e.kind] ?? 0) + 1;
    return map;
  }, [entities]);

  if (projectId == null) return null;

  return (
    <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line/50 px-5">
        <span className="text-[10.5px] tracking-[0.18em] text-mute">SETTING BIBLE</span>
        <span className="text-mute/50">/</span>
        <span className="text-[10.5px] text-mute">{entities.length} 条设定</span>
        <div className="flex-1" />
        <Button size="xs" variant="ghost" onClick={() => setImportOpen(true)}>
          <Sparkles size={11} /> AI 识别
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() => setEditing(emptyEntity(projectId, "character"))}
        >
          <Plus size={11} /> 新增设定
        </Button>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[940px] px-9 py-8">
          <div className="mb-6">
            <h1 className="font-serif text-[24px] font-medium tracking-wide text-ink">世界观设定</h1>
            <p className="mt-1.5 text-[11.5px] text-mute">
              这些卡片会被注入 AI 的上下文。写得越具体，续写时人物就越不容易走形。
            </p>
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-1.5">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              全部 {counts.all ?? 0}
            </Chip>
            {(Object.keys(KIND_LABEL) as EntityKind[]).map((k) => (
              <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
                {KIND_LABEL[k]} {counts[k] ?? 0}
              </Chip>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <AnimatePresence initial={false}>
              {shown.map((e) => {
                const Icon = KIND_ICON[e.kind];
                return (
                  <motion.button
                    key={e.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    onClick={() => setEditing(e)}
                    className="group relative overflow-hidden rounded-2xl border border-line/70 bg-gradient-to-br from-surface2/45 to-transparent p-4 text-left transition-colors hover:border-gold/35"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gold/10">
                        <Icon size={12} className="text-gold/80" />
                      </span>
                      <span className="font-serif text-[15.5px] text-ink">{e.name}</span>
                      {e.role ? (
                        <span className="rounded-full border border-line/70 px-1.5 py-[1px] text-[9px] text-mute">
                          {e.role}
                        </span>
                      ) : null}
                      <span className="flex-1" />
                      <Pencil
                        size={11}
                        className="text-mute opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </div>
                    {e.aliases ? (
                      <div className="mb-1.5 text-[10px] text-mute">别名 · {e.aliases}</div>
                    ) : null}
                    <p className="line-clamp-3 text-[11.5px] leading-[1.85] text-dim/90">
                      {e.description || "还没有描述，点击补充"}
                    </p>
                    {e.kind === "character" && e.speechStyle ? (
                      <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-gold/6 px-2 py-1 text-[9.5px] leading-relaxed text-gold/80">
                        <MessageSquare size={10} className="mt-[2px] shrink-0" />
                        <span className="line-clamp-2">{e.speechStyle}</span>
                      </div>
                    ) : null}
                  </motion.button>
                );
              })}
            </AnimatePresence>

            <button
              onClick={() => setEditing(emptyEntity(projectId, filter === "all" ? "character" : filter))}
              className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line/80 text-mute transition-colors hover:border-gold/40 hover:text-gold"
            >
              <Plus size={16} />
              <span className="text-[11px]">新增一条设定</span>
            </button>
          </div>
        </div>
      </div>

      <ImportSettings
        open={importOpen}
        onClose={() => setImportOpen(false)}
        chapterText={draft?.content ?? ""}
      />

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "编辑设定" : "新增设定"}
        subtitle={editing ? KIND_HINT[editing.kind] : undefined}
        width="620px"
        footer={
          <>
            {editing?.id ? (
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={12} /> 删除
              </Button>
            ) : null}
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={!editing?.name.trim()}
              onClick={() => {
                if (!editing) return;
                void saveEntity(editing);
                setEditing(null);
              }}
            >
              保存
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="类型">
              <Select
                value={editing.kind}
                onChange={(v) => setEditing({ ...editing, kind: v as EntityKind })}
                options={(Object.keys(KIND_LABEL) as EntityKind[]).map((k) => ({
                  value: k,
                  label: KIND_LABEL[k],
                }))}
              />
            </Field>
            <Field label="名称">
              <TextInput
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="例如：沈砚"
                autoFocus
              />
            </Field>
            <Field label="别名 / 称谓">
              <TextInput
                value={editing.aliases}
                onChange={(e) => setEditing({ ...editing, aliases: e.target.value })}
                placeholder="沈先生、老沈"
              />
            </Field>
            <Field label="身份 / 标签">
              <TextInput
                value={editing.role}
                onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                placeholder="主角 / 关键地点"
              />
            </Field>
            <Field label="描述" hint="会原样注入提示词" className="col-span-2">
              <TextArea
                rows={7}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="性格、外貌、动机、关系、当前状态……写具体一点。"
              />
            </Field>

            {editing.kind === "character" ? (
              <div className="col-span-2 rounded-xl border border-gold/20 bg-gold/4 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] text-gold/90">角色语气</span>
                  <span className="text-[9.5px] text-mute">出场时按此注入，让对白分得出是谁</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="口癖 / 语气" className="col-span-2">
                    <TextArea
                      rows={2}
                      value={editing.speechStyle}
                      onChange={(e) =>
                        setEditing({ ...editing, speechStyle: e.target.value })
                      }
                      placeholder="例如：话少，常用反问；紧张时重复对方的最后两个字。"
                    />
                  </Field>
                  <Field label="说话长度">
                    <Select
                      value={editing.speechLength}
                      onChange={(v) =>
                        setEditing({
                          ...editing,
                          speechLength: v as "short" | "medium" | "long",
                        })
                      }
                      options={[
                        { value: "short", label: "短句为主" },
                        { value: "medium", label: "正常" },
                        { value: "long", label: "长句 / 爱绕" },
                      ]}
                    />
                  </Field>
                  <Field label="常用词" hint="逗号分隔">
                    <TextInput
                      value={editing.speechWords}
                      onChange={(e) =>
                        setEditing({ ...editing, speechWords: e.target.value })
                      }
                      placeholder="嗯、走吧、随你"
                    />
                  </Field>
                  <Field label="禁用词" hint="逗号分隔" className="col-span-2">
                    <TextInput
                      value={editing.speechTaboo}
                      onChange={(e) =>
                        setEditing({ ...editing, speechTaboo: e.target.value })
                      }
                      placeholder="亲爱的、宝贝、太好了（不符合人物）"
                    />
                  </Field>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="删除设定"
        width="400px"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (editing?.id) void removeEntity(editing.id);
                setConfirmDelete(false);
                setEditing(null);
              }}
            >
              确定删除
            </Button>
          </>
        }
      >
        <p className={cx("text-[13px] leading-relaxed text-dim")}>
          删除后，AI 将不再知道
          <span className="mx-1 font-serif text-ink">「{editing?.name}」</span>
          的存在。
        </p>
      </Modal>
    </section>
  );
}
