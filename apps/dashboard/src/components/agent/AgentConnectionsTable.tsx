import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  KeyRound,
  Loader2,
  Plug2,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { ConnectionDetailDrawer } from "@/components/agent/ConnectionDetailDrawer";
import {
  apiKeysApi,
  type ApiKeyCategory,
  type ApiKeyScope,
  type ApiKeySummary,
  API_KEY_CATEGORIES,
} from "@/features/agente/api";

const CATEGORY_LABELS: Record<ApiKeyCategory, { label: string; desc: string }> = {
  cartera: { label: "Cartera", desc: "Posiciones, efectivo y rendimiento" },
  mercado: { label: "Mercado", desc: "Cotizaciones y panel" },
  bonos: { label: "Bonos", desc: "Curva, TIR y flujo" },
  conocimiento: { label: "Conocimiento", desc: "Base de conocimiento argentino" },
  trading: { label: "Trading", desc: "Operar (requiere scope trade)" },
};

function formatLastUsed(value: string | null): string {
  if (!value) return "Nunca";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Nunca";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return `Hoy ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

// ────────────────────────────────────────────────────────────────
// Capacidades badges
// ────────────────────────────────────────────────────────────────
function CapacidadesCell({ enabledCategories }: { enabledCategories: ApiKeyCategory[] | null }) {
  const enabled = enabledCategories ?? API_KEY_CATEGORIES;
  // si todas habilitadas, mostramos 5 chips compactos
  return (
    <div className="flex max-w-[200px] flex-wrap gap-1">
      {API_KEY_CATEGORIES.map((cat) => {
        const isOn = enabled.includes(cat);
        return (
          <span
            key={cat}
            className={
              isOn
                ? "inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-primary ring-1 ring-primary/20"
                : "inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            }
            title={CATEGORY_LABELS[cat].desc}
          >
            {CATEGORY_LABELS[cat].label}
          </span>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Create dialog — 2 pasos
// ────────────────────────────────────────────────────────────────
function CreateConnectionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiKeyScope>("read");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<(ApiKeySummary & { secret: string }) | null>(null);
  const [copied, setCopied] = useState(false);
  const [capabilities, setCapabilities] = useState<ApiKeyCategory[]>([...API_KEY_CATEGORIES]);
  const [savingCaps, setSavingCaps] = useState(false);

  function reset() {
    setStep(1);
    setName("");
    setScope("read");
    setCreating(false);
    setError(null);
    setCreatedKey(null);
    setCopied(false);
    setCapabilities([...API_KEY_CATEGORIES]);
    setSavingCaps(false);
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const res = await apiKeysApi.create({
        name: name.trim(),
        scope,
        enabledCategories: [...API_KEY_CATEGORIES],
      });
      setCreatedKey(res.key);
      setCapabilities((res.key.enabledCategories as ApiKeyCategory[] | null) ?? [...API_KEY_CATEGORIES]);
      setStep(2);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la conexión");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!createdKey?.secret) return;
    try {
      await navigator.clipboard.writeText(createdKey.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback manual */
    }
  }

  async function toggleCapability(cat: ApiKeyCategory, next: boolean) {
    if (!createdKey) return;
    const nextCaps = next ? [...capabilities, cat] : capabilities.filter((c) => c !== cat);
    // deduplicate + preserve order of API_KEY_CATEGORIES
    const ordered = API_KEY_CATEGORIES.filter((c) => nextCaps.includes(c));
    // if all enabled, send null to represent "todas" — pero mantenemos array explícito para claridad
    const payload = ordered.length === API_KEY_CATEGORIES.length ? null : ordered;
    setSavingCaps(true);
    try {
      const res = await apiKeysApi.updateCapabilities(createdKey.id, payload);
      setCapabilities((res.key.enabledCategories as ApiKeyCategory[] | null) ?? [...API_KEY_CATEGORIES]);
      setCreatedKey((prev) => (prev ? { ...prev, enabledCategories: res.key.enabledCategories as ApiKeyCategory[] | null } : prev));
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar capacidades");
    } finally {
      setSavingCaps(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            {step === 1 ? "Nueva conexión" : "Conexión creada"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Dale un nombre a tu agente y elegí el alcance. La key se genera al instante."
              : "Guardá tu key — se muestra una sola vez. Ajustá las capacidades que necesita tu agente."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-5">
            {error && (
              <Alert variant="destructive" className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="conn-name">Nombre</Label>
              <Input
                id="conn-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: claude-code, mi-bot, opencode"
                maxLength={50}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Identifica la conexión en la tabla (máx 50 caracteres).</p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Alcance</legend>
              <div className="grid gap-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${scope === "read" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value="read"
                    checked={scope === "read"}
                    onChange={() => setScope("read")}
                    className="mt-1 accent-primary"
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">Solo lectura</span>
                    <span className="block text-xs text-muted-foreground">Lee cartera, cotizaciones, reportes y bonos. Recomendado.</span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${scope === "trade" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted/50"}`}
                >
                  <input
                    type="radio"
                    name="scope"
                    value="trade"
                    checked={scope === "trade"}
                    onChange={() => setScope("trade")}
                    className="mt-1 accent-primary"
                  />
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium">Lectura + operar</span>
                    <span className="block text-xs text-muted-foreground">Además puede operar (órdenes, FCI, cancelar). Requiere IOL_TRADING_ENABLED.</span>
                  </span>
                </label>
              </div>
            </fieldset>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void handleCreate()} disabled={creating || !name.trim()}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? "Creando…" : "Crear conexión"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in-0 duration-200 motion-reduce:animate-none space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Alert className="border-amber-500/30 bg-amber-500/10">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-700">Copiá tu key — se muestra una sola vez</AlertTitle>
              <AlertDescription className="mt-2 space-y-2">
                <code className="block break-all rounded-md bg-background px-2 py-2 text-xs font-mono ring-1 ring-border">
                  {createdKey?.secret}
                </code>
                <Button type="button" size="sm" variant="outline" onClick={() => void handleCopy()}>
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span className="ml-1.5">{copied ? "Copiada" : "Copiar"}</span>
                </Button>
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Capacidades</p>
                <p className="text-xs text-muted-foreground">Activa solo lo que tu agente necesita. Podés cambiarlo después desde &quot;Ver&quot;.</p>
              </div>
              <div className="divide-y rounded-lg border">
                {API_KEY_CATEGORIES.map((cat) => {
                  const isOn = capabilities.includes(cat);
                  return (
                    <div key={cat} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{CATEGORY_LABELS[cat].label}</p>
                        <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[cat].desc}</p>
                      </div>
                      <Switch
                        checked={isOn}
                        onCheckedChange={(v) => void toggleCapability(cat, v)}
                        aria-label={CATEGORY_LABELS[cat].label}
                        // trading deshabilitado visual si scope read? lo dejamos activo igual — backend filtra
                      />
                    </div>
                  );
                })}
              </div>
              {savingCaps && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Guardando…</p>}
            </div>

            <div className="flex justify-end gap-2">
              <Button onClick={() => handleOpenChange(false)}>Listo</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ────────────────────────────────────────────────────────────────
// Tabla principal
// ────────────────────────────────────────────────────────────────
export function AgentConnectionsTable() {
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailKey, setDetailKey] = useState<ApiKeySummary | null>(null);

  async function load() {
    try {
      setError(null);
      const res = await apiKeysApi.list();
      setKeys(res.keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las conexiones");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleRevoke(id: string) {
    setLoadingAction(id);
    setError(null);
    try {
      await apiKeysApi.revoke(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleEnable(id: string) {
    setLoadingAction(id);
    setError(null);
    try {
      await apiKeysApi.enable(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reactivar");
    } finally {
      setLoadingAction(null);
    }
  }

  const isLoading = keys === null;

  return (
    <>
      <Card className="animate-in fade-in-0 duration-300 motion-reduce:animate-none">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Plug2 className="h-5 w-5 text-primary" />
              Tus conexiones
            </CardTitle>
            <CardDescription>Gestioná las keys que usan tus agentes para conectarse vía MCP.</CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4" />
            Nueva conexión
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <Alert variant="destructive" className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <div className="animate-in fade-in-0 duration-300 motion-reduce:animate-none flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/30 px-6 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-background ring-1 ring-border">
                <KeyRound className="h-7 w-7 text-muted-foreground" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium">Aún no tenés conexiones</p>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                  Creá tu primera conexión para que tu agente (Claude Code, Cursor, opencode o Codex) pueda leer tu
                  cartera y cotizaciones vía MCP.
                </p>
              </div>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Nueva conexión
              </Button>
            </div>
          ) : (
            <div className="animate-in fade-in-0 duration-300 motion-reduce:animate-none overflow-hidden rounded-lg border">
              {/* Mobile: cards */}
              <ul className="divide-y md:hidden">
                {keys.map((k) => (
                  <li key={k.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{k.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{k.prefix}…</p>
                      </div>
                      <Badge variant={k.enabled ? "default" : "secondary"} className={k.enabled ? "bg-emerald-600 text-white" : ""}>
                        {k.enabled ? "Activa" : "Revocada"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <Badge variant="outline" className="font-normal">
                        {k.scope === "trade" ? "Lectura + operar" : "Solo lectura"}
                      </Badge>
                      <span className="text-muted-foreground">· {formatLastUsed(k.lastUsedAt)}</span>
                    </div>
                    <CapacidadesCell enabledCategories={k.enabledCategories as ApiKeyCategory[] | null} />
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setDetailKey(k)}>
                        <Eye className="h-3.5 w-3.5" />
                        Ver
                      </Button>
                      {k.enabled ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1"
                          disabled={loadingAction === k.id}
                          onClick={() => void handleRevoke(k.id)}
                        >
                          {loadingAction === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Revocar
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="flex-1" disabled={loadingAction === k.id} onClick={() => void handleEnable(k.id)}>
                          {loadingAction === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Reactivar
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop: tabla */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Nombre</TableHead>
                      <TableHead>Alcance</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Último uso</TableHead>
                      <TableHead>Capacidades</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map((k) => (
                      <TableRow key={k.id} className="group">
                        <TableCell>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{k.name}</p>
                            <p className="font-mono text-xs text-muted-foreground">{k.prefix}…</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {k.scope === "trade" ? "Lectura + operar" : "Solo lectura"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={k.enabled ? "default" : "secondary"} className={k.enabled ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}>
                            {k.enabled ? "Activa" : "Revocada"}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatLastUsed(k.lastUsedAt)}</TableCell>
                        <TableCell>
                          <CapacidadesCell enabledCategories={k.enabledCategories as ApiKeyCategory[] | null} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button variant="ghost" size="sm" onClick={() => setDetailKey(k)}>
                              <Eye className="h-3.5 w-3.5" />
                              Ver
                            </Button>
                            {k.enabled ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                disabled={loadingAction === k.id}
                                onClick={() => void handleRevoke(k.id)}
                              >
                                {loadingAction === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                Revocar
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" disabled={loadingAction === k.id} onClick={() => void handleEnable(k.id)}>
                                {loadingAction === k.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                Reactivar
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateConnectionDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void load()} />
      <ConnectionDetailDrawer
        keyData={detailKey}
        open={!!detailKey}
        onOpenChange={(v) => !v && setDetailKey(null)}
        onUpdated={() => void load()}
      />
    </>
  );
}
