import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TradingViewWidgetProps {
  /** Símbolo en formato TradingView, ej: "BCBA:GGAL" */
  symbol: string;
  theme?: "light" | "dark";
  height?: number | string;
  className?: string;
}

/**
 * Convierte (mercado, símbolo) → símbolo TradingView:
 *   bcba/bonds → "BCBA:GGAL", nasdaq → "NASDAQ:AAPL", nyse → "NYSE:BRK.B"
 */
export function tradingViewSymbol(market: string, symbol: string): string {
  const m = market.toLowerCase();
  if (m.includes("nasdaq")) return `NASDAQ:${symbol}`;
  if (m.includes("nyse")) return `NYSE:${symbol}`;
  return `BCBA:${symbol}`;
}

/**
 * Widget de gráfico avanzado de TradingView (embed oficial, gratuito).
 *
 * El script de TradingView usa document.currentScript para reemplazarse y
 * leer la config inline. Los <script> inyectados vía innerHTML NO se
 * ejecutan en el navegador, así que el script se crea con
 * document.createElement("script") (textContent = config) y se appendea —
 * así el navegador lo ejecuta y document.currentScript funciona.
 *
 * MOBILE: el iframe captura los gestos táctiles y bloquea el scroll de la
 * página: pointer-events:none por defecto + botón "Activar".
 */
export function TradingViewWidget({
  symbol,
  theme,
  height,
  className,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [interactive, setInteractive] = useState(false);

  const isDark =
    theme === "dark" ||
    (theme === undefined &&
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"));
  const activeTheme = isDark ? "dark" : "light";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Limpiar el contenedor antes de inyectar (evita duplicados con HMR/strict mode)
    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    const config = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      timezone: "America/Buenos_Aires",
      theme: activeTheme,
      style: "1",
      locale: "es",
      backgroundColor: activeTheme === "dark" ? "rgba(20, 20, 20, 1)" : "rgba(255, 255, 255, 1)",
      gridColor: activeTheme === "dark" ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)",
      hide_top_toolbar: false,
      allow_symbol_change: false,
      calendar: false,
      hide_volume: true,
      support_host: "https://www.tradingview.com",
    });

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.text = config;
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [symbol, activeTheme]);

  return (
    <div
      className={cn(
        "relative w-full h-[420px] sm:h-[480px] lg:h-[540px]",
        className
      )}
      style={height != null ? { height } : undefined}
    >
      {/* Contenedor del widget — pointer-events deshabilitado hasta activar */}
      <div
        ref={containerRef}
        className={`tradingview-widget-container h-full w-full overflow-hidden rounded-lg border transition-opacity ${
          interactive ? "" : "pointer-events-none"
        }`}
      />

      {/* Botón de activación — visible en pantallas táctiles */}
      {!interactive && (
        <button
          type="button"
          onClick={() => setInteractive(true)}
          className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-background/40 text-sm font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
          aria-label="Activar gráfico interactivo"
        >
          <Maximize2 className="h-4 w-4" />
          Tocar para interactuar con el gráfico
        </button>
      )}
    </div>
  );
}
