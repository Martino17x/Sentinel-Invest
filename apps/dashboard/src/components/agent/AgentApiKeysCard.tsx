import { useEffect, useState, type FormEvent } from "react";
import {
  Loader2,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Copy,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiKeysApi, type ApiKeyScope, type ApiKeySummary } from "@/lib/api";

const SCOPE_DESCRIPTIONS: Record<ApiKeyScope, string> = {
  read: "solo lectura: cartera, cotizaciones, reportes",
  trade: "read + trade: además puede operar en el futuro",
};

export function AgentApiKeysCard() {
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null);
  const [keyName, setKeyName] = useState("");
  const [keyScope, setKeyScope] = useState<ApiKeyScope>("read");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keysError, setKeysError] = useState<string | null>(null);

  async function loadKeys() {
    try {
      const res = await apiKeysApi.list();
      setKeys(res.keys);
    } catch (err) {
      setKeysError(err instanceof Error ? err.message : "No se pudieron cargar las keys");
    }
  }

  useEffect(() => {
    void loadKeys();
  }, []);

  async function handleCreateKey(e: FormEvent) {
    e.preventDefault();
    if (!keyName.trim()) return;
    setKeysError(null);
    setCopied(false);
    setCreatingKey(true);
    try {
      const res = await apiKeysApi.create({ name: keyName.trim(), scope: keyScope });
      setNewSecret(res.key.secret);
      setKeyName("");
      await loadKeys();
    } catch (err) {
      setKeysError(err instanceof Error ? err.message : "No se pudo crear la key");
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleCopySecret() {
    if (!newSecret) return;
    try {
      await navigator.clipboard.writeText(newSecret);
      setCopied(true);
    } catch {
      /* clipboard no disponible — el usuario puede copiarla a mano */
    }
  }

  async function handleRevokeKey(id: string) {
    setKeysError(null);
    try {
      await apiKeysApi.revoke(id);
      await loadKeys();
    } catch (err) {
      setKeysError(err instanceof Error ? err.message : "No se pudo revocar la key");
    }
  }

  async function handleEnableKey(id: string) {
    setKeysError(null);
    try {
      await apiKeysApi.enable(id);
      await loadKeys();
    } catch (err) {
      setKeysError(err instanceof Error ? err.message : "No se pudo reactivar la key");
    }
  }

  function formatKeyDate(value: string | null): string {
    if (!value) return "nunca";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "nunca";
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  }

  return (
    <Card
      className="animate-in fade-in-0 duration-300 motion-reduce:animate-none"
      style={{ animationDelay: "360ms" }}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          API Keys
        </CardTitle>
        <CardDescription>
          Claves para conectar agentes externos (MCP) a tu cuenta. El secreto completo se
          muestra una sola vez al crearla.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {keysError && (
          <Alert variant="destructive" className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{keysError}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleCreateKey} className="space-y-2">
          <Label htmlFor="keyName">Nueva key</Label>
          <div className="flex gap-2">
            <Input
              id="keyName"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Nombre (ej: opencode)"
              maxLength={50}
            />
            <Select
              value={keyScope}
              onValueChange={(v) => setKeyScope(v as ApiKeyScope)}
            >
              <SelectTrigger className="w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">Solo lectura</SelectItem>
                <SelectItem value="trade">Read + trade</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={creatingKey || !keyName.trim()}>
              {creatingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">Crear</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">read</span>: {SCOPE_DESCRIPTIONS.read} ·{" "}
            <span className="font-medium">trade</span>: {SCOPE_DESCRIPTIONS.trade}
          </p>
        </form>

        {newSecret && (
          <Alert
            className="animate-in fade-in-0 slide-in-from-top-1 duration-300 motion-reduce:animate-none border-amber-500/40 bg-amber-500/10"
          >
            <AlertTitle className="text-amber-700">Copiá tu key — se muestra una sola vez</AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <code className="block overflow-x-auto rounded-md bg-background px-2 py-1.5 text-xs text-foreground">
                {newSecret}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopySecret}
              >
                {copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5">{copied ? "Copiada" : "Copiar"}</span>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {keys === null ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no tenés keys. Creá una para conectar un agente externo.
          </p>
        ) : (
          <ul className="animate-in fade-in-0 duration-300 motion-reduce:animate-none space-y-2">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{key.name}</p>
                    <span className="text-xs font-medium text-muted-foreground">
                      {key.scope === "trade" ? "read + trade" : "read"}
                    </span>
                    <span
                      className={`text-xs font-medium ${key.enabled ? "text-emerald-600" : "text-muted-foreground"}`}
                    >
                      · {key.enabled ? "Activa" : "Revocada"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {key.prefix}… · creada {formatKeyDate(key.createdAt)} · última vez {formatKeyDate(key.lastUsedAt)}
                  </p>
                </div>
                {key.enabled ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleRevokeKey(key.id)}
                  >
                    Revocar
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleEnableKey(key.id)}
                  >
                    Reactivar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
