import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { movementsApi, type MovementType } from "@/lib/api";

const TYPE_LABELS: Record<MovementType, string> = {
  deposit: "Depósito",
  withdrawal: "Extracción",
  dividend: "Dividendo / Crédito",
  caucion: "Caución",
  adjustment: "Ajuste",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function MovementRegisterDialog({ open, onOpenChange, onCreated }: Props) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [type, setType] = useState<MovementType>("deposit");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setDate(new Date().toISOString().slice(0, 10));
    setAmount("");
    setCurrency("ARS");
    setType("deposit");
    setDescription("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum === 0) {
        throw new Error("El monto debe ser un número distinto de 0");
      }
      await movementsApi.create({
        date,
        amount: amountNum,
        currency,
        type,
        description: description.trim() || undefined,
      });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el movimiento");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
          <DialogDescription>
            Anotá un ingreso o egreso de efectivo manualmente. Queda confirmado al instante.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mv-date">Fecha</Label>
              <Input
                id="mv-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mv-amount">Monto</Label>
              <Input
                id="mv-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mv-type">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as MovementType)}>
                <SelectTrigger id="mv-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as MovementType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mv-currency">Moneda</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as "ARS" | "USD")}>
                <SelectTrigger id="mv-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ARS">Pesos (ARS)</SelectItem>
                  <SelectItem value="USD">Dólares (USD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mv-desc">Descripción (opcional)</Label>
            <Input
              id="mv-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: transferencia desde cuenta sueldo"
              maxLength={500}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
