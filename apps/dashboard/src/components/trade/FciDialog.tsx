import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fciSchema, parseDecimal } from "@/components/trade/tradeSchema";
import { ordersApi, type OrderResult } from "@/lib/api";

export type FciMode = "subscribe" | "rescue";

type FciStep = "form" | "confirm" | "done";

export interface FciFormProps {
  mode: FciMode;
  symbol: string;
  onSymbolChange?: (symbol: string) => void;
  onSuccess?: (result: OrderResult) => void;
}

/**
 * Formulario FCI: suscripción (monto) o rescate (cuotapartes).
 * Validación con Zod por campo; confirmación explícita antes de enviar.
 */
export function FciForm({ mode, symbol, onSymbolChange, onSuccess }: FciFormProps) {
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [step, setStep] = useState<FciStep>("form");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);

  const isSubscribe = mode === "subscribe";

  function clearErrors() {
    setError(null);
    setFieldErrors({});
  }

  function handleNext() {
    const parsed = fciSchema.safeParse({
      symbol,
      mode,
      amount: isSubscribe ? parseDecimal(amount) : undefined,
      quantity: isSubscribe ? undefined : parseDecimal(quantity),
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      setError(null);
      return;
    }
    setFieldErrors({});
    setError(null);
    setStep("confirm");
  }

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    const sym = symbol.trim().toUpperCase();
    try {
      const res = isSubscribe
        ? await ordersApi.subscribeFci({ symbol: sym, amount: parseDecimal(amount) })
        : await ordersApi.rescueFci({ symbol: sym, quantity: parseDecimal(quantity) });
      setResult(res);
      onSuccess?.(res);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la operación");
      setStep("confirm");
    } finally {
      setSubmitting(false);
    }
  }

  const modeLabel = isSubscribe ? "suscripción" : "rescate";

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === "form" && (
        <div className="space-y-4">
          {onSymbolChange && (
            <div className="space-y-1.5">
              <Label htmlFor="fci-symbol">Símbolo del FCI</Label>
              <Input id="fci-symbol" value={symbol} onChange={(e) => { onSymbolChange(e.target.value.toUpperCase()); clearErrors(); }} placeholder="FCIARB" autoComplete="off" aria-invalid={!!fieldErrors.symbol} />
              {fieldErrors.symbol && <p className="text-xs text-destructive">{fieldErrors.symbol}</p>}
            </div>
          )}

          {isSubscribe ? (
            <div className="space-y-1.5">
              <Label htmlFor="fci-amount">Monto a invertir (ARS)</Label>
              <Input id="fci-amount" type="text" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); clearErrors(); }} placeholder="0" aria-invalid={!!fieldErrors.amount} />
              {fieldErrors.amount && <p className="text-xs text-destructive">{fieldErrors.amount}</p>}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="fci-qty">Cantidad de cuotapartes</Label>
              <Input id="fci-qty" type="text" inputMode="decimal" value={quantity} onChange={(e) => { setQuantity(e.target.value); clearErrors(); }} placeholder="0" aria-invalid={!!fieldErrors.quantity} />
              {fieldErrors.quantity && <p className="text-xs text-destructive">{fieldErrors.quantity}</p>}
            </div>
          )}

          <Button type="button" onClick={handleNext} className="w-full cursor-pointer">
            Continuar
          </Button>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
            <p className="flex justify-between"><span className="text-muted-foreground">Operación</span><span className="font-medium capitalize">{modeLabel}</span></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Fondo</span><span className="font-medium">{symbol.toUpperCase()}</span></p>
            <p className="flex justify-between"><span className="text-muted-foreground">{isSubscribe ? "Monto" : "Cuotapartes"}</span><span className="font-medium tabular-nums">{isSubscribe ? `ARS ${parseDecimal(amount).toLocaleString("es-AR")}` : parseDecimal(quantity).toLocaleString("es-AR")}</span></p>
          </div>
          <p className="text-xs text-muted-foreground">Se enviará a tu cuenta IOL. La operación no constituye asesoramiento financiero.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("form")} className="cursor-pointer">Volver</Button>
            <Button type="button" onClick={handleConfirm} disabled={submitting} className="cursor-pointer">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Enviando…" : `Confirmar ${modeLabel}`}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <p className="text-base font-semibold">Operación enviada</p>
            <p className="text-sm text-muted-foreground">{result.message ?? "Tu operación fue enviada a IOL."}</p>
            <p className="font-mono text-xs text-muted-foreground">Operación: {result.orderId}</p>
          </div>
          <Button type="button" onClick={() => setStep("form")} className="w-full cursor-pointer">Nueva operación</Button>
        </div>
      )}
    </div>
  );
}

export interface FciDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: FciMode;
  initialSymbol?: string;
  onSuccess?: (result: OrderResult) => void;
}

export function FciDialog({ open, onOpenChange, mode, initialSymbol = "", onSuccess }: FciDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "subscribe" ? "Suscribir a FCI" : "Rescatar FCI"}</DialogTitle>
          <DialogDescription>Fondos comunes de inversión en tu cuenta IOL</DialogDescription>
        </DialogHeader>
        <FciForm mode={mode} symbol={initialSymbol} onSuccess={onSuccess} />
      </DialogContent>
    </Dialog>
  );
}
