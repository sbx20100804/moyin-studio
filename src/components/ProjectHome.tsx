import { motion } from "motion/react";
import { ArrowRight, BookPlus, Feather } from "lucide-react";
import { useStore } from "@/lib/store";
import { formatCount, relativeDay } from "@/lib/format";
import { Button } from "./ui";

export default function ProjectHome() {
  const projects = useStore((s) => s.projects);
  const setProjectModal = useStore((s) => s.setProjectModal);
  const openProject = useStore((s) => s.openProject);

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-8">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/[0.07] blur-[100px]" />
      <div className="relative z-10 w-full max-w-[460px] text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="mx-auto mb-6 flex h-[68px] w-[68px] items-center justify-center rounded-[22px] border border-gold/25 bg-gradient-to-br from-gold/20 via-gold/5 to-transparent shadow-[0_20px_60px_-24px_rgba(217,168,95,0.5)]"
        >
          <span className="font-serif text-[32px] leading-none text-gold">墨</span>
        </motion.div>

        <h1 className="font-serif text-[30px] font-medium tracking-[0.06em] text-ink">
          把记忆交给它，你只管写
        </h1>
        <p className="mx-auto mt-3 max-w-[360px] text-[12px] leading-[1.9] text-mute">
          设定卡、前情摘要与最近正文会被拼装成上下文。
          长篇写到三十章，人物也不会突然变了一个人。
        </p>

        <Button
          variant="primary"
          size="md"
          className="mt-7"
          onClick={() => setProjectModal({ mode: "new" })}
        >
          <BookPlus size={14} /> 新建第一本书
        </Button>

        {projects.length ? (
          <div className="mt-10 text-left">
            <div className="mb-2 flex items-center gap-2 text-[9.5px] tracking-[0.24em] text-mute">
              <Feather size={9} /> 书架
            </div>
            <div className="space-y-1">
              {projects.slice(0, 4).map((p) => (
                <motion.button
                  key={p.id}
                  whileHover={{ x: 3 }}
                  onClick={() => void openProject(p.id)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-line/70 hover:bg-surface2/40"
                >
                  <span className="h-8 w-[3px] rounded-full bg-gradient-to-b from-gold/70 to-transparent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-[13.5px] text-ink">
                      {p.title}
                    </span>
                    <span className="text-[10px] text-mute">
                      {formatCount(p.wordCount)} 字 · {p.chapterCount} 章 · {relativeDay(p.updatedAt)}
                    </span>
                  </span>
                  <ArrowRight
                    size={12}
                    className="text-mute opacity-0 transition-opacity group-hover:opacity-100"
                  />
                </motion.button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
