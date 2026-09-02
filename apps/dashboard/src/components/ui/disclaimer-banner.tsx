import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// DisclaimerBanner — Radar CCL Compliance (S3.1) + dismissible
// Sticky top, informativo, CNV guardrail, aparición ocasional.
// - Aparece 1 vez cada 7 días si se cierra con X (localStorage).
// - Sin dismiss previo: siempre visible (ocasional = respeta 7d).
// - Botón X con aria-label="Cerrar aviso", animación salida,
//   respeta prefers-reduced-motion (motion-reduce:animate-none).
// - role="note" para accesibilidad.
// - Text: disclaimer exacto del envelope + link a /terms
// Uso: <DisclaimerBanner /> en RadarPage, renta-fija, cotizaciones, etc.
// Props: dismissible (default true), storageKey, dismissDays.
// ============================================================

const DISCLAIMER_TEXT =
  "Información educativa, no asesoramiento financiero. No constituye recomendación CNV.";

export const DISCLAIMER_STORAGE_KEY = "disclaimer-dismissed";
export const DISCLAIMER_DISMISS_DAYS = 7;

function isDismissed(storageKey: string, dismissDays: number): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return false;
    // Soporta ISO string (nuevo) y timestamp numérico (legacy)
    let ts = Date.parse(raw);
    if (Number.isNaN(ts)) {
      const n = Number(raw);
      if (!Number.isNaN(n) && n > 0) ts = n;
      else return false;
    }
    const elapsed = Date.now() - ts;
    return elapsed >= 0 && elapsed < dismissDays * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export interface DisclaimerBannerProps {
  className?: string;
  /** Override text (default: DISCLAIMER_TEXT) */
  text?: string;
  /** Mostrar botón X y lógica de persistencia. Default true. */
  dismissible?: boolean;
  /** Key de localStorage. Default "disclaimer-dismissed" */
  storageKey?: string;
  /** Días que permanece oculto tras cerrar. Default 7. */
  dismissDays?: number;
}

export function DisclaimerBanner({
  className,
  text = DISCLAIMER_TEXT,
  dismissible = true,
  storageKey = DISCLAIMER_STORAGE_KEY,
  dismissDays = DISCLAIMER_DISMISS_DAYS,
}: DisclaimerBannerProps) {
  const [open, setOpen] = useState(() => {
    if (!dismissible) return true;
    // Lazy init: lee localStorage sincrónico para evitar flash
    return !isDismissed(storageKey, dismissDays);
  });
  const [exiting, setExiting] = useState(false);

  // Sincroniza si otra pestaña/otro banner cambió el storage
  useEffect(() => {
    if (!dismissible) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey) {
        setOpen(!isDismissed(storageKey, dismissDays));
        setExiting(false);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [dismissible, storageKey, dismissDays]);

  const handleDismiss = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, new Date().toISOString());
    } catch {
      // localStorage no disponible (privado/storage lleno) — cerrar igual en memoria
    }

    // Respetar prefers-reduced-motion: sin animación
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setOpen(false);
      return;
    }

    setExiting(true);
    window.setTimeout(() => setOpen(false), 200);
  }, [storageKey]);

  if (!open) return null;

  return (
    <div
      role="note"
      aria-label="Aviso informativo"
      data-testid="disclaimer-banner"
      className={cn(
        // sticky top, separador visual, backdrop sutil — no tapa contenido (sticky, no fixed)
        "sticky top-0 z-20 flex w-full items-center justify-center gap-2 border-b border-border bg-muted/80 px-3 py-2 text-center text-xs leading-5 text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-muted/60",
        // enter/exit animation — respeta prefers-reduced-motion
        exiting
          ? "animate-out fade-out slide-out-to-top-1 duration-200 motion-reduce:animate-none"
          : "animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none",
        className,
      )}
    >
      <p className="mx-auto max-w-4xl flex-1 text-balance">
        {text}{" "}
        <Link
          to="/terms"
          className="font-medium text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Ver términos
        </Link>
      </p>
      {dismissible && (
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={handleDismiss}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer motion-reduce:transition-none transition-colors"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default DisclaimerBanner;
