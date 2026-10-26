import { AnimatePresence, motion } from "motion/react";
import { X, Loader2 } from "lucide-react";
import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/format";

/* ------------------------------------------------------------------ button */

type Variant = "primary" | "soft" | "ghost" | "outline" | "danger";
type Size = "xs" | "sm" | "md";

const variantClass: Record<Variant, string> = {
  primary:
    "bg-gold text-[#1a1408] hover:bg-goldsoft shadow-[0_8px_24px_-12px_var(--c-gold)] font-medium",
  soft: "bg-surface2 text-ink hover:bg-line/60 border border-line/70",
  ghost: "text-dim hover:text-ink hover:bg-surface2/70",
  outline: "border border-line text-ink hover:border-gold/50 hover:bg-surface2/50",
  danger: "bg-cinnabar/15 text-cinnabar hover:bg-cinnabar/25 border border-cinnabar/30",
};

const sizeClass: Record<Size, string> = {
  xs: "h-7 px-2.5 text-[11.5px] gap-1.5 rounded-lg",
  sm: "h-8 px-3 text-[12.5px] gap-1.5 rounded-[10px]",
  md: "h-9.5 px-4 text-[13px] gap-2 rounded-xl",
};

export function Button({
  variant = "soft",
  size = "sm",
  className,
  children,
  loading,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      className={cx(
        "inline-flex items-center justify-center whitespace-nowrap transition-colors duration-150 disabled:opacity-45 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-gold/45",
        variantClass[variant],
        sizeClass[size],
        className
      )}
      {...(rest as any)}
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : null}
      {children}
    </motion.button>
  );
}

export function IconButton({
  className,
  children,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      className={cx(
        "inline-flex h-8 w-8 items-center justify-center rounded-[9px] transition-colors duration-150 outline-none",
        active ? "bg-gold/12 text-gold" : "text-dim hover:bg-surface2/80 hover:text-ink",
        className
      )}
      {...(rest as any)}
    >
      {children}
    </motion.button>
  );
}

/* ------------------------------------------------------------------- inputs */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 flex items-center justify-between">
        <span className="text-[11.5px] font-medium tracking-wide text-dim">{label}</span>
        {hint ? <span className="text-[10.5px] text-mute">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-line/80 bg-surface2/40 px-3 py-2 text-[13px] text-ink placeholder:text-mute/70 outline-none transition-colors focus:border-gold/55 focus:bg-surface2/70";

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputBase, className)} {...rest} />;
}

export function TextArea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(inputBase, "resize-none leading-[1.8] scroll-thin", className)}
      {...rest}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={cx("relative", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(inputBase, "appearance-none pr-8 cursor-pointer")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
      >
        <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-gold/80" : "bg-line"
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 700, damping: 34 }}
        className="absolute top-[3px] h-4 w-4 rounded-full bg-[#0b0c10] shadow"
        style={{ left: checked ? 20 : 3 }}
      />
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className="range-gold w-full cursor-pointer"
      style={{ ["--pct" as any]: `${pct}%` }}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
        active
          ? "border-gold/45 bg-gold/12 text-gold"
          : "border-line/80 text-mute hover:border-line hover:text-dim",
        className
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- modal */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  width = "680px",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-[6px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.965, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.975, y: 6 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            style={{ width }}
            className="relative z-10 flex max-h-[88vh] flex-col overflow-hidden rounded-[22px] border border-line/90 bg-surface shadow-[var(--shadow-panel)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line/70 px-6 py-4.5">
              <div>
                <h2 className="text-[15px] font-medium tracking-wide text-ink">{title}</h2>
                {subtitle ? (
                  <p className="mt-1 text-[11.5px] text-mute">{subtitle}</p>
                ) : null}
              </div>
              <IconButton onClick={onClose} aria-label="关闭">
                <X size={15} />
              </IconButton>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer ? (
              <div className="flex items-center justify-end gap-2 border-t border-line/70 bg-surface2/30 px-6 py-3.5">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

/* ------------------------------------------------------------------- misc */

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-mute">
      <span>{children}</span>
      <span className="h-px flex-1 bg-line/60" />
    </div>
  );
}

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cx("animate-spin text-gold", className)} />;
}
