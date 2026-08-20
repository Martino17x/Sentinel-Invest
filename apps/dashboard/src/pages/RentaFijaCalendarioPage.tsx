import { useState } from "react";
import { Clock, RefreshCw, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DisclaimerBanner } from "@/components/ui/disclaimer-banner";
import { bondsApi, connectionsApi } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";

export function RentaFijaCalendarioPage() {
  const { data: connData } = useApiData("connections:state", () => connectionsApi.getState());
  const accounts = connData?.accounts ?? [];
  const defaultAccountId = accounts.length > 0 ? accounts[0].id : null;
  const [accountId, setAccountId] = useState<string | null>(null);
  const effectiveAccountId = accountId ?? defaultAccountId;

  const cacheKey = effectiveAccountId ? `bonds:cashflow:${effectiveAccountId}` : null;
  const { data, isLoading, error, refetch, isRefreshing } = useApiData(
    cacheKey,
    () => bondsApi.getCashflow(effectiveAccountId!),
    { enabled: Boolean(effectiveAccountId) }
  );

  const months = data?.months ?? [];
  const isStale = data?.stale === true;
  const isMarketClosed = data?.isMarketClosed ?? false;

  return (
    <div className="space-y-0">
      <DisclaimerBanner />
      <div className="space-y-6 p-4 sm:p-6 lg:p-8 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" />
              Calendario de flujos
            </h1>
            <p className="text-sm text-muted-foreground">Proyección 12 meses — En {`{mes}`} cobrás</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Actualizar" aria-label="Actualizar calendario" disabled={!effectiveAccountId}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing || isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
          </Button>
        </div>

        {/* Account selector when multiple */}
        {accounts.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => {
              const active = effectiveAccountId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccountId(a.id)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none ${active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted"}`}
                >
                  {a.name ?? a.iolAccountNumber} — {a.currency}
                </button>
              );
            })}
          </div>
        )}

        {!effectiveAccountId && (
          <Alert>
            <AlertDescription>Conectá tu cuenta IOL para ver el calendario personalizado.</AlertDescription>
          </Alert>
        )}

        {isStale && (
          <Alert className="border-amber-600 bg-amber-500 text-white dark:border-amber-600 dark:bg-amber-500 dark:text-white animate-in fade-in-0 duration-200 motion-reduce:animate-none">
            <AlertDescription className="flex items-center gap-2 text-white">
              <Clock className="h-4 w-4 shrink-0 text-white" />
              Datos del cierre anterior — cron 17:10 no disponible, se muestra stale.
            </AlertDescription>
          </Alert>
        )}

        {isMarketClosed && !isStale && months.length > 0 && (
          <Alert className="border-amber-600 bg-amber-500 text-white dark:border-amber-600 dark:bg-amber-500 dark:text-white">
            <AlertDescription className="flex items-center gap-2 text-white">
              <Clock className="h-4 w-4 shrink-0 text-white" />
              Mercado cerrado — flujos proyectados al cierre.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="flex items-center justify-between gap-2 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
            <AlertDescription>{error}</AlertDescription>
            <Button variant="outline" size="sm" className="shrink-0 cursor-pointer" onClick={() => refetch({ forceLoading: true })}>
              Reintentar
            </Button>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximos flujos</CardTitle>
            <CardDescription>
              {months.length > 0 ? `${months.length} meses con vencimientos` : "Calendario 12 meses por tenencia × cronograma"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && months.length === 0 ? (
              <div className="space-y-3" aria-busy="true" aria-label="Cargando calendario">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full motion-reduce:animate-none" />
                ))}
              </div>
            ) : !error && months.length === 0 ? (
              <div className="py-10 text-center animate-in fade-in-0 duration-200 motion-reduce:animate-none">
                <p className="text-sm font-medium">Sin flujos próximos</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No tenés bonos con vencimientos en los próximos 12 meses, o tu cartera de bonos está vacía.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {months.map((m) => (
                  <div
                    key={m.month}
                    className="rounded-xl border bg-card p-4 shadow-sm animate-in fade-in-0 duration-200 motion-reduce:animate-none"
                  >
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {m.totalArs > 0 && `ARS ${m.totalArs.toFixed(2)}`}
                      {m.totalArs > 0 && m.totalUsd > 0 && " · "}
                      {m.totalUsd > 0 && `USD ${m.totalUsd.toFixed(2)}`}
                      {m.totalArs === 0 && m.totalUsd === 0 && `${m.items.length} flujo(s)`}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.items.map((it, idx) => (
                        <span key={`${it.symbol}-${idx}`} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium tabular-nums">
                          <span className="font-mono font-semibold">{it.symbol}</span>
                          <span className="text-muted-foreground">
                            {it.currency === "USD" ? "US$" : "AR$"} {(it.renta + it.amort).toFixed(2)}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {data?.disclaimer && (
          <p className="text-center text-xs text-muted-foreground" role="note">
            {data.disclaimer}
          </p>
        )}
      </div>
    </div>
  );
}

export default RentaFijaCalendarioPage;
