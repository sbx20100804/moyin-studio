import { BookPlus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Button, Field, Modal, Select, TextArea, TextInput } from "./ui";

const GENRES = [
  "古风悬疑",
  "都市",
  "科幻",
  "奇幻",
  "武侠",
  "言情",
  "历史",
  "悬疑推理",
  "日本校园轻小说",
];

const POVS = ["第三人称", "第三人称限知", "第一人称", "双视角交替", "全知视角"];

export default function ProjectModal() {
  const modal = useStore((s) => s.projectModal);
  const setModal = useStore((s) => s.setProjectModal);
  const project = useStore((s) => s.projects.find((p) => p.id === s.activeProjectId));
  const createProject = useStore((s) => s.createProject);
  const updateProject = useStore((s) => s.updateProject);
  const removeProject = useStore((s) => s.removeProject);

  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [pov, setPov] = useState(POVS[0]);
  const [target, setTarget] = useState(0);
  const [synopsis, setSynopsis] = useState("");
  const [style, setStyle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = modal !== null;

  useEffect(() => {
    if (!open) return;
    if (modal?.mode === "edit" && project) {
      setTitle(project.title);
      setGenre(project.genre || GENRES[0]);
      setPov(project.pov || POVS[0]);
      setTarget(project.targetWords);
      setSynopsis(project.synopsis);
      setStyle(project.styleGuide);
    } else {
      setTitle("");
      setGenre(GENRES[0]);
      setPov(POVS[0]);
      setTarget(0);
      setSynopsis("");
      setStyle("");
    }
    setConfirmDelete(false);
  }, [open, modal?.mode, project?.id]);

  const isEdit = modal?.mode === "edit";

  return (
    <>
      <Modal
        open={open}
        onClose={() => setModal(null)}
        title={isEdit ? "作品设置" : "新建作品"}
        subtitle={
          isEdit
            ? "文风指南与梗概会直接进入 AI 的系统提示词"
            : "先起一个名字，其余随时可以补充"
        }
        width="640px"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!title.trim()}
              onClick={async () => {
                if (!title.trim()) return;
                setBusy(true);
                if (isEdit && project) {
                  await updateProject({
                    title: title.trim(),
                    genre,
                    pov,
                    targetWords: target,
                    synopsis,
                    styleGuide: style,
                  });
                } else {
                  await createProject(title.trim(), genre);
                }
                setBusy(false);
              }}
            >
              {isEdit ? "保存" : "创建并开始写"}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label="书名">
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：长夜将明"
              autoFocus
              className="font-serif text-[15px]"
            />
          </Field>

          <Field label="类型">
            <div className="flex flex-wrap gap-1.5">
              {GENRES.map((g) => (
                <button
                  key={g}
                  onClick={() => setGenre(g)}
                  className={cx(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    genre === g
                      ? "border-gold/50 bg-gold/12 text-gold"
                      : "border-line/80 text-mute hover:border-line hover:text-dim"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </Field>

          {isEdit ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="叙事视角">
                  <Select
                    value={pov}
                    onChange={setPov}
                    options={POVS.map((p) => ({ value: p, label: p }))}
                  />
                </Field>
                <Field label="目标字数">
                  <TextInput
                    type="number"
                    value={target}
                    onChange={(e) => setTarget(Number(e.target.value))}
                    placeholder="120000"
                  />
                </Field>
              </div>

              <Field label="故事梗概" hint="三五行即可">
                <TextArea
                  rows={4}
                  value={synopsis}
                  onChange={(e) => setSynopsis(e.target.value)}
                  placeholder="谁，在什么地方，被卷入了什么，最后要面对什么。"
                />
              </Field>

              <Field label="文风指南" hint="AI 会严格遵循">
                <TextArea
                  rows={4}
                  value={style}
                  onChange={(e) => setStyle(e.target.value)}
                  placeholder="例如：冷峻克制，多用短句与白描，少形容词；对话简练，留白多于解释。"
                />
              </Field>

              <div className="flex items-center gap-2 border-t border-line/60 pt-3">
                <span className="flex items-center gap-1 text-[10.5px] text-mute">
                  <Sparkles size={10} /> 已写 {project?.wordCount ?? 0} 字 · {project?.chapterCount ?? 0} 章
                </span>
                <div className="flex-1" />
                <Button variant="danger" size="xs" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={10} /> 删除作品
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-line/60 bg-surface2/25 p-3 text-[10.5px] leading-relaxed text-mute">
              <BookPlus size={13} className="mt-0.5 shrink-0 text-gold/70" />
              <span>
                创建后会生成第一章空白稿。你可以在「作品设置」里补充梗概、文风与目标字数，
                这些会直接影响 AI 的续写风格。
              </span>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="删除作品"
        width="420px"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (project) void removeProject(project.id);
                setConfirmDelete(false);
                setModal(null);
              }}
            >
              全部删除
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-dim">
          将删除
          <span className="mx-1 font-serif text-ink">《{project?.title}》</span>
          及其全部章节与设定，此操作无法撤销。
        </p>
      </Modal>
    </>
  );
}
