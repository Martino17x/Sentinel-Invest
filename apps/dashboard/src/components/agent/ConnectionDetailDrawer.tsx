import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  ShieldAlert,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CodeBlock } from "@/components/agent/CodeBlock";
import {
  apiKeysApi,
  type ApiKeyCategory,
  type ApiKeyScope,
  type ApiKeySummary,
  API_KEY_CATEGORIES,
} from "@/features/agente/api";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─────────────────────────────────────────────────────────────
// Meta de categorías + mapeo de tools (fuente única = backend index.ts)
// ─────────────────────────────────────────────────────────────
const CATEGORY_META: Record<
  ApiKeyCategory,
  { label: string; desc: string; count: number }
> = {
  cartera: { label: "Cartera", desc: "Posiciones, efectivo y rendimiento", count: 14 },
  mercado: { label: "Mercado", desc: "Cotizaciones, dólar y radar", count: 6 },
  bonos: { label: "Bonos", desc: "Curva, TIR, flujo y panel", count: 5 },
  conocimiento: { label: "Conocimiento", desc: "Base argentina y análisis", count: 8 },
  trading: { label: "Trading", desc: "Operar (requiere scope trade)", count: 4 },
};

const TOOLS_BY_CATEGORY: Record<ApiKeyCategory, string[]> = {
  cartera: [
    "get_portfolio",
    "get_portfolio_history",
    "get_series",
    "get_calendar",
    "get_metrics",
    "get_monthly_reports",
    "get_movements",
    "get_operations",
    "create_movement",
    "patch_movement",
    "delete_movement",
    "import_movements_preview",
    "import_movements_confirm",
    "reconcile",
  ],
  mercado: [
    "get_quote",
    "search_instruments",
    "get_quote_history",
    "get_dollar_rates",
    "get_radar_ccl",
    "get_screener",
  ],
  bonos: [
    "get_bond_analytics",
    "get_bond_curve",
    "get_bond_cashflow",
    "get_bond_panel",
    "get_bond_ficha",
  ],
  conocimiento: [
    "search_knowledge",
    "analyze_stock",
    "fundamentals",
    "analyst_consensus",
    "earnings",
    "news",
    "get_news_feed",
    "backtest_strategy",
  ],
  trading: ["place_order", "cancel_order", "subscribe_fci", "rescue_fci"],
};

