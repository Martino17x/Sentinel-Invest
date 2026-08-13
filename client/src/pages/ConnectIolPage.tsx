import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Link2,
  Link2Off,
  Loader2,
  Lock,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { connectionsApi, type IolConnectionState } from "@/lib/api";

export function ConnectIolPage() {
  const [state, setState] = useState<IolConnectionState | null>(null);
  const [loading, setLoading] = useState(true);

  const [iolUsername, setIolUsername] = useState("");
  const [iolPassword, setIolPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [iolAccountNumber, setIolAccountNumber] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    try {
      const res = await connectionsApi.getState();
      setState(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo verificar la conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  async function handleConnect(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await connectionsApi.connect({
        iolUsername: iolUsername.trim(),
        iolPassword,
        iolAccountNumber: iolAccountNumber.trim(),
      });
      const connectedAccounts = res.accounts.map((a) => a.iolAccountNumber).join(", ");
      setSuccess(
        `¡Cuenta${res.accounts.length > 1 ? "s" : ""} ${connectedAccounts} conectada${res.accounts.length > 1 ? "s" : ""} y validada${res.accounts.length > 1 ? "s" : ""} contra IOL! Tus credenciales están cifradas.`
      );
      setIolPassword("");
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar la cuenta");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    setError(null);
    setSuccess(null);
    try {
      await connectionsApi.disconnect();
      setSuccess("Cuenta desconectada. Tus credenciales fueron eliminadas.");
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo desconectar");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const connected = Boolean(state?.connected);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conectar cuenta IOL</h1>
        <p className="text-sm text-muted-foreground">
          Vinculá tu cuenta de InvertirOnline para ver tus datos reales
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="default" className="border-emerald-500/40 bg-emerald-500/10">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle className="text-emerald-700">Listo</AlertTitle>
          <AlertDescription className="text-emerald-700">{success}</AlertDescription>
        </Alert>
      )}

      {connected ? (
        /* ===== Estado: CONECTADO ===== */
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                Cuenta conectada
              </CardTitle>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
                <Link2 className="mr-1 h-3 w-3" />
                Activa
              </Badge>
            </div>
            <CardDescription>
              Sentinel consulta tu cartera en modo lectura — nunca ejecuta órdenes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Usuario IOL</p>
                <p className="font-medium">{state?.connection?.iolUsername}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Cuentas registradas</p>
                <p className="font-medium">
                  {state?.accounts.map((a) => a.iolAccountNumber).join(", ") || "—"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0" />
              <span>
                Tus credenciales están cifradas con AES-256. Podés desconectar cuando quieras y se
                eliminan de inmediato.
              </span>
            </div>

            <Button variant="destructive" onClick={handleDisconnect} className="w-full sm:w-auto">
              <Link2Off className="mr-2 h-4 w-4" />
              Desconectar cuenta
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* ===== Estado: NO CONECTADO ===== */
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Ingresá tus datos de IOL
            </CardTitle>
            <CardDescription>
              Tus credenciales se validan contra IOL y se guardan cifradas (AES-256). Nunca las
              mostramos ni las enviamos a otro lado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleConnect} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="iolUsername">Usuario de IOL</Label>
                <Input
                  id="iolUsername"
                  required
                  placeholder="Tu usuario o email de IOL"
                  value={iolUsername}
                  onChange={(e) => setIolUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="iolPassword">Contraseña de IOL</Label>
                <div className="relative">
                  <Input
                    id="iolPassword"
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={iolPassword}
                    onChange={(e) => setIolPassword(e.target.value)}
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                    title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="iolAccountNumber">Número de cuenta comitente</Label>
                <Input
                  id="iolAccountNumber"
                  required
                  placeholder="Ej: 123456"
                  value={iolAccountNumber}
                  onChange={(e) => setIolAccountNumber(e.target.value)}
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground">
                  Lo encontrás en IOL en "Estado de cuenta" — Cuenta comitente nro: XXXXX
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {submitting ? "Validando contra IOL..." : "Conectar cuenta"}
              </Button>
            </form>

            <div className="mt-4 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p>
                Al conectar, Sentinel valida tus credenciales contra la API oficial de IOL y guarda el
                refresh token cifrado. La aplicación funciona <strong>solo en modo lectura</strong>:
                consulta cartera, saldos, operaciones y cotizaciones. Nunca compra ni vende.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
