import { useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { SegmentedToggle } from "@/components/trade/SegmentedToggle";
import { tradeFormSchema, parseDecimal } from "@/components/trade/tradeSchema";
import { ordersApi, type CreateOrderInput, type OrderMarket, type OrderSide, type OrderTerm, type PriceType, type OrderResult } from "@/lib/api";
import { invalidateApiCache } from "@/hooks/useApiData";

const formatterARS = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const formatterUSD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function formatMoney(value: number, currency: string) {
  if (!Number.isFinite(value)) return "—";
  return currency === "USD" ? formatterUSD.format(value) : formatterARS.format(value);
}

type TradeStep = "form" | "confirm" | "done";

export interface TradeFormProps {
  symbol: string;
  /** Si viene, el símbolo es editable (flujo "Nueva operación"); si no, queda fijo. */
  onSymbolChange?: (symbol: string) => void;
  market: OrderMarket;
  /** Muestra el selector de Mercado (solo cuando el símbolo es editable). */
  marketEditable?: boolean;
  currency: string;
  lastPrice: number;
  /** Habilita la opción MEP (especie D) — solo mercado local bcba. */
  allowMep?: boolean;
  defaultSide?: OrderSide;
  defaultSpecie?: "normal" | "D";
  /** Efectivo disponible (Compra). */
  availableCashArs?: number;
  availableCashUsd?: number;
  /** Cantidad en cartera (Venta). */
  availableQty?: number;
  /** Puntas: mejor compra / mejor venta (para modo límite). */
  bid?: number | null;
  ask?: number | null;
  /** Variación diaria % (para la franja de precio). */
  variationPct?: number;
  onSuccess?: (result: OrderResult) => void;
}

const TERM_LABELS: Record<OrderTerm, string> = {
  t0: "T0 (contado inmediato)",
  t1: "T1 (24 h)",
  t2: "T2 (48 h)",
};

const VALIDITY_LABELS: Record<"1d" | "7d", string> = {
  "1d": "Solo por hoy",
  "7d": "Esta semana",
};

/**
 * Formulario de compra/venta (referencia: pantalla de operar de IOL).
 * Validación con Zod por campo; Cantidad/Monto se convierten al cambiar de modo.
 */
export function TradeForm({
  symbol,
  onSymbolChange,
  market,
  marketEditable = false,
  currency,
  lastPrice,
  allowMep = false,
  defaultSide = "buy",
  defaultSpecie = "normal",
  availableCashArs,
  availableCashUsd,
  availableQty,
  bid,
  ask,
  variationPct,
  onSuccess,
}: TradeFormProps) {
  const [side, setSide] = useState<OrderSide>(defaultSide);
  const [mode, setMode] = useState<"qty" | "amount">("qty");
  const [qty, setQty] = useState("");
  const [amount, setAmount] = useState("");
  const [priceType, setPriceType] = useState<PriceType>("market");
  const [price, setPrice] = useState("");
  const [term, setTerm] = useState<OrderTerm>("t1");
  const [validity, setValidity] = useState<"1d" | "7d">("1d");
  const [marketSel, setMarketSel] = useState<OrderMarket>(market);
  const [specie, setSpecie] = useState<"normal" | "D">(defaultSpecie);
  const [step, setStep] = useState<TradeStep>("form");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);

  const effectiveMarket: OrderMarket = specie === "D" ? "bcba" : marketSel;
  const priceNum = priceType === "limit" ? parseDecimal(price) : lastPrice;
  const qtyNum = parseDecimal(qty);
  const amountNum = parseDecimal(amount);
  const computedQty =
    mode === "qty"
      ? qtyNum
      : Number.isFinite(priceNum) && priceNum > 0
        ? amountNum / priceNum
        : NaN;
  const qtyToSend = Math.round(computedQty);

  const total = useMemo(() => {
    if (mode === "qty") {
      return Number.isFinite(qtyNum) && qtyNum > 0 && Number.isFinite(priceNum) && priceNum > 0
        ? qtyNum * priceNum
        : null;
    }
    return Number.isFinite(amountNum) && amountNum > 0 ? amountNum : null;
  }, [mode, qtyNum, amountNum, priceNum]);

  const sideLabel = side === "buy" ? "compra" : "venta";
  const accentBtn =
    side === "buy"
      ? "bg-emerald-600 text-white hover:bg-emerald-600/85"
      : "bg-red-600 text-white hover:bg-red-600/85";

  function clearErrors() {
    setError(null);
    setFieldErrors({});
  }

  function switchMode(next: "qty" | "amount") {
    if (next === mode) return;
    if (next === "qty") {
      // Monto → Cantidad: convertir a unidades (enteras)
      const q = Number.isFinite(computedQty) ? Math.round(computedQty) : NaN;
      setQty(Number.isFinite(q) && q > 0 ? String(q) : "");
    } else {
      // Cantidad → Monto: convertir a monto
      const t =
        Number.isFinite(priceNum) && priceNum > 0 && Number.isFinite(qtyNum) ? qtyNum * priceNum : NaN;
      setAmount(Number.isFinite(t) && t > 0 ? String(Math.round(t * 100) / 100) : "");
    }
    setMode(next);
    clearErrors();
  }

  function handleNext() {
    const parsed = tradeFormSchema.safeParse({
      symbol,
      side,
      mode,
      qty: mode === "qty" ? parseDecimal(qty) : undefined,
      amount: mode === "amount" ? parseDecimal(amount) : undefined,
      priceType,
      price: priceType === "limit" ? parseDecimal(price) : undefined,
      term,
      validity,
      market: effectiveMarket,
      specie,
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
    const input: CreateOrderInput = {
      symbol: symbol.trim().toUpperCase(),
      side,
      qty: qtyToSend,
      priceType,
      price: priceType === "limit" ? priceNum : undefined,
      market: effectiveMarket,
      term,
      validity,
      specie: specie === "D" ? "D" : undefined,
    };
    try {
      const res = await ordersApi.createOrder(input);
      invalidateApiCache("operations");
      invalidateApiCache("portfolio");
      invalidateApiCache("operar");
      setResult(res);
      onSuccess?.(res);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la orden");
      setStep("confirm");
    } finally {
      setSubmitting(false);
    }
  }

  const showPuntas = priceType === "limit" && (bid != null || ask != null);

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === "form" && (
        <div className="space-y-4">
          {/* Toggle Comprar / Vender */}
          <SegmentedToggle<OrderSide>
            value={side}
            onChange={(v) => { setSide(v); clearErrors(); }}
            options={[
              { value: "buy", label: "Comprar" },
              { value: "sell", label: "Vender" },
            ]}
            accent={side === "buy" ? "green" : "red"}
          />

          {onSymbolChange && (
            <div className="space-y-1.5">
              <Label htmlFor="trade-symbol">Símbolo</Label>
              <Input id="trade-symbol" value={symbol} onChange={(e) => { onSymbolChange(e.target.value.toUpperCase()); clearErrors(); }} placeholder="GGAL" autoComplete="off" aria-invalid={!!fieldErrors.symbol} />
              {fieldErrors.symbol && <p className="text-xs text-destructive">{fieldErrors.symbol}</p>}
            </div>
          )}

          {marketEditable && (
            <div className="space-y-1.5">
              <Label>Mercado</Label>
              <Select value={marketSel} onValueChange={(v) => { setMarketSel(v as OrderMarket); clearErrors(); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bcba">Argentina (BCBA)</SelectItem>
                  <SelectItem value="nyse">EEUU (NYSE)</SelectItem>
                  <SelectItem value="nasdaq">EEUU (NASDAQ)</SelectItem>
                  <SelectItem value="bonds">Bonos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Precio del mercado */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
            <div>
              <p className="text-xs text-muted-foreground">Precio del mercado</p>
              <p className="text-lg font-bold tabular-nums">
                {lastPrice > 0 ? formatMoney(lastPrice, currency) : "—"}
              </p>
            </div>
            <div className="text-right">
              {variationPct != null && lastPrice > 0 && (
                <p className={cn("text-sm font-semibold tabular-nums", variationPct >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {variationPct >= 0 ? "▲" : "▼"} {variationPct >= 0 ? "+" : ""}{variationPct.toFixed(2)}%
                </p>
              )}
              <p className="text-xs text-muted-foreground">Plazo {TERM_LABELS[term]}</p>
            </div>
          </div>

          {/* Toggle Cantidad / Monto + input grande */}
          <SegmentedToggle<"qty" | "amount">
            value={mode}
            onChange={switchMode}
            options={[
              { value: "qty", label: "Cantidad" },
              { value: "amount", label: "Monto" },
            ]}
          />

          <div>
            <div className="relative">
              <Input
                id="trade-qty"
                type="text"
                inputMode="decimal"
                value={mode === "qty" ? qty : amount}
                onChange={(e) => { if (mode === "qty") setQty(e.target.value); else setAmount(e.target.value); clearErrors(); }}
                placeholder="0"
                className="h-14 pr-24 text-2xl font-bold tabular-nums"
                aria-invalid={!!(mode === "qty" ? fieldErrors.qty : fieldErrors.amount)}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                {mode === "qty" ? symbol.toUpperCase() : currency}
              </span>
            </div>
            {(mode === "qty" ? fieldErrors.qty : fieldErrors.amount) && (
              <p className="mt-1 text-xs text-destructive">{mode === "qty" ? fieldErrors.qty : fieldErrors.amount}</p>
            )}
          </div>

          {/* Estimado */}
          {mode === "qty" ? (
            <p className="text-center text-sm text-muted-foreground">
              Total estimado de <span className="font-semibold text-emerald-600">{currency}</span>:{" "}
              <span className="font-bold tabular-nums text-foreground">{total !== null ? formatMoney(total, currency) : formatMoney(0, currency)}</span>
            </p>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              ≈ <span className="font-semibold tabular-nums text-foreground">{Number.isFinite(computedQty) && computedQty > 0 ? computedQty.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "0"}</span>{" "}
              unidades <span className="text-muted-foreground">(a {lastPrice > 0 ? formatMoney(lastPrice, currency) : "—"})</span>
            </p>
          )}

          {/* Disponible contextual */}
          {side === "buy" ? (
            (availableCashArs != null || availableCashUsd != null) && (
              <p className="text-xs text-muted-foreground">
                Disponible: <span className="tabular-nums">{formatMoney(availableCashArs ?? 0, "ARS")}</span>
                {availableCashUsd != null && (
                  <> · <span className="tabular-nums">{formatMoney(availableCashUsd, "USD")}</span></>
                )}
              </p>
            )
          ) : (
            availableQty != null && (
              <p className="text-xs text-muted-foreground">
                Disponibles: <span className="tabular-nums font-medium text-foreground">{availableQty.toLocaleString("es-AR")}</span> u. de {symbol.toUpperCase()}
              </p>
            )
          )}

          {/* Modalidad */}
          <div className="space-y-1.5">
            <Label>Modalidad</Label>
            <SegmentedToggle<PriceType>
              value={priceType}
              onChange={(v) => { setPriceType(v); clearErrors(); }}
              options={[
                { value: "market", label: "Precio mercado" },
                { value: "limit", label: "Precio límite" },
              ]}
            />
          </div>

          {priceType === "limit" && (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label htmlFor="trade-price">Precio por unidad ({currency})</Label>
                <Input id="trade-price" type="text" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); clearErrors(); }} placeholder="0" aria-invalid={!!fieldErrors.price} />
                {fieldErrors.price && <p className="text-xs text-destructive">{fieldErrors.price}</p>}
              </div>

              {showPuntas && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Caja de puntas
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {bid != null && (
                      <button
                        type="button"
                        onClick={() => { setPrice(String(bid)); clearErrors(); }}
                        className="cursor-pointer rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-left transition-colors hover:bg-emerald-500/20"
                      >
                        <span className="block text-[11px] font-medium text-emerald-600">Compra</span>
                        <span className="block text-sm font-semibold tabular-nums">{formatMoney(bid, currency)}</span>
                      </button>
                    )}
                    {ask != null && (
                      <button
                        type="button"
                        onClick={() => { setPrice(String(ask)); clearErrors(); }}
                        className="cursor-pointer rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-left transition-colors hover:bg-red-500/20"
                      >
                        <span className="block text-[11px] font-medium text-red-600">Venta</span>
                        <span className="block text-sm font-semibold tabular-nums">{formatMoney(ask, currency)}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Plazo / Validez / Especie */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Plazo</Label>
              <Select value={term} onValueChange={(v) => { setTerm(v as OrderTerm); clearErrors(); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TERM_LABELS) as OrderTerm[]).map((t) => (
                    <SelectItem key={t} value={t}>{TERM_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Validez</Label>
              <Select value={validity} onValueChange={(v) => { setValidity(v as "1d" | "7d"); clearErrors(); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(VALIDITY_LABELS) as ("1d" | "7d")[]).map((v) => (
                    <SelectItem key={v} value={v}>{VALIDITY_LABELS[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {allowMep && (
            <div className="space-y-1.5">
              <Label>Especie</Label>
              <Select value={specie} onValueChange={(v) => { setSpecie(v as "normal" | "D"); clearErrors(); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Local (ARS)</SelectItem>
                  <SelectItem value="D">Dólar MEP (especie D)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Button type="button" onClick={handleNext} className={cn("w-full cursor-pointer", accentBtn)}>
            Continuar
          </Button>
        </div>
      )}

      {step === "confirm" && (
        <div className="space-y-4">
          <p className="text-base font-semibold">Revisá los datos de tu {sideLabel}:</p>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1.5">
            <p className="flex justify-between"><span className="text-muted-foreground">Plazo</span><span className="font-medium">{TERM_LABELS[term]}</span></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Precio</span><span className="font-medium tabular-nums">{priceType === "limit" ? formatMoney(priceNum, currency) : lastPrice > 0 ? `${formatMoney(lastPrice, currency)} (referencia)` : "A mercado (referencia del servidor)"}</span></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Cantidad</span><span className="font-medium tabular-nums">{qtyToSend.toLocaleString("es-AR")} {symbol.toUpperCase()}</span></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Total estimado</span><span className="font-semibold tabular-nums">{total !== null ? formatMoney(total, currency) : "—"}</span></p>
            <p className="flex justify-between"><span className="text-muted-foreground">Validez</span><span className="font-medium">{VALIDITY_LABELS[validity]}</span></p>
          </div>
          <p className="text-xs text-muted-foreground">
            Puede haber una variación en el estimado cuando la operación se concrete. Se enviará a tu cuenta IOL y no constituye asesoramiento financiero.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setStep("form")} className="cursor-pointer">Volver</Button>
            <Button type="button" onClick={handleConfirm} disabled={submitting} className={cn("cursor-pointer", accentBtn)}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Enviando…" : `Confirmar ${sideLabel}`}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <p className="text-base font-semibold">Orden enviada</p>
            <p className="text-sm text-muted-foreground">{result.message ?? "Tu orden fue enviada a IOL."}</p>
            <p className="font-mono text-xs text-muted-foreground">Operación: {result.orderId}</p>
          </div>
          <Button type="button" onClick={() => setStep("form")} className="w-full cursor-pointer">Nueva orden</Button>
        </div>
      )}
    </div>
  );
}
