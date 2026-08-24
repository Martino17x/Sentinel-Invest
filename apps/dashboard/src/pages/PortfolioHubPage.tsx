import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Briefcase, Bookmark, TrendingUp, Calendar, Layers, Loader2, HelpCircle, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { virtualPortfoliosApi, type VirtualPortfolio, type VirtualPortfolioDetail } from "@/features/portafolio/api";
import { useApiData, invalidateApiCache } from "@/hooks/useApiData";

const formatterARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function formatARS(v: number) {
  return formatterARS.format(v);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PortfolioHubPage() {
  const { data, isLoading, error, refetch } = useApiData("virtual-portfolios", () =>
    virtualPortfoliosApi.list()
  );

  const portfolios: VirtualPortfolio[] = data?.portfolios ?? [];

  // Enriquecimiento: cantidad posiciones y valor total requieren GET /:id
  const [detailsMap, setDetailsMap] = useState<Record<string, VirtualPortfolioDetail>>({});
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    if (portfolios.length === 0) {
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
  }, [portfolios.map((p) => p.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Popover explicativo
  const [helpOpen, setHelpOpen] = useState(false);

  // Dialog crear
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setCreateError("El nombre es obligatorio");
      return;
    }
    if (trimmed.length < 2) {
      setCreateError("Mínimo 2 caracteres");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await virtualPortfoliosApi.create({
        name: trimmed,
        description: description.trim() || null,
      });
      invalidateApiCache("virtual-portfolios");
      setName("");
      setDescription("");
      setOpen(false);
      await refetch({ forceLoading: true });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Briefcase className="h-6 w-6 text-muted-foreground" />
            Portafolios de seguimiento
          </h1>
          <Popover open={helpOpen} onOpenChange={setHelpOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Qué es un portafolio de seguimiento"
                className="rounded-full border border-transparent hover:border-border hover:bg-muted/50"
              >
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={8}
              className="max-w-sm rounded-xl border bg-card p-0 shadow-md ring-1 ring-foreground/5"
            >
              <div className="flex items-start justify-between gap-3 p-4 pb-3">
                <div className="space-y-1 pr-2">
                  <p className="text-sm font-medium leading-none">¿Qué es un portafolio de seguimiento?</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Un espacio virtual donde armás posiciones ficticias (símbolo, cantidad y precio promedio) y ves su
                    valorización con precios reales del mercado. No toca tu cuenta de IOL ni genera operaciones.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Cerrar"
                  onClick={() => setHelpOpen(false)}
                  className="shrink-0 -mr-1 -mt-1 rounded-full"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="space-y-2 px-4 pb-4 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Seguimiento puro.</span> Probá ideas sin riesgo antes de operar.
                </p>
                <p>
                  <span className="font-medium text-foreground">Valorización real.</span> Precios y PnL con cotizaciones actuales.
                </p>
                <p>
                  <span className="font-medium text-foreground">Aislado.</span> No afecta tu panel ni tu disponible.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <p className="text-sm text-muted-foreground">
          Simulá estrategias sin mover tu cartera real — ideal para watchlists y backtesting manual.
        </p>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card Crear — dashed */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Card className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center border-dashed bg-muted/20 p-6 text-center transition-colors hover:bg-muted/40 hover:border-primary/30 animate-in fade-in-0 duration-300 motion-reduce:animate-none">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed bg-background">
                  <Plus className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-medium">Crear portafolio</p>
                <p className="mt-1 text-xs text-muted-foreground">Nuevo seguimiento virtual</p>
              </Card>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:right-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:h-[92vh] max-sm:max-h-[92vh] max-sm:flex max-sm:flex-col max-sm:overflow-hidden max-sm:p-0 max-sm:gap-0 motion-reduce:animate-none max-sm:data-[state=open]:slide-in-from-bottom-full max-sm:data-[state=closed]:slide-out-to-bottom-full max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100 max-sm:border-t">
              <DialogHeader className="max-sm:px-6 max-sm:pt-6 max-sm:pb-4 max-sm:shrink-0 max-sm:border-b">
                <DialogTitle>Crear portafolio de seguimiento</DialogTitle>
                <DialogDescription>
                  Elegí un nombre y, si querés, una descripción. Podés agregar posiciones después.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 max-sm:flex-1 max-sm:overflow-y-auto max-sm:px-6 max-sm:py-5 max-sm:min-h-0">
                <div className="space-y-2">
                  <Label htmlFor="hub-name">Nombre *</Label>
                  <Input
                    id="hub-name"
                    placeholder="Ej: Tech largo plazo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                     maxLength={50}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hub-desc">Descripción</Label>
                  <textarea
                    id="hub-desc"
                    placeholder="Opcional — ej: CEDEARs para seguir sin comprar"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={300}
                    rows={3}
                    className="flex min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
                  />
                </div>
                {createError && (
                  <p className="text-sm text-destructive" role="alert">
                    {createError}
                  </p>
                )}
                <DialogFooter className="max-sm:mx-0 max-sm:-mb-0 max-sm:mt-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={creating}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={creating || !name.trim()}>
                    {creating && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
                    Crear
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Cards de portfolios */}
          {portfolios.map((pf) => {
            const detail = detailsMap[pf.id];
            const count = detail ? detail.positions.length : null;
            const total = detail ? detail.totals.totalArs : null;
            return (
              <Link
                key={pf.id}
                to={`/portfolio/seguimiento/${pf.id}`}
                className="group block animate-in fade-in-0 duration-300 motion-reduce:animate-none"
              >
                <Card className="flex h-full min-h-[160px] flex-col transition-colors hover:border-primary/20 hover:ring-1 hover:ring-primary/10 group-hover:border-primary/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base leading-tight">
                      <Bookmark className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="truncate">{pf.name}</span>
                    </CardTitle>
                    {pf.description ? (
                      <CardDescription className="line-clamp-2">{pf.description}</CardDescription>
                    ) : (
                      <CardDescription className="italic">Sin descripción</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="mt-auto space-y-2 pt-0">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1">
                        <Layers className="h-3 w-3" />
                        {count !== null ? `${count} posiciones` : detailsLoading ? "…" : "— posiciones"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1">
                        <TrendingUp className="h-3 w-3" />
                        {total !== null ? formatARS(total) : detailsLoading ? "…" : "—"}
                      </span>
                    </div>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Creado {formatDate(pf.createdAt)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {!isLoading && !error && portfolios.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Todavía no tenés portafolios. Creá el primero con el botón punteado.
        </p>
      )}
    </div>
  );
}

export default PortfolioHubPage;
