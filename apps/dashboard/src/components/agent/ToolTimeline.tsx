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

function ToolStatusIcon({
  tool,
  live,
  tone,
}: {
  tool: TimelineTool;
  live: boolean;
  tone: "default" | "modal";
}) {
  if (!tool.status) {
    return live ? (
      <Loader2
        className={cn(
          "size-3.5 shrink-0 animate-spin motion-reduce:animate-none",
          tone === "modal" ? "text-white/60" : "text-muted-foreground"
        )}
      />
    ) : (
      <Wrench
        className={cn(
          "size-3.5 shrink-0",
          tone === "modal" ? "text-white/60" : "text-muted-foreground"
        )}
      />
    );
  }
  const Icon = STATUS_ICONS[tool.status] ?? XCircle;
  return (
    <Icon
      className={cn(
        "size-3.5 shrink-0",
        tone === "modal"
          ? tool.status === "success"
            ? "text-emerald-300"
            : tool.status === "needs_approval"
              ? "text-amber-300"
              : tool.status === "excluded"
                ? "text-white/40"
                : "text-red-300"
          : tool.status === "success"
            ? "text-emerald-600"
            : tool.status === "needs_approval"
              ? "text-amber-600"
              : tool.status === "excluded"
                ? "text-muted-foreground"
                : "text-destructive"
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
  cancel_order: "Cancelar operación",
  subscribe_fci: "Suscripción a FCI",
  rescue_fci: "Rescate de FCI",
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replaceAll("_", " ");
}

export function ToolTimeline({
  tools,
  live = false,
  className,
  tone = "default",
}: {
  tools: TimelineTool[];
  live?: boolean;
  className?: string;
  tone?: "default" | "modal";
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
        "overflow-hidden rounded-xl border text-xs",
        tone === "modal" ? "border-white/10 bg-white/10" : "bg-background/60",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 transition-colors",
          tone === "modal"
            ? "text-white/60 hover:text-white"
            : "text-muted-foreground hover:text-foreground"
        )}
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

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          !collapsed ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <ul className="space-y-1 border-t border-white/10 px-2.5 py-2">
            {tools.map((tool) => (
              <li key={tool.id} className="flex min-w-0 items-center gap-2">
                <ToolStatusIcon tool={tool} live={live} tone={tone} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    tone === "modal" ? "text-white/80" : "text-muted-foreground"
                  )}
                >
                  {toolLabel(tool.name)}
                </span>
                {tool.summary && (
                  <span
                    className={cn(
                      "max-w-[55%] shrink-0 truncate pl-2",
                      tone === "modal" ? "text-white/40" : "text-muted-foreground/70"
                    )}
                  >
                    {tool.summary}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
