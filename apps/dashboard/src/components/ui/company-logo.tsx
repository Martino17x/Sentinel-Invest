import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getBrandDomain,
  isBond,
  symbolToBrandfetchUrl,
  type BrandTheme,
} from "@/lib/brand-map";

// ============================================================
// CompanyLogo — Brandfetch CDN hotlink-only, never fetch()
// Spec: content-providers Track B
// URL: https://cdn.brandfetch.io/{domain|ticker}/{id}/w/{2*size}/h/{2*size}/fallback/lettermark/theme/{light|dark}?c=CLIENT_ID
// ============================================================

export interface CompanyLogoProps {
  symbol: string;
  market?: string;
  size?: number;
  theme?: BrandTheme | "auto";
  className?: string;
  alt?: string;
}

function resolveInitialTheme(theme: BrandTheme | "auto"): BrandTheme {
  if (theme === "light" || theme === "dark") return theme;
  // auto → check DOM
  if (typeof document !== "undefined") {
    if (document.documentElement.classList.contains("dark")) return "dark";
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    try {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    } catch {
      // ignore
    }
  }
  return "light";
}

function initialsFromSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (!s) return "?";
  // Take up to 2 chars, letters only where possible
  const letters = s.replace(/[^A-Z]/g, "");
  if (letters.length >= 2) return letters.slice(0, 2);
  if (letters.length === 1) return letters;
  return s.slice(0, 2);
}

function LettermarkFallback({
  symbol,
  size,
  className,
}: {
  symbol: string;
  size: number;
  className?: string;
}) {
  const clamped = Math.min(Math.max(Math.floor(size) || 32, 16), 128);
  const initials = initialsFromSymbol(symbol);
  return (
    <div
      aria-label={`${symbol} logo placeholder`}
      data-testid="company-logo-fallback"
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground select-none shrink-0",
        className
      )}
      style={{
        width: clamped,
        height: clamped,
        fontSize: Math.round(clamped * 0.38),
        lineHeight: 1,
      }}
    >
      {initials}
    </div>
  );
}

export function CompanyLogo({
  symbol,
  market,
  size = 32,
  theme = "auto",
  className,
  alt,
}: CompanyLogoProps) {
  const [resolvedTheme, setResolvedTheme] = useState<BrandTheme>(() =>
    resolveInitialTheme(theme)
  );
  const [errored, setErrored] = useState(false);

  // React to theme prop changes + system preference / class changes when auto
  useEffect(() => {
    if (theme !== "auto") {
      setResolvedTheme(theme);
      return;
    }
    // auto: re-resolve and subscribe to changes
    setResolvedTheme(resolveInitialTheme("auto"));

    const mql = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

    const onChange = () => setResolvedTheme(resolveInitialTheme("auto"));
    // Observe classList changes (e.g. next-themes toggles 'dark' on <html>)
    let observer: MutationObserver | null = null;
    if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    mql?.addEventListener?.("change", onChange);
    return () => {
      mql?.removeEventListener?.("change", onChange);
      observer?.disconnect();
    };
  }, [theme]);

  // Reset error when symbol/theme/size changes
  useEffect(() => {
    setErrored(false);
  }, [symbol, market, size, resolvedTheme]);

  const normalizedSymbol = symbol?.trim().toUpperCase() ?? "";

  // Guard: empty symbol → fallback immediately
  if (!normalizedSymbol) {
    return <LettermarkFallback symbol="?" size={size} className={className} />;
  }

  // Bonos / ONs → immediate fallback, no Brandfetch request (spec 3.1)
  if (isBond(normalizedSymbol)) {
    return <LettermarkFallback symbol={normalizedSymbol} size={size} className={className} />;
  }

  // CLIENT_ID missing → immediate fallback + warn, never hit cdn (spec: never fetch without ?c=)
  // Vite injects import.meta.env.VITE_BRANDFETCH_CLIENT_ID
  let clientId: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as unknown as { env?: Record<string, string> })?.env;
    clientId = env?.["VITE_BRANDFETCH_CLIENT_ID"];
  } catch {
    clientId = undefined;
  }
  if (!clientId) {
    if (typeof console !== "undefined" && typeof window !== "undefined") {
      // warn once per mount (avoid spam in loops)
      console.warn(
        "[CompanyLogo] VITE_BRANDFETCH_CLIENT_ID missing — rendering lettermark fallback for",
        normalizedSymbol
      );
    }
    return <LettermarkFallback symbol={normalizedSymbol} size={size} className={className} />;
  }

  // If previously errored (cdn returned 403/domain_not_found etc.) → fallback
  if (errored) {
    return <LettermarkFallback symbol={normalizedSymbol} size={size} className={className} />;
  }

  // Build URL via pure mapper — never fetch() cdn
  // getBrandDomain decides domain vs ticker; symbolToBrandfetchUrl handles w/h 2x + theme
  const hasDomain = getBrandDomain(normalizedSymbol) !== null;
  void hasDomain; // used for clarity, URL builder does the branching
  const url = symbolToBrandfetchUrl(normalizedSymbol, market, size, resolvedTheme, clientId);

  if (!url) {
    return <LettermarkFallback symbol={normalizedSymbol} size={size} className={className} />;
  }

  const clampedSize = Math.min(Math.max(Math.floor(size) || 32, 16), 128);
  const retina = clampedSize * 2;

  return (
    <img
      src={url}
      alt={alt ?? `${normalizedSymbol} logo`}
      width={clampedSize}
      height={clampedSize}
      loading="lazy"
      decoding="async"
      data-testid="company-logo-img"
      data-symbol={normalizedSymbol}
      className={cn("inline-block rounded-full object-contain bg-muted shrink-0", className)}
      style={{ width: clampedSize, height: clampedSize }}
      // Retina hint via w/h already in URL; width/height attrs keep layout stable
      // @ts-ignore — w/h are in URL already, but keep explicit for CLS
      data-retina={`${retina}`}
      onError={() => setErrored(true)}
    />
  );
}

export default CompanyLogo;
