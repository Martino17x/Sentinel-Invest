import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { connectionsApi, type IolConnectionState } from "@/lib/api";

/**
 * Banner de recordatorio de conexión IOL.
 * Aparece de forma persistente (con opción de ocultar para la sesión)
 * cuando el usuario no tiene su cuenta de InvertirOnline conectada.
 * Sin conexión IOL la app no muestra datos reales — por eso es prioritario.
 */
export function IolConnectReminder() {
  const [state, setState] = useState<IolConnectionState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    connectionsApi
      .getState()
      .then(setState)
      .catch(() => setState(null));
  }, []);

  if (dismissed || !state || state.connected) {
    return null;
  }

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link2 className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="truncate text-amber-800 dark:text-amber-200">
            <span className="font-medium">Tu cuenta IOL no está conectada.</span>{" "}
            <span className="hidden sm:inline">
              Conectala para ver tu cartera, saldos y reportes reales.
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button asChild variant="outline" size="sm" className="border-amber-600/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300">
            <Link to="/connect">Conectar</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
            onClick={() => setDismissed(true)}
            aria-label="Ocultar recordatorio"
            title="Ocultar por ahora"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
