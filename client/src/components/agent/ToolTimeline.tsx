import { useEffect, useState } from "react";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { AgentToolStatus } from "@/lib/agent-chat";

// ============================================================
// ToolTimeline — muestra las herramientas que el agente usó en
// una respuesta. En vivo (live=true): status indefinido = spinner
// hasta que llega tool_end. Colapsable: "Usó N herramientas".
// ============================================================

export interface TimelineTool {
  id: string;
  name: string;
  status?: AgentToolStatus; // undefined = en curso
  summary?: string;
}

const STATUS_ICONS: Partial<Record<AgentToolStatus, LucideIcon>> = {
  success: CheckCircle2,
  excluded: Ban,
  needs_approval: Clock,
  error: XCircle,
  timeout: XCircle,
  unknown_tool: XCircle,
  validation_error: XCircle,
  account_error: XCircle,
};

function ToolStatusIcon({ tool, live }: { tool: TimelineTool; live: boolean }) {
  if (!tool.status) {
    return live ? (
      <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
    ) : (
      <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
    );
  }
  const Icon = STATUS_ICONS[tool.status] ?? XCircle;
  return (
    <Icon
      className={cn(
        "size-3.5 shrink-0",
        tool.status === "success" && "text-emerald-600",
        tool.status === "needs_approval" && "text-amber-600",
        tool.status === "excluded" && "text-muted-foreground",
        tool.status !== "success" &&
          tool.status !== "needs_approval" &&
          tool.status !== "excluded" &&
          "text-destructive"
      )}
    />
  );
}

const TOOL_LABELS: Record<string, string> = {
  get_portfolio: "Tu cartera",
  get_quote: "Cotización",
  search_instruments: "Búsqueda de instrumentos",
  get_dollar_rates: "Dólar",
  get_monthly_reports: "Reportes mensuales",
  place_order: "Orden de compra/venta",
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replaceAll("_", " ");
}

export function ToolTimeline({
  tools,
  live = false,
  className,
}: {
  tools: TimelineTool[];
  live?: boolean;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(tools.length > 2);

  // Al crecer el timeline (streaming), colapsar para no tapar el chat
  useEffect(() => {
    if (tools.length > 2) setCollapsed(true);
  }, [tools.length]);

  if (tools.length === 0) return null;

  const count = tools.length;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-background/60 text-xs",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={!collapsed}
      >
        <span className="font-medium">
          Usó {count} herramienta{count === 1 ? "" : "s"}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform",
            !collapsed && "rotate-180"
          )}
        />
      </button>

      {!collapsed && (
        <ul className="space-y-1 border-t px-2.5 py-2">
          {tools.map((tool) => (
            <li key={tool.id} className="flex items-center gap-2">
              <ToolStatusIcon tool={tool} live={live} />
              <span className="min-w-0 truncate text-muted-foreground">
                {toolLabel(tool.name)}
              </span>
              {tool.summary && (
                <span className="ml-auto shrink-0 truncate pl-2 text-muted-foreground/70">
                  {tool.summary}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
