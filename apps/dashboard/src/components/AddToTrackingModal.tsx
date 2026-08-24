import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, BookmarkPlus, Loader2, Plus, Layers } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { virtualPortfoliosApi, type VirtualPortfolio, type VirtualPortfolioDetail } from "@/features/portafolio/api";
import { useApiData, invalidateApiCache } from "@/hooks/useApiData";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  symbol: string;
  market?: string;
  lastPrice?: number | null;
  currency?: string | null;
  onSuccess?: (portfolioId: string) => void;
};

const formatterARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

function formatPrice(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "—";
  return formatterARS.format(v);
}

export function AddToTrackingModal({ open, onOpenChange, symbol, market: rawMarket, lastPrice, currency: rawCurrency, onSuccess }: Props) {
  const normalizedMarket: "bcba" | "bonds" = rawMarket === "bonds" ? "bonds" : "bcba";
  const normalizedCurrency: "ARS" | "USD" = rawCurrency === "USD" ? "USD" : "ARS";

  // Lista de portfolios — solo cargar cuando modal abierto (enabled)
  const { data, isLoading, error, refetch } = useApiData(
    open ? "virtual-portfolios" : null,
    () => virtualPortfoliosApi.list(),
    { enabled: open }
  );

  const portfolios: VirtualPortfolio[] = data?.portfolios ?? [];

  // Enriquecimiento para count — igual que PortfolioHubPage
  const [detailsMap, setDetailsMap] = useState<Record<string, VirtualPortfolioDetail>>({});
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    if (!open || portfolios.length === 0) {
      setDetailsMap({});
      return;
    }
    let cancelled = false;
    setDetailsLoading(true);
    Promise.allSettled(portfolios.map((p) => virtualPortfoliosApi.get(p.id))).then((results) => {
      if (cancelled) return;
      const next: Record<string, VirtualPortfolioDetail> = {};
      results.forEach((r, idx) => {
        if (r.status === "fulfilled" && r.value?.portfolio) {
          next[portfolios[idx]!.id] = r.value.portfolio;
        }
      });
      setDetailsMap(next);
      setDetailsLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, portfolios.map((p) => p.id).join(",")]);

  // Selección + form
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [currency, setCurrency] = useState<"ARS" | "USD">(normalizedCurrency);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Inline crear portafolio
  const [creatingInline, setCreatingInline] = useState(false);
  const [newName, setNewName] = useState("");
  const [createInlineError, setCreateInlineError] = useState<string | null>(null);
  const [creatingInlineLoading, setCreatingInlineLoading] = useState(false);

  // Reset al abrir/cerrar o cambiar symbol
  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setQuantity("");
      setAvgPrice(lastPrice != null && Number.isFinite(lastPrice) ? String(lastPrice) : "");
      setCurrency(normalizedCurrency);
      setSubmitError(null);
      setSuccessMsg(null);
      setCreatingInline(false);
      setNewName("");
      setCreateInlineError(null);
    }
  }, [open, symbol, lastPrice, normalizedCurrency]);

  // Keep currency in sync si props cambian mientras está abierto
  useEffect(() => {
    if (open) setCurrency(normalizedCurrency);
  }, [normalizedCurrency, open]);

  async function handleCreateInline(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return setCreateInlineError("El nombre es obligatorio");
    if (trimmed.length < 2) return setCreateInlineError("Mínimo 2 caracteres");
    setCreatingInlineLoading(true);
    setCreateInlineError(null);
    try {
      const res = await virtualPortfoliosApi.create({ name: trimmed, description: null });
      invalidateApiCache("virtual-portfolios");
      await refetch({ forceLoading: true });
      // Seleccionar automáticamente el recién creado
      setSelectedId(res.portfolio.id);
      setCreatingInline(false);
      setNewName("");
    } catch (err) {
      setCreateInlineError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setCreatingInlineLoading(false);
    }
  }

  async function handleConfirm() {
    if (!selectedId) return setSubmitError("Elegí un portafolio");
    const qty = Number(quantity);
    const price = Number(avgPrice);
    if (!Number.isFinite(qty) || qty <= 0) return setSubmitError("Cantidad debe ser mayor a 0");
    if (!Number.isFinite(price) || price <= 0) return setSubmitError("Precio debe ser mayor a 0");
    setSubmitting(true);
    setSubmitError(null);
    try {
      await virtualPortfoliosApi.addPosition(selectedId, {
        symbol: symbol.trim().toUpperCase(),
        quantity: qty,
        avg_price: price,
        currency,
        market: normalizedMarket,
      });
      invalidateApiCache(`virtual-portfolio:${selectedId}`);
      invalidateApiCache("virtual-portfolios");
      setSuccessMsg("Agregado correctamente");
      setTimeout(() => {
        onOpenChange(false);
        onSuccess?.(selectedId);
      }, 650);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "No se pudo agregar la posición");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedPortfolio = selectedId ? portfolios.find((p) => p.id === selectedId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-lg gap-0 p-0 overflow-hidden max-h-[85vh] flex flex-col max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:right-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:h-[92vh] max-sm:max-h-[92vh] max-sm:shadow-xl max-sm:border-t motion-reduce:animate-none max-sm:data-[state=open]:slide-in-from-bottom-full max-sm:data-[state=closed]:slide-out-to-bottom-full max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-left">
            <BookmarkPlus className="h-5 w-5 text-primary shrink-0" />
            Agregar {symbol.toUpperCase()} a seguimiento
          </DialogTitle>
          <DialogDescription className="text-left">
            Elegí el portafolio virtual y cargá cantidad y precio. Se valoriza con cotización real sin tocar tu cartera.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 min-h-0">
          {/* Estado loading */}
          {isLoading ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-14 w-full motion-reduce:animate-none" />
              <Skeleton className="h-14 w-full motion-reduce:animate-none" />
              <Skeleton className="h-14 w-full motion-reduce:animate-none" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">No se pudieron cargar los portafolios</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch({ forceLoading: true })}>
                Reintentar
              </Button>
            </div>
          ) : portfolios.length === 0 && !creatingInline ? (
            /* Empty state — 0 portfolios */
            <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-center animate-in fade-in-0 duration-150 motion-reduce:animate-none">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Bookmark className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium">Todavía no tenés portafolios de seguimiento</p>
              <p className="mt-1 text-xs text-muted-foreground">Creá uno para empezar a guardar tus ideas sin operar de verdad.</p>
              <div className="mt-4 flex flex-col gap-2">
                <Button onClick={() => setCreatingInline(true)} className="w-full">
                  <Plus className="h-4 w-4" /> Crear portafolio
                </Button>
                <Link to="/portfolio/seguimiento" onClick={() => onOpenChange(false)} className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline text-center">
                  Ir a Portafolios de seguimiento
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Inline crear form cuando 0 portfolios o usuario pide crear */}
              {creatingInline ? (
                <form onSubmit={handleCreateInline} className="rounded-xl border bg-card p-4 space-y-3 animate-in fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none">
                  <p className="text-sm font-medium">Nuevo portafolio</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="add-tracking-new-name">Nombre *</Label>
                    <Input
                      id="add-tracking-new-name"
                      placeholder="Ej: Tech largo plazo"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      maxLength={50}
                      autoFocus
                    />
                  </div>
                  {createInlineError && (
                    <p className="text-sm text-destructive" role="alert">{createInlineError}</p>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => { setCreatingInline(false); setNewName(""); setCreateInlineError(null); }} disabled={creatingInlineLoading}>
                      Cancelar
                    </Button>
                    <Button type="submit" size="sm" disabled={creatingInlineLoading || !newName.trim()}>
                      {creatingInlineLoading && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
                      Crear y seleccionar
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Elegí un portafolio</p>
                  <Button variant="ghost" size="xs" onClick={() => setCreatingInline(true)} className="gap-1">
                    <Plus className="h-3 w-3" /> Nuevo
                  </Button>
                </div>
              )}

              {/* RadioGroup de portfolios */}
              {!creatingInline && portfolios.length > 0 && (
                <div
                  role="radiogroup"
                  aria-label="Portafolios disponibles"
                  className="space-y-2"
                >
                  {portfolios.map((pf) => {
                    const detail = detailsMap[pf.id];
                    const count = detail ? detail.positions.length : null;
                    const isSelected = selectedId === pf.id;
                    return (
                      <button
                        key={pf.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => {
                          setSelectedId(pf.id);
                          setSubmitError(null);
                          setSuccessMsg(null);
                        }}
                        className={`w-full text-left rounded-xl border p-3.5 flex items-start gap-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none ${
                          isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card hover:bg-muted/40 hover:border-muted-foreground/20"
                        }`}
                      >
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? "border-primary bg-primary" : "border-muted-foreground/30 bg-background"}`} aria-hidden="true">
                          {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <Bookmark className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                            <span className="text-sm font-medium truncate">{pf.name}</span>
                          </span>
                          {pf.description && <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground block truncate">{pf.description}</span>}
                          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                            <Layers className="h-3 w-3" />
                            {count !== null ? `${count} posiciones` : detailsLoading ? "cargando…" : "— posiciones"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Link a hub si hay portfolios */}
              {!creatingInline && portfolios.length > 0 && (
                <Link to="/portfolio/seguimiento" onClick={() => onOpenChange(false)} className="block text-center text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
                  Gestionar portafolios en /portfolio/seguimiento
                </Link>
              )}

              {/* Form cantidad + precio — solo si hay selección */}
              {selectedId && selectedPortfolio && (
                <div className="space-y-4 rounded-xl border bg-muted/20 p-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Detalle de la posición</p>
                    <span className="text-xs rounded-full border bg-background px-2 py-0.5 font-mono">{symbol.toUpperCase()} · {normalizedMarket === "bonds" ? "Bonos" : "BCBA"}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="add-tracking-qty">Cantidad *</Label>
                      <Input
                        id="add-tracking-qty"
                        type="number"
                        inputMode="decimal"
                        placeholder="100"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        min="0"
                        step="any"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="add-tracking-price">Precio promedio *</Label>
                      <Input
                        id="add-tracking-price"
                        type="number"
                        inputMode="decimal"
                        placeholder={lastPrice != null ? String(lastPrice) : "0.00"}
                        value={avgPrice}
                        onChange={(e) => setAvgPrice(e.target.value)}
                        min="0"
                        step="any"
                      />
                      <p className="text-xs text-muted-foreground">
                        Sugerido último: <span className="font-medium tabular-nums">{formatPrice(lastPrice ?? null)}</span> — podés editarlo.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="add-tracking-curr">Moneda</Label>
                      <select
                        id="add-tracking-curr"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as "ARS" | "USD")}
                        className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="add-tracking-market">Mercado</Label>
                      <select
                        id="add-tracking-market"
                        value={normalizedMarket}
                        disabled
                        className="flex h-8 w-full rounded-lg border border-input bg-muted px-2.5 text-sm text-muted-foreground"
                      >
                        <option value="bcba">BCBA</option>
                        <option value="bonds">Bonos</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {submitError && (
                <p className="text-sm text-destructive animate-in fade-in-0 duration-150 motion-reduce:animate-none" role="alert">{submitError}</p>
              )}
              {successMsg && (
                <p className="text-sm text-emerald-600 font-medium animate-in fade-in-0 duration-150 motion-reduce:animate-none" role="status">{successMsg} — {selectedPortfolio?.name}</p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 px-6 py-4 flex-row justify-between gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedId || submitting || isLoading || portfolios.length === 0}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
            Confirmar y agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
