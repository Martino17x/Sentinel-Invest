import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/**
 * Botón de Google OAuth.
 *
 * NAVEGA DIRECTO al backend (no pasa por el proxy de Vite):
 * el flujo OAuth con redirects de terceros (Google) necesita que la
 * cookie oauth_state se guarde en el MISMO origen del callback.
 * Si el botón usara /api/auth/google (relativo → proxy de Vite),
 * la cookie se guardaría en un contexto que el callback (directo a
 * localhost:3001) no siempre ve — causando "invalid_state".
 */
export function GoogleButton() {
  const serverOrigin =
    import.meta.env.VITE_SERVER_ORIGIN ?? "http://localhost:3001";

  return (
    <>
      <div className="relative my-4">
        <Separator />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
          o continuá con
        </span>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          window.location.href = `${serverOrigin}/api/auth/google`;
        }}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
            fill="#EA4335"
          />
        </svg>
        Continuar con Google
      </Button>
    </>
  );
}
