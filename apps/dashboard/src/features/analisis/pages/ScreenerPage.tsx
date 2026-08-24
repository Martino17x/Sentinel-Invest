import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { screenerApi, type ScreenerRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";

const formatterARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function formatPrice(v: number | null) {
  if (v == null) return "—";
  return formatterARS.format(v);
}

function formatInt(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("es-AR");
}

function formatPe(v: number | null) {
  if (v == null) return "—";
  return v.toFixed(2);
}

export function ScreenerPage() {
  const [market, setMarket] = useState<"bcba" | "us">("bcba");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(q.trim()), 260);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  const cacheKey = `screener:${market}`;

  const { data, isLoading, error } = useApiData(
    cacheKey,
    () => screenerApi.getScreener(market),
    { enabled: true },
  );

  const rows: ScreenerRow[] = useMemo(() => {
    const raw = data?.rows ?? data?.screener ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  const filtered: ScreenerRow[] = useMemo(() => {
    if (!debouncedQ) return rows;
    const needle = debouncedQ.toLowerCase();
    return rows.filter(
      (r) =>
        r.symbol.toLowerCase().includes(needle) ||
        (r.name ?? "").toLowerCase().includes(needle),
    );
  }, [rows, debouncedQ]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Screener</h1>
          <p className="text-sm text-muted-foreground">
            Explorá instrumentos por mercado — tabla simple con búsqueda local
          </p>
        </div>
        <Badge variant="outline" className="w-fit font-mono text-xs">
          {market === "bcba" ? "BCBA" : "US"} · {filtered.length} fila{filtered.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <Tabs value={market} onValueChange={(v) => setMarket(v as "bcba" | "us")}>
        <TabsList>
          <TabsTrigger value="bcba">🇦🇷 BCBA</TabsTrigger>
          <TabsTrigger value="us">🇺🇸 US</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar símbolo o nombre — ej: GGAL"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar en screener"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-reduce:animate-none"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {market === "bcba" ? "Mercado argentino" : "Mercado americano"} — {filtered.length} instrumento
            {filtered.length !== 1 ? "s" : ""}
          </CardTitle>
          <CardDescription>
            Precio, variación diaria, volumen, market cap y PER. Click en la fila para ir al detalle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && rows.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {debouncedQ ? `Sin resultados para "${debouncedQ}"` : "Sin instrumentos para mostrar."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Símbolo</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Var %</TableHead>
                    <TableHead className="text-right">Volumen</TableHead>
                    <TableHead className="text-right">Market cap</TableHead>
                    <TableHead className="text-right">PER</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const isUp = (r.changePct ?? 0) >= 0;
                    return (
                      <TableRow
                        key={`${r.market}:${r.symbol}`}
                        className="cursor-pointer"
                        onClick={() => navigate(`/quotes/${encodeURIComponent(r.symbol)}`)}
                      >
                        <TableCell className="font-mono font-medium">{r.symbol}</TableCell>
                        <TableCell className="max-w-56 truncate text-muted-foreground">
                          {r.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatPrice(r.price)}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-medium ${r.changePct == null ? "text-muted-foreground" : isUp ? "text-emerald-600" : "text-red-600"}`}
                        >
                          {r.changePct == null ? "—" : `${isUp ? "+" : ""}${r.changePct.toFixed(2)}%`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatInt(r.volume)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.marketCap == null ? "—" : formatInt(r.marketCap)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatPe(r.pe)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
