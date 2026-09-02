import { useState, type FormEvent } from "react";
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
import { connectionsApi, type BrokerType } from "@/features/auth/api";
import { useApiData, invalidateApiCache } from "@/hooks/useApiData";

const BROKER_LABEL: Record<BrokerType, string> = {
  iol: "IOL (InvertirOnline)",
  ppi: "PPI (Portfolio Personal)",
};

const BROKER_SHORT: Record<BrokerType, string> = {
  iol: "IOL",
  ppi: "PPI",
};

export function ConnectBrokerPage() {
  const {
    data: state,
    isLoading: loading,
    error: loadError,
    refetch: loadState,
  } = useApiData("connections:state", () => connectionsApi.getState());

  const [brokerType, setBrokerType] = useState<BrokerType>("iol");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [disconnecting, setDisconnecting] = useState<BrokerType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleConnect(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await connectionsApi.connect({
        brokerType,
        username: username.trim(),
        password,
        brokerAccountNumber: accountNumber.trim(),
        // compat legacy fields
        iolUsername: username.trim(),
        iolPassword: password,
        iolAccountNumber: accountNumber.trim(),
      } as never);
      const connectedAccounts = res.accounts.map((a) => a.brokerAccountNumber ?? a.iolAccountNumber).join(", ");
      setSuccess(
        `¡Cuenta ${BROKER_SHORT[brokerType]} ${connectedAccounts} conectada y validada! Credenciales cifradas.`
      );
      setPassword("");
      invalidateApiCache("connections");
      invalidateApiCache("portfolio");
      invalidateApiCache("operations");
      await loadState();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo conectar la cuenta";
      // 503 BrokerNotEnabled
      if (msg.toLowerCase().includes("no habilitado") || msg.includes("503")) {
        setError(`${BROKER_SHORT[brokerType]} no está habilitado en este entorno (BROKER_${brokerType.toUpperCase()}_ENABLED=false).`);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect(broker: BrokerType) {
    setError(null);
    setSuccess(null);
    setDisconnecting(broker);
    try {
      await connectionsApi.disconnect(broker);
      setSuccess(`Cuenta ${BROKER_SHORT[broker]} desconectada. Credenciales eliminadas.`);
      invalidateApiCache("connections");
      invalidateApiCache("portfolio");
      invalidateApiCache("operations");
      await loadState();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo desconectar");
    } finally {
      setDisconnecting(null);
    }
  }

  if (loading && !state) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const connections = state?.connections ?? [];
  const accounts = state?.accounts ?? [];
  const isConnected = (b: BrokerType) => connections.some((c) => c.brokerType === b && c.isActive);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conectar cuenta</h1>
        <p className="text-sm text-muted-foreground">
          Vinculá tu broker para ver tus datos reales — cada broker se conecta por separado
        </p>
      </div>

      {(error || loadError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error || loadError}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="default" className="border-emerald-500/40 bg-emerald-500/10">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertTitle className="text-emerald-700">Listo</AlertTitle>
          <AlertDescription className="text-emerald-700">{success}</AlertDescription>
        </Alert>
      )}

      {/* Cards por broker — estado separado Req 9 */}
      {connections.length > 0 && (
        <div className="grid gap-3">
          {(["iol", "ppi"] as BrokerType[]).map((b) => {
            const conn = connections.find((c) => c.brokerType === b);
            const accts = accounts.filter((a) => (a.brokerType ?? "iol") === b);
            const connected = Boolean(conn?.isActive);
            return (
              <Card key={b} className={connected ? "border-emerald-500/30" : "border-dashed"}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ShieldCheck className={`h-4 w-4 ${connected ? "text-emerald-600" : "text-muted-foreground"}`} />
                      {BROKER_LABEL[b]}
                    </CardTitle>
                    <Badge variant="outline" className={connected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : ""}>
                      {connected ? (
                        <>
                          <Link2 className="mr-1 h-3 w-3" /> Conectado
                        </>
                      ) : (
                        <>
                          <Link2Off className="mr-1 h-3 w-3" /> No conectado
                        </>
                      )}
                    </Badge>
                  </div>
                  <CardDescription>
                    {connected
                      ? `${conn?.username ?? conn?.iolUsername ?? ""} · ${accts.map((a) => a.brokerAccountNumber ?? a.iolAccountNumber).join(", ") || "sin cuentas"}`
                      : `Conectá tu cuenta ${BROKER_SHORT[b]} para operar con ese broker`}
                  </CardDescription>
                </CardHeader>
                {connected && (
                  <CardContent>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDisconnect(b)}
                      disabled={disconnecting === b}
                    >
                      {disconnecting === b && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Link2Off className="mr-2 h-4 w-4" />
                      Desconectar {BROKER_SHORT[b]}
                    </Button>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Form genérico con selector broker_type Req 9 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Conectar broker
          </CardTitle>
          <CardDescription>
            Elegí el broker, ingresá tus credenciales — se validan contra la API oficial y se guardan
            cifradas (AES-256). Nunca las mostramos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleConnect} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="brokerType">Broker</Label>
              <select
                id="brokerType"
                value={brokerType}
                onChange={(e) => setBrokerType(e.target.value as BrokerType)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="iol">{BROKER_LABEL.iol} {isConnected("iol") ? "✓" : ""}</option>
                <option value="ppi">{BROKER_LABEL.ppi} {isConnected("ppi") ? "✓" : ""}</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {brokerType === "ppi"
                  ? "PPI usa el mismo flujo de token que IOL. Si tu cuenta PPI tiene 2FA activo, la conexión fallará hasta que se valide sin 2FA interactivo."
                  : "IOL es InvertirOnline — el broker por defecto."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Usuario de {BROKER_SHORT[brokerType]}</Label>
              <Input
                id="username"
                required
                placeholder={brokerType === "ppi" ? "Tu usuario de PPI" : "Tu usuario o email de IOL"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña de {BROKER_SHORT[brokerType]}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              <Label htmlFor="accountNumber">Número de cuenta comitente ({BROKER_SHORT[brokerType]})</Label>
              <Input
                id="accountNumber"
                required
                placeholder="Ej: 123456"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                inputMode="numeric"
              />
              <p className="text-xs text-muted-foreground">
                Lo encontrás en tu broker en "Estado de cuenta" — Cuenta comitente nro: XXXXX
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? `Validando contra ${BROKER_SHORT[brokerType]}...` : `Conectar ${BROKER_SHORT[brokerType]}`}
            </Button>
          </form>

          <div className="mt-4 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <p>
              Al conectar, Sentinel valida tus credenciales contra la API oficial del broker y guarda el
              refresh token cifrado. La aplicación funciona <strong>solo en modo lectura</strong> para
              cartera: consulta posiciones, saldos, operaciones y cotizaciones. Nunca compra ni vende.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Lock className="h-4 w-4 shrink-0" />
        <span>
          Tus credenciales están cifradas con AES-256-GCM. Podés desconectar cualquier broker cuando
          quieras y se eliminan de inmediato. El estado es independiente por broker.
        </span>
      </div>
    </div>
  );
}
