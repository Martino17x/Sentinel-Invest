import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";

interface TradingViewWidgetProps {
  /** Símbolo en formato TradingView, ej: "BCBA:GGAL" */
  symbol: string;
  theme?: "light" | "dark";
  height?: number;
}

/**
 * Widget de gráfico avanzado de TradingView (embed oficial, gratuito).
 *
 * El script de TradingView usa document.currentScript para reemplazarse,
 * por eso se inyecta como HTML string (innerHTML), no con createElement.
 *
 * MOBILE: el iframe captura los gestos táctiles y bloquea el scroll de la
 * página. Patrón estándar (como Google Maps embed): pointer-events:none
 * por defecto + botón "Activar" que habilita la interacción con el gráfico.
 */
export function TradingViewWidget({
  symbol,
  theme = "light",
  height = 480,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Limpiar el contenedor antes de inyectar (evita duplicados con HMR/strict mode)
    container.innerHTML = "";

    const config = JSON.stringify({
      autosize: true,
      symbol,
      interval: "D",
      timezone: "America/Buenos_Aires",
      theme,
      style: "1",
      locale: "es",
      backgroundColor: "rgba(255, 255, 255, 1)",
      gridColor: "rgba(0, 0, 0, 0.06)",
      hide_top_toolbar: false,
      allow_symbol_change: false,
      calendar: false,
      hide_volume: true,
      support_host: "https://www.tradingview.com",
    });

    container.innerHTML = `
      <div class="tradingview-widget-container__widget"></div>
      <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js">
        ${config}
      <\/script>
    `;

    return () => {
      container.innerHTML = "";
    };
  }, [symbol, theme]);

  return (
    <div className="relative">
      {/* Contenedor del widget — pointer-events deshabilitado hasta activar */}
      <div
        ref={containerRef}
        className={`tradingview-widget-container w-full overflow-hidden rounded-lg border transition-opacity ${
          interactive ? "" : "pointer-events-none"
        }`}
        style={{ height }}
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
