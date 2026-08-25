import { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Shield, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api-client";

/**
 * Gate obligatorio para perfil inversor.
 *
 * Decisión de diseño / tradeoff (documentado):
 * - Por defecto el modal es NO dismissible (sin X, sin cierre por overlay/Escape).
 *   Es el comportamiento obligatorio pedido: el usuario debe completar el test
 *   para recibir recomendaciones personalizadas y para que el backend deje de
 *   responder 428 en mutaciones.
 * - Se ofrece un botón secundario "Recordámelo más tarde" que snoozeea 24h
 *   via localStorage (`investorProfileGateSnoozedUntil`). No es cierre
 *   permanente: al expirar vuelve a aparecer. Esto evita bloquear 100% a un
 *   usuario que quiere explorar primero, sin violar el carácter obligatorio.
 *   Si se quiere 100% bloqueante, eliminar el botón secundario y el bloque
 *   de snooze — el resto del Gate queda igual.
 */

const SNOOZE_KEY = "investorProfileGateSnoozedUntil";
const SNOOZE_MS = 24 * 60 * 60 * 1000; // 1 día

function isSnoozed(): boolean {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (Number.isNaN(until)) return false;
    if (Date.now() < until) return true;
    // expirado → limpiar
    localStorage.removeItem(SNOOZE_KEY);
    return false;
  } catch {
    return false;
  }
}

function snooze(): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    /* storage no disponible */
  }
}

const PROFILE_ROUTES = new Set(["/investor-profile", "/perfil-inversor"]);

export function InvestorProfileGate() {
  const navigate = useNavigate();
  const location = useLocation();
  const [needsProfile, setNeedsProfile] = useState(false);
  const [checked, setChecked] = useState(false);

  const isOnProfilePage = PROFILE_ROUTES.has(location.pathname);

  const checkProfile = useCallback(async () => {
    // No chequear si ya está en la página del test — evita auto-bloquearse
    if (isOnProfilePage) {
      setNeedsProfile(false);
      setChecked(true);
      return;
    }
    // Respetar snooze de 24h
    if (isSnoozed()) {
      setNeedsProfile(false);
      setChecked(true);
      return;
    }
    try {
      await apiFetch<unknown>("/investor-profile", { method: "GET" });
      // 200 → tiene perfil, no mostrar gate
      setNeedsProfile(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // Sin perfil → mostrar gate (si no está snoozeado)
        if (!isSnoozed()) setNeedsProfile(true);
        else setNeedsProfile(false);
      } else {
        // Otros errores (401 ya manejado por apiFetch, 500, red) → no bloquear
        setNeedsProfile(false);
      }
    } finally {
      setChecked(true);
    }
  }, [isOnProfilePage]);

  useEffect(() => {
    // Re-chequear al cambiar de ruta (por si completó el test y volvió)
    // pero evitar loop si ya está en perfil
    setChecked(false);
    void checkProfile();
  }, [checkProfile]);

  // Re-chequear cuando la ventana recupera foco (por si completó en otra tab)
  useEffect(() => {
    function onFocus() {
      void checkProfile();
    }
    function onStorage(e: StorageEvent) {
      // Si se completó perfil en otra tab, el backend ya responde 200; re-validar
      if (e.key === SNOOZE_KEY) void checkProfile();
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [checkProfile]);

  // Mientras no se verificó, no mostrar nada (evita flash)
  if (!checked) return null;
  // En la propia página del test nunca mostrar el gate
  if (isOnProfilePage) return null;
  // Con perfil o snoozeado, no mostrar
  if (!needsProfile) return null;

  function handlePrimary() {
    navigate("/investor-profile");
  }

  function handleSnooze() {
    snooze();
    setNeedsProfile(false);
  }

  // open controlado: solo permite cerrar via botones, no por overlay/Escape
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && needsProfile) {
      // Intento de cerrar por overlay o Escape → ignorar (gate obligatorio)
      return;
    }
    setNeedsProfile(nextOpen);
  }

  return (
    <Dialog open={needsProfile} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none sm:max-w-md"
        // Radix: onEscapeKeyDown y onInteractOutside ya están bloqueados via handleOpenChange,
        // pero por seguridad prevenimos el cierre default
        onEscapeKeyDown={(e) => {
          if (needsProfile) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (needsProfile) e.preventDefault();
        }}
        aria-describedby="investor-gate-desc"
      >
        <DialogHeader className="gap-3">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle className="text-center text-lg">
            Completá tu test de inversor
          </DialogTitle>
          <DialogDescription
            id="investor-gate-desc"
            className="text-center text-sm leading-relaxed"
          >
            Completá tu test de inversor (2 min) para recibir recomendaciones personalizadas.
            Es obligatorio antes de analizar el mercado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 pt-1">
          <Button onClick={handlePrimary} className="w-full cursor-pointer">
            <Shield className="mr-2 h-4 w-4" />
            Hacer test ahora
          </Button>
          <Button
            variant="ghost"
            onClick={handleSnooze}
            className="w-full cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <Clock className="mr-2 h-4 w-4" />
            Recordámelo más tarde
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Podés posponerlo 24 h. Luego volverá a aparecer hasta completar el test.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
