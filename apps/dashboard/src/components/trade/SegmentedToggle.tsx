import { cn } from "@/lib/utils";

export type SegmentedAccent = "green" | "red" | "neutral";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Acento del indicador deslizante. */
  accent?: SegmentedAccent;
  size?: "sm" | "md";
  className?: string;
}

const ACCENT_CLASSES: Record<SegmentedAccent, string> = {
  green: "bg-emerald-600",
  red: "bg-red-600",
  neutral: "bg-primary",
};

/**
 * Toggle segmentado con indicador deslizante (estilo IOL/apps de trading).
 * Se usa para Comprar/Vender, Cantidad/Monto y Modalidad.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  accent = "neutral",
  size = "md",
  className,
}: SegmentedToggleProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const width = 100 / options.length;

  return (
    <div
      className={cn("relative grid rounded-full bg-muted p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="group"
    >
      <span
        aria-hidden
        className={cn(
          "absolute bottom-1 top-1 rounded-full shadow-sm transition-transform duration-200 ease-out",
          ACCENT_CLASSES[accent]
        )}
        style={{ left: "4px", width: `calc(${width}% - 8px)`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 cursor-pointer rounded-full text-center font-medium transition-colors",
              size === "sm" ? "px-2 py-1 text-xs" : "px-2 py-1.5 text-sm",
              active ? "text-white" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
