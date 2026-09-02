import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { virtualPortfoliosApi, type CreateInvestmentPlanInput } from "@/features/portafolio/api";
import { invalidateApiCache } from "@/hooks/useApiData";

type Props = {
  portfolioId: string;
  onCreated?: () => void;
};

function parseAllocation(text: string): Record<string, number> | null {
  try {
    const obj = JSON.parse(text) as Record<string, unknown>;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== "number" || !Number.isFinite(v)) return null;
      out[k.trim().toUpperCase()] = v;
    }
    return out;
  } catch {
    return null;
  }
}

export function PlanNewVersionDialog({ portfolioId, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [allocationText, setAllocationText] = useState('{"AL30":40,"GGAL":35,"YPFD":15,"TXAR":10}');
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setObjective("");
    setRationale("");
    setAllocationText('{"AL30":40,"GGAL":35,"YPFD":15,"TXAR":10}');
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0 || trimmedTitle.length > 100) {
      setError("Título requerido (1-100 caracteres)");
      return;
    }
    const allocation = parseAllocation(allocationText);
    if (!allocation || Object.keys(allocation).length === 0) {
      setError("allocation_target debe ser JSON válido {SYMBOL: pct} y sumar 100");
      return;
    }
    const sum = Object.values(allocation).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.01) {
      setError(`INVALID_ALLOCATION_SUM: suma ${sum.toFixed(2)} ≠ 100 ±0.01`);
      return;
    }
    if (objective.trim().length > 1000) {
      setError("Objetivo máximo 1000 caracteres");
      return;
    }
    if (rationale.trim().length > 2000) {
      setError("Rationale máximo 2000 caracteres");
      return;
    }
    setSubmitting(true);
    try {
      const payload: CreateInvestmentPlanInput = {
        title: trimmedTitle,
        allocation_target: allocation,
        ...(objective.trim() ? { objective: objective.trim() } : {}),
        ...(rationale.trim() ? { rationale: rationale.trim() } : {}),
      };
      await virtualPortfoliosApi.createInvestmentPlan(portfolioId, payload);
      invalidateApiCache(`virtual-portfolio:${portfolioId}:plans`);
      invalidateApiCache(`virtual-portfolio:${portfolioId}:plans:latest`);
      // compat prefixes used in page
      invalidateApiCache(`virtual-portfolio:${portfolioId}`);
      setOpen(false);
      reset();
      onCreated?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo crear la versión";
      if (msg.includes("VERSION_CONFLICT")) setError("VERSION_CONFLICT — reintentá");
      else setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Nueva versión
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px] motion-reduce:animate-none">
        <DialogHeader>
          <DialogTitle>Nueva versión del Plan</DialogTitle>
          <DialogDescription>
            Versionado append-only. Creará v(N+1) con tu allocation_target.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
          <div className="space-y-2">
            <Label htmlFor="plan-title">Título *</Label>
            <Input
              id="plan-title"
              placeholder="Ej: Plan Base v2 — rotación CER"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-objective">Objetivo (opcional, hasta 1000)</Label>
            <Input
              id="plan-objective"
              placeholder="40% CER, 35% equity BCBA, ..."
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              maxLength={1000}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-allocation">allocation_target JSON *</Label>
            <textarea
              id="plan-allocation"
              className="flex min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              value={allocationText}
              onChange={(e) => setAllocationText(e.target.value)}
              placeholder='{"AL30":40,"GGAL":35}'
            />
            <p className="text-xs text-muted-foreground">Debe sumar 100 ±0.01. Keys: A-Z0-9_ 1-20 chars.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-rationale">Rationale (opcional, hasta 2000)</Label>
            <textarea
              id="plan-rationale"
              className="flex min-h-[70px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              maxLength={2000}
              placeholder="Por qué este rebalanceo..."
            />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              Crear versión
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default PlanNewVersionDialog;
