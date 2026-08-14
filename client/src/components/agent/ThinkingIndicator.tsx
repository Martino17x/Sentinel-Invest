import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

// ============================================================
// ThinkingIndicator — "Pensando… / Analizando…" con puntos
// animados. Respeta prefers-reduced-motion (frase fija, sin
// animación ni rotación de mensajes).
// ============================================================

const PHRASES = ["Pensando…", "Analizando…", "Consultando datos…"];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export function ThinkingIndicator({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(
      () => setPhraseIndex((i) => (i + 1) % PHRASES.length),
      2_600
    );
    return () => clearInterval(timer);
  }, [reduced]);

  return (
    <div
      className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
      role="status"
      aria-live="polite"
    >
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-current animate-pulse motion-reduce:animate-none"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </span>
      {reduced ? PHRASES[0] : PHRASES[phraseIndex]}
    </div>
  );
}
