import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Clock, RefreshCw, TrendingUp, Wallet, Calendar, BarChart3 } from "lucide-react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DisclaimerBanner } from "@/components/ui/disclaimer-banner";
import { bondsApi } from "@/lib/api";
import type { BondSchedule } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useSmartBack } from "@/lib/use-smart-back";

type FichaTab = "overview" | "cashflow" | "tecnica" | "curva";

function fmt(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}
function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}
function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(v);
}

function buildCashflowBuckets(schedule: BondSchedule, monthsAhead = 12) {
  if (!schedule?.cashflows?.length) return [];
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() + monthsAhead);
  const buckets = new Map<string, { month: string; label: string; items: { symbol: string; renta: number; amort: number; currency: string }[]; totalArs: number; totalUsd: number }>();
  for (const cf of schedule.cashflows) {
    const d = new Date(cf.fechaPago + "T00:00:00.000Z");
    if (isNaN(d.getTime())) continue;
    if (d < now) continue;
    if (d > cutoff) continue;
    const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const moneda = schedule.moneda;
    // schedule cashflow is per 100 VN; display per 100 for ficha without quantity (educational)
    const entry = buckets.get(mk) ?? { month: mk, label: d.toLocaleDateString("es-AR", { month: "long", year: "numeric" }), items: [], totalArs: 0, totalUsd: 0 };
    entry.items.push({ symbol: schedule.symbol, renta: cf.renta, amort: cf.amortizacion, currency: moneda });
    const sum = cf.renta + cf.amortizacion;
    if (moneda === "USD") entry.totalUsd += sum;
    else entry.totalArs += sum;
    if (!buckets.has(mk)) buckets.set(mk, entry);
  }
  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function BondFichaPage() {
  const { symbol: rawSymbol } = useParams<{ symbol: string }>();
  const symbol = (rawSymbol ?? "").toUpperCase().trim();
  const { goBack } = useSmartBack("/renta-fija");
  const [tab, setTab] = useState<FichaTab>("overview");

  const cacheKey = symbol ? `bonds:ficha:${symbol}` : null;
  const { data: ficha, isLoading, error, refetch, isRefreshing } = useApiData(
    cacheKey,
    () => bondsApi.getFicha(symbol),
    { enabled: Boolean(symbol) }
  );

  const cuadro = ficha?.cuadroTecnico ?? ficha?.cuadro ?? null;
  const market = ficha?.marketData ?? ficha?.market ?? null;
  const schedule: BondSchedule | null = ficha?.schedule ?? null;
  const cerStale = (ficha as unknown as { stale?: { cer?: boolean } })?.stale?.cer === true || (ficha as unknown as { isStale?: boolean })?.isStale === true;
  const isParidadCalculable = cuadro?.isParidadCalculable ?? cuadro?.paridadCalculable ?? false;
  const tir = ficha?.tir ?? null;
  const md = ficha?.md ?? null;
  const duration = ficha?.duration ?? null;
  const spread = market?.spread ?? (market?.bid != null && market?.ask != null ? market.ask - market.bid : null);

  // Curve embed data — segment inference fallback
  const inferredSegment = useMemo(() => {
    if (!ficha) return "USD-hard-dollar";
    if (schedule?.cerAjustado) return "CER";
    if (schedule?.moneda === "USD") {
      // heuristic: BOPREAL vs hard-dollar by symbol prefix
      if (symbol.startsWith("BP")) return "BOPREAL";
      return "USD-hard-dollar";
    }
    if (schedule?.tipo === "cer" || schedule?.moneda === "ARS" && symbol.startsWith("TX")) return "CER";
    return "LECAP/BONCAP";
  }, [ficha, schedule, symbol]);

  const curveKey = `bonds:curve:${inferredSegment}`;
  const { data: curveData } = useApiData(tab === "curva" ? curveKey : null, () => bondsApi.getCurve(inferredSegment), { enabled: tab === "curva" });
  const curvePoints = curveData?.points ?? [];

  const cashflowBuckets = useMemo(() => {
    if (!schedule) return [];
    return buildCashflowBuckets(schedule, 12);
  }, [schedule]);

  // Overview sparkline placeholder — use curve points around symbol's md/tir if available
  const sparklineData = useMemo(() => {
    if (!tir || !md) return null;
    // simple single point sparkline: show tir vs md with neighbours if curve available
    if (curvePoints.length > 0) {
      const sorted = [...curvePoints].sort((a, b) => a.md - b.md);
      return sorted.slice(0, 12).map((p) => ({ name: p.ticker, tir: p.tir, md: p.md, isSelf: p.ticker.toUpperCase() === symbol }));
    }
    return [{ name: symbol, tir, md, isSelf: true }];
  }, [tir, md, curvePoints, symbol]);

  if (!symbol || !/^[A-Z0-9]{2,12}$/.test(symbol)) {
    return (
      <div className="space-y-0">
        <DisclaimerBanner />
        <div className="p-4 sm:p-6 lg:p-8">
          <Alert variant="destructive"><AlertDescription>Símbolo inválido.</AlertDescription></Alert>
          <Link to="/renta-fija"><Button variant="outline" className="mt-4">Volver a tabla</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-0">
        <DisclaimerBanner />
        <div className="space-y-6 p-4 sm:p-6 lg:p-8 animate-in fade-in-0 slide-in-from-bottom-1 duration-150 ease-out motion-reduce:animate-none motion-reduce:transition-none">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
            <button type="button" onClick={goBack} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm" aria-label="Volver a Renta Fija">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Renta Fija
            </button>
            <span className="text-muted-foreground" aria-hidden="true">/</span>
            <Link to="/renta-fija" className="text-muted-foreground hover:text-foreground">Tabla</Link>
            <span className="text-muted-foreground" aria-hidden="true">/</span>
            <span className="font-mono font-medium text-foreground" aria-current="page">{symbol}</span>
          </nav>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight font-mono">{symbol}</h1>
              <p className="text-sm text-muted-foreground">
                {schedule ? `${schedule.moneda} · ${schedule.tipo} · Vto ${schedule.vencimiento ? new Date(schedule.vencimiento).toLocaleDateString("es-AR") : "—"}` : "Ficha soberana"}
                {cuadro?.ley && ` · ${cuadro.ley}`}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetch()} title="Actualizar" aria-label="Actualizar ficha">
              <RefreshCw className={`h-4 w-4 ${isRefreshing || isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            </Button>
          </div>

          {cerStale && (
            <Alert className="border-amber-600 bg-amber-500 text-white dark:border-amber-600 dark:bg-amber-500 dark:text-white animate-in fade-in-0 duration-150 motion-reduce:animate-none">
              <AlertDescription className="flex items-center gap-2 text-white">
                <Clock className="h-4 w-4 shrink-0 text-white" />
                CER desactualizado — paridad y flujos CER pueden estar desfasados.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="flex items-center justify-between gap-2 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
              <AlertDescription>{error}</AlertDescription>
              <Button variant="outline" size="sm" className="shrink-0 cursor-pointer" onClick={() => refetch({ forceLoading: true })}>Reintentar</Button>
            </Alert>
          )}

          {isLoading && !ficha ? (
            <div className="space-y-3" aria-busy="true" aria-label="Cargando ficha">
              <Skeleton className="h-24 w-full motion-reduce:animate-none" />
              <Skeleton className="h-64 w-full motion-reduce:animate-none" />
            </div>
          ) : ficha ? (
            <Tabs value={tab} onValueChange={(v) => setTab(v as FichaTab)} className="w-full">
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="overview" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Overview</TabsTrigger>
                <TabsTrigger value="cashflow" className="gap-1.5"><Wallet className="h-4 w-4" /> Cashflow</TabsTrigger>
                <TabsTrigger value="tecnica" className="gap-1.5"><TrendingUp className="h-4 w-4" /> Técnica</TabsTrigger>
                <TabsTrigger value="curva" className="gap-1.5"><Calendar className="h-4 w-4" /> Curva</TabsTrigger>
              </TabsList>

              {/* Overview */}
              <TabsContent value="overview" className="mt-4 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150 motion-reduce:data-[state=active]:animate-none">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card><CardHeader className="pb-2"><CardDescription>Precio dirty</CardDescription><CardTitle className="text-xl tabular-nums">{fmtPrice(ficha.precioDirty ?? ficha.precio)}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Precio último BYMA</CardContent></Card>
                  <Card><CardHeader className="pb-2"><CardDescription>TIR</CardDescription><CardTitle className="text-xl tabular-nums">{fmtPct(tir)}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">decimal {fmt(tir, 4)}</CardContent></Card>
                  <Card><CardHeader className="pb-2"><CardDescription>MD / Duration</CardDescription><CardTitle className="text-xl tabular-nums">{fmt(md)} / {fmt(duration)}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">años</CardContent></Card>
                  <Card><CardHeader className="pb-2"><CardDescription>Paridad</CardDescription>
                    <CardTitle className="text-xl tabular-nums">
                      {isParidadCalculable && cuadro?.paridad != null ? `${fmt(cuadro.paridad, 2)}%` : (
                        <Tooltip>
                          <TooltipTrigger asChild><span className="cursor-help border-b border-dotted text-base">—</span></TooltipTrigger>
                          <TooltipContent>cupón no informado</TooltipContent>
                        </Tooltip>
                      )}
                    </CardTitle>
                  </CardHeader><CardContent className="text-xs text-muted-foreground">VT {cuadro?.vt != null ? fmt(cuadro.vt, 2) : "—"} · VR {cuadro?.vr != null ? fmt(cuadro.vr, 2) : "—"}</CardContent></Card>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <Card className="lg:col-span-2">
                    <CardHeader><CardTitle className="text-base">Market top</CardTitle><CardDescription>Bid/Ask · Spread · Volumen</CardDescription></CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-2 gap-3 text-sm">
                        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Bid</dt><dd className="font-medium tabular-nums">{market?.bid != null ? fmtPrice(market.bid) : "—"}</dd></div>
                        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Ask</dt><dd className="font-medium tabular-nums">{market?.ask != null ? fmtPrice(market.ask) : "—"}</dd></div>
                        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Spread</dt><dd className="font-medium tabular-nums">{spread != null ? fmtPrice(spread) : "—"}</dd></div>
                        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">Vol Nom / Efe</dt><dd className="font-medium tabular-nums">{market?.volumeNominal != null ? String(market.volumeNominal) : "—"} / {market?.volumeEfectivo != null ? String(market.volumeEfectivo) : "—"}</dd></div>
                        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">High / Low</dt><dd className="font-medium tabular-nums">{market?.high != null ? fmtPrice(market.high) : "—"} / {market?.low != null ? fmtPrice(market.low) : "—"}</dd></div>
                        <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">ISIN / Ley</dt><dd className="font-medium">{cuadro?.isin ?? "—"} / {cuadro?.ley ?? "—"}</dd></div>
                      </dl>
                      {cerStale && <Badge variant="outline" className="mt-3 border-amber-600 text-amber-600">CER desactualizado</Badge>}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-base">Sparkline TIR/MD</CardTitle><CardDescription>{symbol} destacado</CardDescription></CardHeader>
                    <CardContent>
                      {sparklineData && sparklineData.length > 1 ? (
                        <div className="h-40">
                          <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                              <XAxis type="number" dataKey="md" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                              <YAxis type="number" dataKey="tir" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} tickLine={false} axisLine={false} />
                              <ReTooltip content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const d = payload[0]?.payload as { name: string; tir: number; md: number };
                                if (!d) return null;
                                return <div className="rounded-lg border bg-popover px-2 py-1.5 text-xs shadow-md"><p className="font-mono font-semibold">{d.name}</p><p>TIR {(d.tir * 100).toFixed(2)}% · MD {d.md.toFixed(2)}</p></div>;
                              }} />
                              <Scatter data={sparklineData.filter((d) => !d.isSelf)} fill="var(--chart-2)" />
                              <Scatter data={sparklineData.filter((d) => d.isSelf)} fill="var(--chart-1)" />
                            </ScatterChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <p className="py-8 text-center text-sm tabular-nums">TIR {fmtPct(tir)} · MD {fmt(md)} · {symbol}</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
                {ficha.disclaimer && <p className="mt-4 text-center text-xs text-muted-foreground" role="note">{ficha.disclaimer}</p>}
              </TabsContent>

              {/* Cashflow */}
              <TabsContent value="cashflow" className="mt-4 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150 motion-reduce:data-[state=active]:animate-none">
                <Card>
                  <CardHeader><CardTitle className="text-base">Flujos proyectados — {symbol} (12m)</CardTitle><CardDescription>{cashflowBuckets.length > 0 ? `${cashflowBuckets.length} meses con vencimientos` : "Sin flujos en 12 meses"} · {schedule?.moneda ?? "—"}</CardDescription></CardHeader>
                  <CardContent>
                    {cashflowBuckets.length === 0 ? (
                      <div className="py-8 text-center">
                        <p className="text-sm font-medium">Sin flujos próximos</p>
                        <p className="mt-1 text-sm text-muted-foreground">No hay cupones/amortizaciones de {symbol} en los próximos 12 meses por cronograma {schedule?.vencimiento ?? ""}.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {cashflowBuckets.map((b) => (
                          <div key={b.month} className="rounded-xl border bg-card p-4 shadow-sm animate-in fade-in-0 duration-150 motion-reduce:animate-none">
                            <p className="text-sm font-semibold capitalize">{b.label}</p>
                            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                              {b.totalArs > 0 && `ARS ${b.totalArs.toFixed(2)}`}{b.totalArs > 0 && b.totalUsd > 0 && " · "}{b.totalUsd > 0 && `USD ${b.totalUsd.toFixed(2)}`}{b.totalArs === 0 && b.totalUsd === 0 && `${b.items.length} flujo(s)`}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {b.items.map((it, idx) => (
                                <span key={`${it.symbol}-${idx}`} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">
                                  <span className="font-mono font-semibold">{it.symbol}</span>
                                  <span className="text-muted-foreground">{it.currency === "USD" ? "US$" : "AR$"} {(it.renta + it.amort).toFixed(2)}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Tecnica */}
              <TabsContent value="tecnica" className="mt-4 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150 motion-reduce:data-[state=active]:animate-none">
                <Card>
                  <CardHeader><CardTitle className="text-base">Cuadro técnico — {symbol}</CardTitle><CardDescription>BYMA ficha + cálculo paridad seguro</CardDescription></CardHeader>
                  <CardContent>
                    <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                      <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs uppercase tracking-wide text-muted-foreground">VT (valor técnico)</dt><dd className="mt-1 font-medium tabular-nums">{cuadro?.vt != null ? fmt(cuadro.vt, 2) : "—"}</dd></div>
                      <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs uppercase tracking-wide text-muted-foreground">VR (valor residual)</dt><dd className="mt-1 font-medium tabular-nums">{cuadro?.vr != null ? fmt(cuadro.vr, 2) : "—"}</dd></div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Paridad</dt>
                        <dd className="mt-1 font-medium tabular-nums">
                          {isParidadCalculable && cuadro?.paridad != null ? `${fmt(cuadro.paridad, 2)}%` : (
                            <Tooltip>
                              <TooltipTrigger asChild><span className="cursor-help border-b border-dotted">—</span></TooltipTrigger>
                              <TooltipContent>cupón no informado — paridad no calculable (ej LECAP)</TooltipContent>
                            </Tooltip>
                          )}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Interés corrido</dt><dd className="mt-1 font-medium tabular-nums">{cuadro?.accrued != null ? fmt(cuadro.accrued, 4) : "—"}</dd></div>
                      <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Tasa cupón</dt><dd className="mt-1 font-medium tabular-nums">{cuadro?.couponRate != null ? fmtPct(cuadro.couponRate) : "—"}</dd></div>
                      <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Frecuencia / Day count</dt><dd className="mt-1 font-medium">{cuadro?.frequency != null ? `${cuadro.frequency}×` : "—"} / {cuadro?.dayCount ?? "—"}</dd></div>
                      <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Próx. cupón</dt><dd className="mt-1 font-medium tabular-nums">{cuadro?.nextCouponDate ? new Date(cuadro.nextCouponDate).toLocaleDateString("es-AR") : "—"}</dd></div>
                      <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs uppercase tracking-wide text-muted-foreground">ISIN</dt><dd className="mt-1 font-mono text-xs">{cuadro?.isin ?? "—"}</dd></div>
                      <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Ley / Emisor</dt><dd className="mt-1 font-medium">{cuadro?.ley ?? "—"} / {cuadro?.emisor ?? "—"}</dd></div>
                      <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Denom. mínima / Outstanding</dt><dd className="mt-1 font-medium tabular-nums">{cuadro?.denominacionMinima != null ? String(cuadro.denominacionMinima) : "—"} / {cuadro?.outstanding != null ? String(cuadro.outstanding) : "—"}</dd></div>
                      <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Schedule source</dt><dd className="mt-1"><Badge variant="outline" className="font-mono text-xs">{cuadro?.scheduleSource ?? "—"}</Badge></dd></div>
                      <div className="rounded-lg bg-muted/50 p-3"><dt className="text-xs uppercase tracking-wide text-muted-foreground">Moneda / Tipo</dt><dd className="mt-1 font-medium">{schedule?.moneda ?? "—"} / {schedule?.tipo ?? "—"} {schedule?.cerAjustado ? <Badge variant="outline" className="ml-2">CER</Badge> : null}</dd></div>
                    </dl>
                    {cerStale && <div className="mt-4"><Badge variant="outline" className="border-amber-600 text-amber-600">CER desactualizado</Badge><p className="mt-1 text-xs text-muted-foreground">CER stale — VT/paridad puede estar desfasado.</p></div>}
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Vencimiento: {schedule?.vencimiento ?? "—"}</span>
                      <span>· Flujos: {schedule?.cashflows?.length ?? 0}</span>
                      <span>· TIR {fmtPct(tir)} · MD {fmt(md)}</span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Curva */}
              <TabsContent value="curva" className="mt-4 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-150 motion-reduce:data-[state=active]:animate-none">
                <Card>
                  <CardHeader><CardTitle className="text-base">Curva — {inferredSegment} · {symbol} destacado</CardTitle><CardDescription>{curvePoints.length} puntos · TIR vs MD · segmento inferido</CardDescription></CardHeader>
                  <CardContent>
                    {curvePoints.length === 0 ? (
                      <div className="py-10 text-center">
                        <p className="text-sm font-medium">Sin curva para {inferredSegment}</p>
                        <p className="mt-1 text-sm text-muted-foreground">No hay bonos con TIR calculable en este segmento.</p>
                      </div>
                    ) : (
                      <div className="h-[420px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ top: 12, right: 16, left: 12, bottom: 12 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis type="number" dataKey="md" name="MD" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} label={{ value: "Duration modificada (años)", position: "insideBottom", offset: -4, fontSize: 11 }} />
                            <YAxis type="number" dataKey="tir" name="TIR" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} tickLine={false} axisLine={false} label={{ value: "TIR", angle: -90, position: "insideLeft", fontSize: 11 }} />
                            <ReTooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const d = payload[0]?.payload as { ticker: string; tir: number; md: number; vencimiento: string } | undefined;
                              if (!d) return null;
                              const isSelf = d.ticker.toUpperCase() === symbol;
                              return (
                                <div className={`rounded-lg border px-3 py-2 shadow-md text-xs ${isSelf ? "bg-primary text-primary-foreground border-primary" : "bg-popover"}`}>
                                  <p className="font-mono font-semibold">{d.ticker}{isSelf ? " ★" : ""}</p>
                                  <p className="tabular-nums">TIR: {(d.tir * 100).toFixed(2)}% · MD: {d.md.toFixed(2)}</p>
                                  {d.vencimiento && <p className="opacity-80">Vto: {d.vencimiento}</p>}
                                </div>
                              );
                            }} />
                            <Scatter name={inferredSegment} data={curvePoints.filter((p) => p.ticker.toUpperCase() !== symbol)} fill="var(--chart-2)" />
                            <Scatter name={symbol} data={curvePoints.filter((p) => p.ticker.toUpperCase() === symbol)} fill="var(--chart-1)" />
                            {/* Fallback if symbol not in curve: add ficha point */}
                            {curvePoints.every((p) => p.ticker.toUpperCase() !== symbol) && tir != null && md != null && <Scatter name={`${symbol} (ficha)`} data={[{ ticker: symbol, tir, md, vencimiento: schedule?.vencimiento ?? "" }]} fill="hsl(var(--primary))" />}
                          </ScatterChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : null}

          {ficha?.disclaimer && tab !== "overview" && <p className="text-center text-xs text-muted-foreground" role="note">{ficha.disclaimer}</p>}
        </div>
      </div>
    </TooltipProvider>
  );
}

export default BondFichaPage;
