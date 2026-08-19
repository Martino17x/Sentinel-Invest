import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FciForm, type FciMode } from "@/components/trade/FciDialog";

/**
 * Página de FCI (suscripción/rescate) — sin modales, con confirmación inline.
 */
export function OperarFciPage() {
  const [searchParams] = useSearchParams();
  const modeParam = searchParams.get("mode") === "rescue" ? "rescue" : "subscribe";
  const [mode, setMode] = useState<FciMode>(modeParam);
  const [symbol, setSymbol] = useState("");

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fondos comunes de inversión</h1>
        <p className="text-sm text-muted-foreground">Suscribí o rescatá FCI en tu cuenta IOL</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={mode === "subscribe" ? "default" : "outline"}
              onClick={() => setMode("subscribe")}
              className="cursor-pointer"
            >
              Suscribir
            </Button>
            <Button
              type="button"
              variant={mode === "rescue" ? "default" : "outline"}
              onClick={() => setMode("rescue")}
              className="cursor-pointer"
            >
              Rescatar
            </Button>
          </div>
          <CardTitle className="text-base font-medium">
            {mode === "subscribe" ? "Suscripción a FCI" : "Rescate de FCI"}
          </CardTitle>
          <CardDescription>Fondos comunes de inversión en tu cuenta IOL</CardDescription>
        </CardHeader>
        <CardContent>
          <FciForm mode={mode} symbol={symbol} onSymbolChange={setSymbol} />
        </CardContent>
      </Card>
    </div>
  );
}
