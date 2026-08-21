import { useState } from "react";
import { CheckCircle2, Loader2, ShieldQuestion, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { agentApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface PendingApproval {
  id: string;
  summary: string;
}

export interface PendingOutcome {
  ok: boolean;
  message: string;
}

interface PendingOrderCardProps {
  approval: PendingApproval;
  tone?: "default" | "modal";
  onDone: (outcome: PendingOutcome) => void;
}

/**
 * Tarjeta de confirmación de una orden preparada por el agente.
 * El usuario aprueba o rechaza ANTES de que se ejecute en IOL.
 */
export function PendingOrderCard({ approval, tone = "default", onDone }: PendingOrderCardProps) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "approve" | "reject") {
    setBusy(action);
    setError(null);
    try {
      const res =
        action === "approve"
          ? await agentApi.approveOrder(approval.id)
          : await agentApi.rejectOrder(approval.id);
      onDone({ ok: res.ok, message: res.message });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la orden");
    } finally {
      setBusy(null);
    }
  }

  const isModal = tone === "modal";

  return (
    <div
      className={cn(
        "w-full rounded-xl border p-3",
        isModal
          ? "border-white/40 bg-white/60 backdrop-blur-sm shadow-sm dark:border-white/15 dark:bg-white/[0.08]"
          : "border-border bg-muted/40"
      )}
    >
      <div className="flex items-start gap-2">
        <ShieldQuestion
          className={cn("mt-0.5 size-4 shrink-0", isModal ? "text-amber-600 dark:text-amber-300" : "text-amber-600")}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className={cn("text-xs font-medium", isModal ? "text-foreground dark:text-white" : "text-foreground")}>
            Orden preparada — requiere tu confirmación
          </p>
          <p className={cn("text-sm font-semibold", isModal ? "text-foreground dark:text-white" : "text-foreground")}>
            {approval.summary}
          </p>
          {error && (
            <p className={cn("text-xs", isModal ? "text-destructive dark:text-red-300" : "text-destructive")}>{error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={busy !== null}
              onClick={() => void decide("reject")}
              className={cn(
                "cursor-pointer",
                isModal &&
                  "border-white/30 bg-white/40 text-foreground hover:bg-white/60 dark:border-white/20 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              )}
            >
              {busy === "reject" ? <Loader2 className="size-3 animate-spin" /> : <XCircle className="size-3" />}
              Rechazar
            </Button>
            <Button
              type="button"
              variant="default"
              size="xs"
              disabled={busy !== null}
              onClick={() => void decide("approve")}
              className="cursor-pointer"
            >
              {busy === "approve" ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
              Aprobar y ejecutar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
