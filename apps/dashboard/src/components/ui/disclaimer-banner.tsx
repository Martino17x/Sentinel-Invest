import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

// ============================================================
// DisclaimerBanner — Radar CCL Compliance (S3.1)
// Sticky top, informative disclaimer, CNV guardrail.
// - animate-in fade-in slide-in-from-top-1 duration-200
// - motion-reduce:animate-none (respeta prefers-reduced-motion)
// - role="note" para accesibilidad
// - Text: disclaimer exacto del envelope + link a /terms
// Uso: <DisclaimerBanner /> en RadarPage header, persistente sobre tabla.
// ============================================================

const DISCLAIMER_TEXT =
  "Información educativa, no asesoramiento financiero. No constituye recomendación CNV.";

export interface DisclaimerBannerProps {
  className?: string;
  /** Override text (default: DISCLAIMER_TEXT) */
  text?: string;
}

export function DisclaimerBanner({ className, text = DISCLAIMER_TEXT }: DisclaimerBannerProps) {
  return (
    <div
      role="note"
      aria-label="Aviso informativo"
      data-testid="disclaimer-banner"
      className={cn(
        // sticky top, separador visual, backdrop sutil
        "sticky top-0 z-20 w-full border-b border-border bg-muted/80 px-3 py-2 text-center text-xs leading-5 text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-muted/60",
        // enter/exit animation — respeta prefers-reduced-motion
        "animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none",
        className,
      )}
    >
      <p className="mx-auto max-w-4xl text-balance">
        {text}{" "}
        <Link
          to="/terms"
          className="font-medium text-foreground underline underline-offset-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Ver términos
        </Link>
      </p>
    </div>
  );
}

export default DisclaimerBanner;
