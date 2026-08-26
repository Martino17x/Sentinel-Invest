import { useState, Fragment } from "react";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InvestmentPlan } from "@/features/portafolio/api";

export type PlanDiff = {
  added: Record<string, number>;
  removed: string[];
  changed: Array<{ symbol: string; from: number; to: number }>;
};

export function jsonDiff(
  current: Record<string, number>,
  previous: Record<string, number> | null
): PlanDiff {
  if (!previous) return { added: { ...current }, removed: [], changed: [] };
  const added: Record<string, number> = {};
  const removed: string[] = [];
  const changed: Array<{ symbol: string; from: number; to: number }> = [];
  for (const [k, v] of Object.entries(current)) {
    if (!(k in previous)) added[k] = v;
    else if (previous[k] !== v) changed.push({ symbol: k, from: previous[k], to: v });
  }
  for (const k of Object.keys(previous)) {
    if (!(k in current)) removed.push(k);
  }
  changed.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return { added, removed, changed };
}

function formatAllocation(m: Record<string, number> | null | undefined): string {
  if (!m || Object.keys(m).length === 0) return "—";
  return Object.entries(m)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k} ${v}%`)
    .join(" · ");
}

function getAllocation(plan: InvestmentPlan): Record<string, number> {
  return (plan.allocation_target ?? plan.allocationTarget ?? {}) as Record<string, number>;
}

type Props = {
  plans: InvestmentPlan[];
};

export function PlanTimeline({ plans }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    // expand v2 (latest) by default if exists, else v1
    if (plans.length >= 2) return new Set([plans[0].version]);
    if (plans.length === 1) return new Set([plans[0].version]);
    return new Set();
  });

  // keep expanded in sync if plans change length externally — no need complex effect

  function toggle(v: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  if (plans.length === 0) {
    return (
      <Card className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Timeline
          </CardTitle>
          <CardDescription>Historial versionado DESC</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">Aún no hay versiones. La v1 se creará con el seed.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Timeline
        </CardTitle>
        <CardDescription>
          {plans.length} {plans.length === 1 ? "versión" : "versiones"} — DESC por versión, diff cliente vs v(N-1)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="relative border-s border-border ms-3 space-y-0">
          {plans.map((plan, idx) => {
            const prev = idx < plans.length - 1 ? plans[idx + 1] : null;
            const currAlloc = getAllocation(plan);
            const prevAlloc = prev ? getAllocation(prev) : null;
            const diff = jsonDiff(currAlloc, prevAlloc);
            const isExpanded = expanded.has(plan.version);
            const hasDiff = diff.changed.length > 0 || Object.keys(diff.added).length > 0 || diff.removed.length > 0;

            return (
              <li key={plan.id} className="ms-6 pb-6 last:pb-0">
                {/* dot */}
                <span className="absolute -start-2 flex h-4 w-4 items-center justify-center rounded-full border bg-background">
                  <span className={`h-2 w-2 rounded-full ${idx === 0 ? "bg-primary" : "bg-muted-foreground"}`} />
                </span>

                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-muted border">v{plan.version}</span>
                      <span className="font-medium truncate">{plan.title}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {plan.created_by ?? plan.createdBy ?? "user"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {plan.created_at ?? plan.createdAt
                        ? new Date((plan.created_at ?? plan.createdAt) as string).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                      {plan.objective ? ` · ${String(plan.objective).slice(0, 80)}` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => toggle(plan.version)}>
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {isExpanded ? "Ocultar" : hasDiff ? "Ver diff" : "Ver"}
                  </Button>
                </div>

                {/* allocation line always */}
                <p className="mt-2 text-xs tabular-nums text-muted-foreground break-words">
                  {formatAllocation(currAlloc)}
                </p>

                {/* diff highlight when expanded */}
                {isExpanded && (
                  <div className="mt-3 rounded-lg border bg-muted/30 p-3 space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-200 motion-reduce:animate-none">
                    {/* allocation diff */}
                    {diff.changed.length > 0 && (
                      <div className="text-sm">
                        <span className="text-xs font-medium text-muted-foreground">Cambios allocation: </span>
                        <span className="font-mono text-xs">
                          {diff.changed.map((c) => (
                            <Fragment key={c.symbol}>
                              <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 border border-amber-200 dark:border-amber-800">
                                {c.symbol} {c.from}→{c.to}
                              </span>{" "}
                            </Fragment>
                          ))}
                        </span>
                      </div>
                    )}
                    {Object.keys(diff.added).length > 0 && (
                      <div className="text-xs">
                        <span className="font-medium text-muted-foreground">Agregados: </span>
                        <span className="font-mono">
                          {Object.entries(diff.added)
                            .map(([k, v]) => `${k} ${v}%`)
                            .join(", ")}
                        </span>
                      </div>
                    )}
                    {diff.removed.length > 0 && (
                      <div className="text-xs text-red-600 dark:text-red-400">
                        <span className="font-medium">Removidos: </span>
                        <span className="font-mono">{diff.removed.join(", ")}</span>
                      </div>
                    )}
                    {diff.changed.length === 0 && Object.keys(diff.added).length === 0 && diff.removed.length === 0 && prev && (
                      <p className="text-xs text-muted-foreground">Sin cambios de allocation vs v{prev.version}</p>
                    )}
                    {!prev && <p className="text-xs text-muted-foreground">Versión inicial — sin diff previo.</p>}
                    {(plan.rationale || (prev && prev.rationale !== plan.rationale)) && (
                      <div className="text-xs pt-2 border-t">
                        <span className="font-medium text-muted-foreground">Rationale: </span>
                        <span className="text-muted-foreground whitespace-pre-wrap">{plan.rationale ?? "—"}</span>
                      </div>
                    )}
                    {plan.constraints && Object.keys(plan.constraints).length > 0 && (
                      <div className="text-xs">
                        <span className="font-medium text-muted-foreground">Constraints: </span>
                        <span className="font-mono tabular-nums">{JSON.stringify(plan.constraints)}</span>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

export default PlanTimeline;
