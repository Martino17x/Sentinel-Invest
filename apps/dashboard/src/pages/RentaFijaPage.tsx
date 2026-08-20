import { Link } from "react-router-dom";
import { Landmark, TrendingUp, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/ui/disclaimer-banner";

export function RentaFijaPage() {
  return (
    <div className="space-y-0">
      <DisclaimerBanner />
      <div className="space-y-6 p-4 sm:p-6 lg:p-8 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Landmark className="h-6 w-6 text-primary" />
            Renta Fija
          </h1>
          <p className="text-sm text-muted-foreground">
            Curvas por segmento y calendario de flujos — TIR, paridad y duration
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="hover:shadow-md transition-shadow motion-reduce:transition-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-5 w-5 text-primary" />
                Curva
              </CardTitle>
              <CardDescription>TIR vs duration por segmento — USD hard-dollar, BOPREAL, LECAP/BONCAP, CER</CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/renta-fija/curva">
                <Button className="w-full cursor-pointer">Ver curva</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow motion-reduce:transition-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-5 w-5 text-primary" />
                Calendario
              </CardTitle>
              <CardDescription>En {`{mes}`} cobrás — rentas y amortizaciones proyectadas 12 meses</CardDescription>
            </CardHeader>
            <CardContent>
              <Link to="/renta-fija/calendario">
                <Button className="w-full cursor-pointer">Ver calendario</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Información educativa, no asesoramiento financiero. No constituye recomendación CNV.
        </p>
      </div>
    </div>
  );
}

export default RentaFijaPage;
