import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MODEL_META, type StrategyLetter, LETTER_TO_MODEL } from "@/lib/models";
import { cn } from "@/lib/utils";

/**
 * Strategy label with an explanation that opens on hover (desktop), focus (keyboard) and tap (touch).
 */
export function ModelLabel({ letter, compact = false, className }: { letter: StrategyLetter; compact?: boolean; className?: string }) {
  const meta = MODEL_META[LETTER_TO_MODEL[letter]];
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(false), setPinned(false));
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={cn("relative inline-flex", className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => !pinned && setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => {
          setPinned((p) => !p);
          setOpen((o) => !pinned || !o);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        className="inline-flex items-center gap-2 rounded-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <StrategyBadge letter={letter} />
        {!compact && <span className="font-semibold text-forest">{meta.name}</span>}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-forest/10 bg-white p-4 text-left text-sm font-normal leading-relaxed text-slate-700 shadow-xl animate-in fade-in-0 zoom-in-95"
        >
          <span className="mb-1 flex items-center gap-2 font-semibold text-forest">
            <StrategyBadge letter={letter} /> {meta.name}
          </span>
          <span className="block">{meta.tooltip}</span>
          <Link to="/advanced/compare#strategies" className="mt-2 inline-block font-semibold text-fresh hover:underline">
            Learn more →
          </Link>
        </span>
      )}
    </span>
  );
}

export function StrategyBadge({ letter, size = "md" }: { letter: StrategyLetter; size?: "md" | "lg" }) {
  const d = letter === "D";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-bold",
        size === "lg" ? "h-9 w-9 text-base" : "h-7 w-7 text-sm",
        d ? "bg-fresh text-white" : "bg-slate-200 text-slate-700",
      )}
    >
      {letter}
    </span>
  );
}
