import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/format";

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
};

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);

  return createPortal(
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <motion.button
              key={t.id}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 520, damping: 34 }}
              onClick={() => dismiss(t.id)}
              className={cx(
                "pointer-events-auto flex max-w-[520px] items-center gap-2 rounded-full border px-4 py-2 text-[11.5px] shadow-[0_18px_40px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl",
                t.kind === "error"
                  ? "border-cinnabar/35 bg-cinnabar/12 text-cinnabar"
                  : t.kind === "success"
                    ? "border-gold/30 bg-surface/95 text-ink"
                    : "border-line bg-surface/95 text-dim"
              )}
            >
              <Icon
                size={12}
                className={cx(
                  t.kind === "success" ? "text-gold" : t.kind === "error" ? "text-cinnabar" : "text-mute"
                )}
              />
              <span className="truncate">{t.message}</span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body
  );
}
