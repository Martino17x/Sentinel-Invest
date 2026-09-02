import * as React from "react";

export type SourceFilterValue = "todos" | "iol" | "ppi" | "byma" | "cache" | "snapshot";

export interface SourceFilterProps {
  value: SourceFilterValue;
  onChange: (v: SourceFilterValue) => void;
  counts: Record<string, number>;
}

const TABS: { value: SourceFilterValue; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "iol", label: "IOL" },
  { value: "ppi", label: "PPI" },
  { value: "byma", label: "BYMA" },
  { value: "cache", label: "Cache" },
];

export function SourceFilter({ value, onChange, counts }: SourceFilterProps) {
  return (
    <div role="tablist" aria-label="Filtrar por fuente" className="flex flex-wrap gap-1.5">
      {TABS.map((tab) => {
        const active = value === tab.value;
        const count = counts[tab.value] ?? (tab.value === "todos" ? Object.values(counts).reduce((a, b) => a + b, 0) : 0);
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            aria-controls="quotes-panel"
            onClick={() => onChange(tab.value)}
            className={
              active
                ? "inline-flex items-center gap-1.5 rounded-full border bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm"
                : "inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }
          >
            {tab.label}
            <span
              className={
                active
                  ? "rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] tabular-nums"
                  : "rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums"
              }
              aria-label={`${count} instrumentos`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default SourceFilter;