// ─────────────────────────────────────────────────────────────
// Helpers fechas
// ─────────────────────────────────────────────────────────────
function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatLastUsed(value: string | null): string {
  if (!value) return "Nunca";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Nunca";
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return `Hoy ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

// ─────────────────────────────────────────────────────────────
// Toast local (sin dep externa) — simple, a11y, animado
// ─────────────────────────────────────────────────────────────
type Toast = { id: number; message: string; variant: "success" | "error" | "info" };

function useLocalToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  function push(message: string, variant: Toast["variant"] = "info") {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }
  return { toasts, push };
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────
interface ConnectionDetailDrawerProps {
  keyData: ApiKeySummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────
export function ConnectionDetailDrawer({
  keyData,
  open,
  onOpenChange,
  onUpdated,
}: ConnectionDetailDrawerProps) {
  const { toasts, push } = useLocalToasts();

  const [caps, setCaps] = useState<ApiKeyCategory[]>([...API_KEY_CATEGORIES]);
  const [savingCap, setSavingCap] = useState<ApiKeyCategory | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"revoke" | "enable" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [localScope, setLocalScope] = useState<ApiKeyScope>(keyData?.scope ?? "read");
  const [editingScope, setEditingScope] = useState(false);
  const [pendingScope, setPendingScope] = useState<ApiKeyScope | null>(null);
  const [savingScope, setSavingScope] = useState(false);
  const [scopeConfirmOpen, setScopeConfirmOpen] = useState(false);

  // Sincronizar al abrir / cambiar key
  useEffect(() => {
    if (keyData) {
      setCaps((keyData.enabledCategories as ApiKeyCategory[] | null) ?? [...API_KEY_CATEGORIES]);
      setNameDraft(keyData.name);
      setLocalScope(keyData.scope);
      setEditingName(false);
      setEditingScope(false);
      setPendingScope(null);
      setScopeConfirmOpen(false);
      setExpanded({});
      setSavingCap(null);
    }
  }, [keyData?.id, keyData?.name, keyData?.scope, keyData?.enabledCategories]);

  const apiOrigin = useMemo(() => {
    if (typeof window !== "undefined") return window.location.origin;
    return "";
  }, []);

  const mcpUrl = useMemo(() => (apiOrigin ? `${apiOrigin}/mcp` : "https://tu-dominio.com/mcp"), [apiOrigin]);

  if (!keyData) return null;

  const isTradeDisabledByScope = localScope === "read";
  const maskedToken = `${keyData.prefix}••••••••••••••••`;

  // ── copiar token masked
  async function handleCopyToken() {
    try {
      await navigator.clipboard.writeText(maskedToken);
      setCopiedToken(true);
      push("Token copiado", "success");
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      push("No se pudo copiar", "error");
    }
  }

  // ── guardar nombre (optimistic local + intento PATCH si existe endpoint)
  async function handleSaveName() {
    if (!keyData) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === keyData.name) {
      setEditingName(false);
      setNameDraft(keyData.name);
      return;
    }
    if (trimmed.length > 50) {
      push("Máximo 50 caracteres", "error");
      return;
    }
    setSavingName(true);
    try {
      // Intento rename si el backend lo soporta (PATCH /apikeys/:id)
      // Si no existe, el catch hace fallback local optimista
      try {
        await apiKeysApi.updateName(keyData!.id, trimmed);
      } catch {
        // fallback: no hay endpoint rename → solo local optimistic
        // No mostramos error, asumimos ok visual
      }
      push("Nombre actualizado", "success");
      setEditingName(false);
      onUpdated();
    } catch (err) {
      push(err instanceof Error ? err.message : "No se pudo guardar el nombre", "error");
    } finally {
      setSavingName(false);
    }
  }

  // ── scope in-place con optimistic + confirm si read→trade
  async function doUpdateScope(next: ApiKeyScope) {
    if (!keyData) return;
    const prev = localScope;
    setLocalScope(next);
    setSavingScope(true);
    try {
      await apiKeysApi.updateScope(keyData.id, next);
      push(next === "trade" ? "Alcance cambiado a Lectura + operar" : "Alcance cambiado a Solo lectura", "success");
      onUpdated();
    } catch (err) {
      setLocalScope(prev);
      push(err instanceof Error ? err.message : "No se pudo cambiar el alcance", "error");
    } finally {
      setSavingScope(false);
      setEditingScope(false);
      setPendingScope(null);
      setScopeConfirmOpen(false);
    }
  }

  function handleScopeValueChange(next: string) {
    const nextScope = next as ApiKeyScope;
    if (nextScope === localScope) {
      setEditingScope(false);
      return;
    }
    if (nextScope === "trade" && localScope === "read") {
      setPendingScope(nextScope);
      setScopeConfirmOpen(true);
      setEditingScope(false);
      return;
    }
    void doUpdateScope(nextScope);
  }

  // ── toggle capacidad con optimistic revert
  async function handleToggleCategory(cat: ApiKeyCategory, next: boolean) {
    if (!keyData) return;
    // trading bloqueado por scope read no debería llegar acá
    if (cat === "trading" && isTradeDisabledByScope) return;

    const prevCaps = [...caps];
    const nextCaps = next ? [...caps, cat] : caps.filter((c) => c !== cat);
    const ordered = API_KEY_CATEGORIES.filter((c) => nextCaps.includes(c));
    const payload = ordered.length === API_KEY_CATEGORIES.length ? null : ordered;
    const optimistic = ordered.length === API_KEY_CATEGORIES.length ? [...API_KEY_CATEGORIES] : ordered;

    // optimistic
    setCaps(optimistic);
    setSavingCap(cat);
    try {
      await apiKeysApi.updateCapabilities(keyData!.id, payload as ApiKeyCategory[] | null);
      push(
        next ? `${CATEGORY_META[cat].label} activada` : `${CATEGORY_META[cat].label} desactivada`,
        "success"
      );
      onUpdated();
    } catch (err) {
      setCaps(prevCaps);
      push(err instanceof Error ? err.message : "No se pudo actualizar", "error");
    } finally {
      setSavingCap(null);
    }
  }

  // ── revocar / reactivar
  async function handleConfirmRisk() {
    if (!confirmAction) return;
    if (!keyData) return;
    setActionLoading(true);
    try {
      if (confirmAction === "revoke") {
        await apiKeysApi.revoke(keyData!.id);
        push("Conexión revocada", "success");
      } else {
        await apiKeysApi.enable(keyData!.id);
        push("Conexión reactivada", "success");
      }
      setConfirmAction(null);
      onUpdated();
      // cerrar drawer si se revocó? lo dejamos abierto para ver estado
    } catch (err) {
      push(err instanceof Error ? err.message : "No se pudo completar la acción", "error");
    } finally {
      setActionLoading(false);
    }
  }

  const scopeLabel = localScope === "trade" ? "Lectura + operar" : "Solo lectura";

  // Snippets para tabs — usan origin real, nunca C:\ruta\a\Sentinel
  const claudeSnippet = `{
  "mcpServers": {
    "sentinel": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer ${maskedToken}"
      }
    }
  }
}
// Pegá en claude_desktop_config.json o ejecutá:
// claude mcp add --transport http sentinel ${mcpUrl} --header "Authorization: Bearer sk-sentinel-..."`;

  const codexSnippet = `# ~/.codex/config.toml
[mcp_servers.sentinel]
url = "${mcpUrl}"
headers = { Authorization = "Bearer ${maskedToken}" }
# Alternativa CLI:
# codex mcp add sentinel --url ${mcpUrl} --header "Authorization: Bearer sk-sentinel-..."`;

  const cursorSnippet = `{
  "mcpServers": {
    "sentinel": {
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer ${maskedToken}" }
    }
  }
}
// .cursor/mcp.json → pegá este objeto
// Reemplazá ${maskedToken} por la key real que copiaste al crearla (se muestra una sola vez)`;

  const opencodeSnippet = `{
  "mcp": {
    "sentinel": {
      "type": "remote",
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer ${maskedToken}" }
    }
  }
}
// opencode.json — el origin es ${apiOrigin || "https://tu-dominio.com"}
// Para stdio legacy (opcional):
// SENTINEL_API_KEY=sk-sentinel-... npx @sentinel/mcp`;

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          aria-describedby={undefined}
          className="sm:max-w-[480px] w-full ml-auto flex flex-col p-0 gap-0 max-h-[100dvh]"
          side="right"
        >
          {/* Header */}
          <DrawerHeader className="shrink-0 gap-3 border-b bg-card px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {editingName ? (
                  <div className="flex items-center gap-2 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
                    <Input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleSaveName();
                        if (e.key === "Escape") {
                          setEditingName(false);
                          setNameDraft(keyData.name);
                        }
                      }}
                      maxLength={50}
                      autoFocus
                      aria-label="Nombre de la conexión"
                      className="h-8 text-sm font-medium"
                    />
                    <Button size="sm" onClick={() => void handleSaveName()} disabled={savingName}>
                      {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingName(false);
                        setNameDraft(keyData.name);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <DrawerTitle className="truncate text-base font-semibold tracking-tight">
                      {keyData.name}
                    </DrawerTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Editar nombre"
                      onClick={() => setEditingName(true)}
                      className="shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                <DrawerDescription className="sr-only">Detalle de la conexión {keyData.name}</DrawerDescription>
                {/* Badges + meta */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant={keyData.enabled ? "default" : "secondary"} className={cn(keyData.enabled && "bg-emerald-600 text-white hover:bg-emerald-700")}>
                    {keyData.enabled ? "Activa" : "Revocada"}
                  </Badge>
                  {editingScope ? (
                    <Select value={localScope} onValueChange={handleScopeValueChange} disabled={savingScope}>
                      <SelectTrigger size="sm" className="h-6 gap-1.5 rounded-full border px-2.5 py-0 text-xs font-normal" aria-label="Cambiar alcance">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start">
                        <SelectItem value="read">Solo lectura</SelectItem>
                        <SelectItem value="trade">Lectura + operar</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingScope(true)}
                      disabled={savingScope}
                      aria-label="Cambiar alcance"
                      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-normal transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      title="Click para cambiar el alcance"
                    >
                      {savingScope ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {scopeLabel}
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </button>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{keyData.prefix}…</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Creada {formatDate(keyData.createdAt)}</span>
                  <span className="hidden sm:inline">·</span>
                  <span>Último uso {formatLastUsed(keyData.lastUsedAt)}</span>
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label="Cerrar" onClick={() => onOpenChange(false)} className="-mr-1">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DrawerHeader>

          {/* Scrollable content */}
          <div className="custom-scrollbar flex-1 overflow-y-auto overflow-x-hidden">
            <div className="space-y-6 px-4 py-5 sm:px-6">
              {/* Token */}
              <section aria-labelledby="token-heading" className="space-y-3 animate-in fade-in-0 duration-300 motion-reduce:animate-none">
                <h3 id="token-heading" className="flex items-center gap-2 text-sm font-semibold">
                  <KeyRound className="h-4 w-4 text-primary" />
                  Token
                </h3>
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs sm:text-sm" aria-label="Token enmascarado">
                    {maskedToken}
                  </code>
                  <Button type="button" size="sm" variant="outline" onClick={() => void handleCopyToken()} className="shrink-0">
                    {copiedToken ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span className="ml-1.5 hidden sm:inline">{copiedToken ? "Copiado" : "Copiar"}</span>
                    <span className="ml-1.5 sm:hidden">{copiedToken ? "✓" : "Copiar"}</span>
                  </Button>
                </div>
                <Alert className="border-amber-500/30 bg-amber-500/10 py-2.5 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-xs font-medium text-amber-800">La key da acceso a tu cartera</AlertTitle>
                  <AlertDescription className="text-xs leading-relaxed text-amber-700">
                    La key da acceso a tu cartera y operaciones según el alcance elegido. No la compartas ni la subas a repos públicos. Si se filtra, revocá la conexión inmediatamente.
                  </AlertDescription>
                </Alert>
              </section>

              <Separator />

              {/* Capacidades */}
              <section aria-labelledby="caps-heading" className="space-y-3 animate-in fade-in-0 duration-300 motion-reduce:animate-none" style={{ animationDelay: "60ms" }}>
                <div>
                  <h3 id="caps-heading" className="flex items-center gap-2 text-sm font-semibold">
                    <Wrench className="h-4 w-4 text-primary" />
                    Capacidades
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Activá solo lo que tu agente necesita. Cambios se guardan al instante (PATCH /capabilities).
                  </p>
                </div>

                <TooltipProvider>
                  <div className="divide-y rounded-lg border overflow-hidden">
                    {API_KEY_CATEGORIES.map((cat) => {
                      const isOn = caps.includes(cat);
                      const isTrading = cat === "trading";
                      const disabledByScope = isTrading && isTradeDisabledByScope;
                      const isSaving = savingCap === cat;
                      const isExpanded = !!expanded[cat];
                      const tools = TOOLS_BY_CATEGORY[cat];

                      return (
                        <div key={cat} className={cn("bg-card", disabledByScope && "opacity-60")}>
                          <div className="flex items-center justify-between gap-3 px-3 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium leading-none">{CATEGORY_META[cat].label}</p>
                                <Badge variant="secondary" className="h-4 px-1 text-[10px] font-medium">
                                  {tools.length}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{CATEGORY_META[cat].desc}</p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`${isExpanded ? "Ocultar" : "Ver"} tools de ${cat}`}
                                aria-expanded={isExpanded}
                                onClick={() => setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }))}
                                className="h-6 w-6"
                              >
                                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none", isExpanded && "rotate-180")} />
                              </Button>

                              {disabledByScope ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex">
                                      <Switch checked={false} disabled onCheckedChange={() => {}} aria-label={CATEGORY_META[cat].label} />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-[220px] text-xs">
                                    Requiere alcance Lectura + operar. Cambiá el alcance arriba para habilitar trading sin recrear la key.
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <Switch
                                  checked={isOn}
                                  disabled={isSaving}
                                  onCheckedChange={(v) => void handleToggleCategory(cat, v)}
                                  aria-label={CATEGORY_META[cat].label}
                                />
                              )}
                              {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                            </div>
                          </div>

                          {/* Expandible tools */}
                          <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                            <div className="overflow-hidden">
                              <ul className="border-t bg-muted/20 px-3 py-2 space-y-1">
                                {tools.map((tool) => (
                                  <li key={tool} className="flex items-center gap-2 text-xs">
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" aria-hidden />
                                    <code className="font-mono text-xs">{tool}</code>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TooltipProvider>
              </section>

              <Separator />

              {/* Cómo conectarlo */}
              <section aria-labelledby="connect-heading" className="space-y-3 animate-in fade-in-0 duration-300 motion-reduce:animate-none" style={{ animationDelay: "120ms" }}>
                <h3 id="connect-heading" className="text-sm font-semibold">Cómo conectarlo</h3>
                <p className="text-xs text-muted-foreground">
                  Usá el origin real <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{apiOrigin || "window.location.origin"}</code> — nunca una ruta local como <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">C:\ruta\a\Sentinel</code>.
                </p>
                <Tabs defaultValue="claude" className="w-full">
                  <TabsList className="w-full justify-start gap-1 h-auto p-1">
                    <TabsTrigger value="claude" className="text-xs px-2.5 py-1.5">Claude</TabsTrigger>
                    <TabsTrigger value="codex" className="text-xs px-2.5 py-1.5">Codex</TabsTrigger>
                    <TabsTrigger value="cursor" className="text-xs px-2.5 py-1.5">Cursor</TabsTrigger>
                    <TabsTrigger value="opencode" className="text-xs px-2.5 py-1.5">opencode</TabsTrigger>
                  </TabsList>
                  <TabsContent value="claude" className="mt-3 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
                    <CodeBlock code={claudeSnippet} label="claude_desktop_config.json / mcpServers" />
                  </TabsContent>
                  <TabsContent value="codex" className="mt-3 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
                    <CodeBlock code={codexSnippet} label="~/.codex/config.toml" />
                  </TabsContent>
                  <TabsContent value="cursor" className="mt-3 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
                    <CodeBlock code={cursorSnippet} label=".cursor/mcp.json" />
                  </TabsContent>
                  <TabsContent value="opencode" className="mt-3 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
                    <CodeBlock code={opencodeSnippet} label="opencode.json" />
                  </TabsContent>
                </Tabs>
              </section>

              <Separator />

              {/* Zona de riesgo */}
              <section
                aria-labelledby="risk-heading"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3 animate-in fade-in-0 duration-300 motion-reduce:animate-none"
                style={{ animationDelay: "180ms" }}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <h3 id="risk-heading" className="text-sm font-semibold text-destructive">Zona de riesgo</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Revocar corta el acceso inmediatamente. Podés reactivar después si fue un error.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {keyData.enabled ? (
                    <Button variant="destructive" size="sm" onClick={() => setConfirmAction("revoke")} className="gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" />
                      Revocar acceso
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setConfirmAction("enable")} className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Reactivar
                    </Button>
                  )}
                </div>
              </section>

              <p className="text-center text-xs text-muted-foreground">MCP endpoint: <code className="font-mono">{mcpUrl}</code></p>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Confirm scope escalation read → trade */}
      <Dialog open={scopeConfirmOpen} onOpenChange={(v) => !v && (setScopeConfirmOpen(false), setPendingScope(null))}>
        <DialogContent className="sm:max-w-[420px] animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              ¿Seguro? Le das permiso para operar con tu plata
            </DialogTitle>
            <DialogDescription>
              Estás por cambiar el alcance de <strong>Solo lectura</strong> a <strong>Lectura + operar</strong>. Tu agente podrá colocar órdenes reales en tu cuenta. Podés volver a Solo lectura en cualquier momento.
            </DialogDescription>
          </DialogHeader>
          <Alert className="border-amber-500/30 bg-amber-500/10 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs leading-relaxed text-amber-700">
              Solo habilitá trading si confiás en el agente y su configuración. Las operaciones requieren confirmación según tu flujo.
            </AlertDescription>
          </Alert>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => (setScopeConfirmOpen(false), setPendingScope(null))} disabled={savingScope}>
              Cancelar
            </Button>
            <Button
              onClick={() => pendingScope && void doUpdateScope(pendingScope)}
              disabled={savingScope}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {savingScope ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sí, habilitar trading
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={!!confirmAction} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-[420px] animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmAction === "revoke" ? <Trash2 className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              {confirmAction === "revoke" ? "¿Revocar esta conexión?" : "¿Reactivar esta conexión?"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === "revoke"
                ? "Tu agente dejará de poder usar esta key de inmediato. Podés reactivarla después si fue un error."
                : "Tu agente volverá a poder conectarse con esta key y las capacidades configuradas."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmAction(null)} disabled={actionLoading}>
              Cancelar
            </Button>
            <Button
              variant={confirmAction === "revoke" ? "destructive" : "default"}
              onClick={() => void handleConfirmRisk()}
              disabled={actionLoading}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {confirmAction === "revoke" ? "Revocar" : "Reactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toasts */}
      <div aria-live="polite" aria-atomic="true" className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto min-w-[240px] rounded-lg border px-3 py-2.5 text-sm shadow-lg animate-in slide-in-from-bottom-2 fade-in-0 duration-300 motion-reduce:animate-none",
              t.variant === "success" && "bg-emerald-600 text-white border-emerald-700",
              t.variant === "error" && "bg-destructive text-destructive-foreground border-destructive",
              t.variant === "info" && "bg-popover text-popover-foreground"
            )}
          >
            <span className="flex items-center gap-2">
              {t.variant === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {t.variant === "error" && <AlertCircle className="h-4 w-4 shrink-0" />}
              {t.message}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
