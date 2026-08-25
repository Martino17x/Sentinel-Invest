import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Loader2, Briefcase, BarChart3, CalendarRange } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarView } from "@/components/reports/CalendarView";
import { MetricsSection } from "@/components/metrics/MetricsSection";
import { VirtualPortfolioReportsPanel } from "@/components/reports/VirtualPortfolioReportsPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AssetTypeBadge } from "@/components/ui/asset-type-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { virtualPortfoliosApi, type VirtualPosition } from "@/features/portafolio/api";
import { invalidateApiCache } from "@/hooks/useApiData";
import { useVirtualPortfolioDetails } from "@/hooks/useVirtualPortfolioDetails";
import { InstrumentPicker, type PickedInstrument } from "@/components/InstrumentPicker";
import CompanyLogo from "@/components/ui/company-logo";
import { formatARS } from "@/lib/formatters";
import { PortfolioStats } from "@/components/portfolio/PortfolioStats";
import { PortfolioPositionsTable } from "@/components/portfolio/PortfolioPositionsTable";
import { PortfolioMobileCard } from "@/components/portfolio/PortfolioMobileCard";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

export function VirtualPortfolioPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { portfolio, positions, totals, isLoading, error, refetch } = useVirtualPortfolioDetails(id ?? null);

  // Reportes dialog/drawer (misma interfaz que ReportsPage para virtual)
  const [reportsOpen, setReportsOpen] = useState(false);

  // Add position dialog — XL picker + inline form
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PickedInstrument | null>(null);
  const [quantity, setQuantity] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [market, setMarket] = useState<"bcba" | "bonds">("bcba");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setSelected(null);
      setQuantity("");
      setAvgPrice("");
      setCreateError(null);
    }
  }

  function handlePick(inst: PickedInstrument) {
    setSelected(inst);
    setMarket(inst.market);
    setCurrency(inst.currency);
    // hint lastPrice as starting point — user can editar
    if (inst.lastPrice != null) setAvgPrice(String(inst.lastPrice));
    else setAvgPrice("");
    setCreateError(null);
  }

  // Delete position confirm
  const [pendingDelete, setPendingDelete] = useState<VirtualPosition | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    if (!selected) return setCreateError("Elegí un instrumento de la lista");
    const sym = selected.symbol.trim().toUpperCase();
    const qty = Number(quantity);
    const price = Number(avgPrice);
    if (!Number.isFinite(qty) || qty <= 0) return setCreateError("Cantidad debe ser > 0");
    if (!Number.isFinite(price) || price <= 0) return setCreateError("Precio promedio debe ser > 0");
    setCreating(true);
    setCreateError(null);
    try {
      await virtualPortfoliosApi.addPosition(id, {
        symbol: sym,
        quantity: qty,
        avg_price: price,
        currency,
        market,
      });
      invalidateApiCache(`virtual-portfolio:${id}`);
      setSelected(null);
      setQuantity("");
      setAvgPrice("");
      setOpen(false);
      await refetch({ forceLoading: true });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "No se pudo agregar");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeletePos() {
    if (!id || !pendingDelete) return;
    setDeleting(true);
    try {
      await virtualPortfoliosApi.removePosition(id, pendingDelete.id);
      invalidateApiCache(`virtual-portfolio:${id}`);
      setPendingDelete(null);
      await refetch({ forceLoading: true });
    } catch (err) {
      // keep dialog open to show error? simple alert via state
      setCreateError(err instanceof Error ? err.message : "No se pudo borrar");
    } finally {
      setDeleting(false);
    }
  }

  if (!id) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertDescription>Falta el ID del portafolio</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error && !portfolio) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4">
        <Button variant="outline" onClick={() => navigate("/portfolio/seguimiento")}>
          <ArrowLeft className="h-4 w-4" /> Volver al hub
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4">
        <Button variant="outline" onClick={() => navigate("/portfolio/seguimiento")}>
          <ArrowLeft className="h-4 w-4" /> Volver al hub
        </Button>
        <Alert variant="destructive">
          <AlertDescription>Portafolio no encontrado</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/portfolio/seguimiento"
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Volver a Portafolios
          </Link>
          <h1 className="flex items-center gap-2 truncate text-2xl font-semibold tracking-tight">
            <Briefcase className="h-6 w-6 shrink-0 text-muted-foreground" />
            <span className="truncate">{portfolio.name}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {portfolio.description ? portfolio.description : "Sin descripción"} — creado {formatDate(portfolio.createdAt)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Reportes — misma interfaz que ReportsPage pero filtrada por este portfolio virtual */}
          <Button variant="outline" className="gap-1.5" onClick={() => setReportsOpen(true)}>
            <BarChart3 className="h-4 w-4" /> Reportes
          </Button>
          <Dialog open={reportsOpen} onOpenChange={setReportsOpen}>
            <DialogContent className="max-w-5xl w-[calc(100%-2rem)] max-h-[85vh] flex flex-col overflow-hidden p-0 gap-0 sm:max-w-5xl max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:right-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:h-[92vh] max-sm:max-h-[92vh] max-sm:shadow-xl max-sm:border-t motion-reduce:animate-none max-sm:data-[state=open]:slide-in-from-bottom-full max-sm:data-[state=closed]:slide-out-to-bottom-full max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100">
              <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b text-left">
                <DialogTitle className="flex items-center gap-2 text-left">
                  <CalendarRange className="h-5 w-5 text-muted-foreground" />
                  Reportes — {portfolio.name}
                </DialogTitle>
                <DialogDescription className="text-left">
                  Misma interfaz que Reportes normales, pero para este portafolio ficticio. Tabs Reporte / Calendario / Métricas.
                  También disponible en <Link to={`/portfolio/seguimiento/${portfolio.id}/reportes`} className="underline hover:text-foreground" onClick={() => setReportsOpen(false)}>vista completa</Link>.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 min-h-0">
                <Tabs defaultValue="reporte" className="space-y-4">
                  <TabsList className="w-full sm:w-auto">
                    <TabsTrigger value="reporte">Reporte</TabsTrigger>
                    <TabsTrigger value="calendario">Calendario</TabsTrigger>
                    <TabsTrigger value="metricas">Métricas</TabsTrigger>
                  </TabsList>
                  <TabsContent value="reporte" className="space-y-4 animate-in fade-in-50 duration-200 motion-reduce:animate-none">
                    <VirtualPortfolioReportsPanel portfolioId={portfolio.id} portfolioName={portfolio.name} />
                  </TabsContent>
                  <TabsContent value="calendario" className="space-y-4 animate-in fade-in-50 duration-200 motion-reduce:animate-none">
                    <CalendarView virtualPortfolioId={portfolio.id} />
                  </TabsContent>
                  <TabsContent value="metricas" className="space-y-4 animate-in fade-in-50 duration-200 motion-reduce:animate-none">
                    <MetricsSection virtualPortfolioId={portfolio.id} />
                  </TabsContent>
                </Tabs>
              </div>
              <div className="shrink-0 border-t bg-muted/20 px-4 py-3 sm:px-6 flex justify-between">
                <Button variant="ghost" onClick={() => navigate(`/portfolio/seguimiento/${portfolio.id}/reportes`)}>Abrir página completa</Button>
                <Button variant="outline" onClick={() => setReportsOpen(false)}>Cerrar</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button className="shrink-0">
                <Plus className="h-4 w-4" /> Agregar posición
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-6xl w-[calc(100%-2rem)] max-h-[80vh] h-[80vh] flex flex-col overflow-hidden p-0 gap-0 sm:max-w-6xl max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:right-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:h-[92vh] max-sm:max-h-[92vh] max-sm:shadow-xl max-sm:border-t motion-reduce:animate-none max-sm:data-[state=open]:slide-in-from-bottom-full max-sm:data-[state=closed]:slide-out-to-bottom-full max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100">
            <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
              <DialogTitle className="text-left">
                {selected ? `Agregar ${selected.symbol}` : "Agregar posición"}
              </DialogTitle>
              <DialogDescription className="text-left">
                {selected
                  ? `${selected.name} · Último ${selected.lastPrice != null ? formatARS(selected.lastPrice) : "—"} · Elegí cantidad y precio promedio`
                  : "Buscá como en Cotizaciones, elegí un instrumento y completá cantidad + precio promedio. Todo sin salir del modal."}
              </DialogDescription>
            </DialogHeader>

            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 min-h-0">
              {!selected ? (
                <InstrumentPicker onPick={handlePick} initialMarket={market} />
              ) : (
                <form onSubmit={handleAdd} className="space-y-5 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
                  {/* Resumen instrumento elegido */}
                  <div className="rounded-xl border bg-muted/40 p-4 flex items-start gap-3">
                    <CompanyLogo symbol={selected.symbol} market={selected.market} size={40} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold">{selected.symbol}</span>
                        <AssetTypeBadge type={selected.assetType} className="font-mono text-[10px]" />
                        <span className="text-xs text-muted-foreground">{selected.currency} · {selected.market === "bonds" ? "Bonos" : "BCBA"}</span>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{selected.name}</p>
                      <p className="text-sm tabular-nums mt-0.5">
                        Último: <span className="font-semibold">{selected.lastPrice != null ? formatARS(selected.lastPrice) : "—"}</span>
                        {selected.variationPct != null && (
                          <span className={`ml-2 text-xs font-medium ${selected.variationPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {selected.variationPct >= 0 ? "▲" : "▼"} {Math.abs(selected.variationPct).toFixed(2)}%
                          </span>
                        )}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setSelected(null); setCreateError(null); }} className="shrink-0">
                      Cambiar
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="vp-qty">Cantidad *</Label>
                      <Input
                        id="vp-qty"
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
                    <div className="space-y-2">
                      <Label htmlFor="vp-price">Precio promedio *</Label>
                      <Input
                        id="vp-price"
                        type="number"
                        inputMode="decimal"
                        placeholder={selected.lastPrice != null ? `${selected.lastPrice} (último ${formatARS(selected.lastPrice)})` : "1500.50"}
                        value={avgPrice}
                        onChange={(e) => setAvgPrice(e.target.value)}
                        min="0"
                        step="any"
                      />
                      <p className="text-xs text-muted-foreground">
                        Sugerido último: {selected.lastPrice != null ? formatARS(selected.lastPrice) : "—"} — podés editarlo.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="vp-curr">Moneda</Label>
                      <select
                        id="vp-curr"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value as "ARS" | "USD")}
                        className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vp-market">Mercado</Label>
                      <select
                        id="vp-market"
                        value={market}
                        onChange={(e) => setMarket(e.target.value as "bcba" | "bonds")}
                        className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <option value="bcba">BCBA</option>
                        <option value="bonds">Bonos</option>
                      </select>
                    </div>
                  </div>

                  {createError && (
                    <p className="text-sm text-destructive" role="alert">
                      {createError}
                    </p>
                  )}

                  <DialogFooter className="px-0 -mx-0 bg-transparent border-0 p-0 sm:justify-between flex-row justify-between gap-2">
                    <Button type="button" variant="outline" onClick={() => { setSelected(null); setCreateError(null); }} disabled={creating}>
                      <ArrowLeft className="h-4 w-4" /> Volver al listado
                    </Button>
                    <Button type="submit" disabled={creating}>
                      {creating && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
                      Confirmar y agregar
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </div>

            {!selected && (
              <div className="shrink-0 border-t bg-muted/20 px-4 py-3 sm:px-6 flex justify-end">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cerrar
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {totals && <PortfolioStats mode="virtual" totals={totals} />}

      {/* Tabla posiciones */}
      <Card className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
        <CardHeader>
          <CardTitle>Posiciones</CardTitle>
          <CardDescription>
            {positions.length === 0
              ? "Todavía no agregaste posiciones"
              : `${positions.length} ${positions.length === 1 ? "posición" : "posiciones"} — valor actual con cotización del momento`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {positions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">Usá &quot;Agregar posición&quot; para simular tu primera tenencia.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 lg:hidden">
                {positions.map((pos) => (
                  <PortfolioMobileCard key={pos.id} mode="virtual" position={pos} onRemove={setPendingDelete} />
                ))}
              </div>
              <div className="hidden lg:block">
                <PortfolioPositionsTable mode="virtual" positions={positions} onRemove={setPendingDelete} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialog confirmar borrado */}
      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>¿Eliminar {pendingDelete?.symbol}?</DialogTitle>
            <DialogDescription>Esta acción no se puede deshacer. Se quitará la posición del portafolio virtual.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeletePos} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default VirtualPortfolioPage;
