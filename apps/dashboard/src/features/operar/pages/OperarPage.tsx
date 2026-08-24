import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TradeForm } from "@/components/trade/TradeDialog";
import { FciForm, type FciMode } from "@/components/trade/FciDialog";
import type { OrderResult } from "@/lib/api";

type OperationType = "trade" | "mep" | "fci";

const TYPE_LABELS: Record<OperationType, string> = {
  trade: "Acciones / CEDEARs / Bonos",
  mep: "Dólar MEP (especie D)",
  fci: "Fondo común de inversión",
};

/**
 * Página "Nueva operación": eligé el tipo (acciones/CEDEARs/bonos, MEP o FCI)
 * y completá el formulario. Todo pasa por confirmación explícita antes de
 * enviarse a IOL (sin modales).
 */
export function OperarPage() {
  const [type, setType] = useState<OperationType>("trade");
  const [fciMode, setFciMode] = useState<FciMode>("subscribe");
  const [symbol, setSymbol] = useState("");

  function onSuccess(result: OrderResult) {
    // El formulario ya muestra el estado "enviada"; nada extra por ahora.
    void result;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva operación</h1>
        <p className="text-sm text-muted-foreground">
          Operá en tu cuenta IOL con confirmación explícita
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(TYPE_LABELS) as OperationType[]).map((t) => (
          <Button
            key={t}
            type="button"
            variant={type === t ? "default" : "outline"}
            onClick={() => setType(t)}
            className="cursor-pointer justify-start"
          >
            {TYPE_LABELS[t]}
          </Button>
        ))}
      </div>


      {type === "fci" ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={fciMode === "subscribe" ? "default" : "outline"}
                onClick={() => setFciMode("subscribe")}
                className="cursor-pointer"
              >
                Suscribir
              </Button>
              <Button
                type="button"
                variant={fciMode === "rescue" ? "default" : "outline"}
                onClick={() => setFciMode("rescue")}
                className="cursor-pointer"
              >
                Rescatar
              </Button>
            </div>
            <CardTitle className="text-base font-medium">
              {fciMode === "subscribe" ? "Suscripción a FCI" : "Rescate de FCI"}
            </CardTitle>
            <CardDescription>Fondos comunes de inversión en tu cuenta IOL</CardDescription>
          </CardHeader>
          <CardContent>
            <FciForm mode={fciMode} symbol={symbol} onSymbolChange={setSymbol} onSuccess={onSuccess} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Orden de {type === "mep" ? "MEP" : "compra/venta"}</CardTitle>
            <CardDescription>{TYPE_LABELS[type]}</CardDescription>
          </CardHeader>
          <CardContent>
            <TradeForm
              symbol={symbol}
              onSymbolChange={setSymbol}
              market="bcba"
              marketEditable={type === "trade"}
              currency="ARS"
              lastPrice={0}
              allowMep={type === "mep"}
              defaultSpecie={type === "mep" ? "D" : "normal"}
              onSuccess={onSuccess}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
