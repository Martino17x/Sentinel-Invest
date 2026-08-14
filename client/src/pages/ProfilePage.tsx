import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Save, KeyRound, CheckCircle2, AlertCircle, Copy, User as UserIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { profileApi, apiKeysApi, type ApiKeyScope, type ApiKeySummary, type UserProfile } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ---- API Keys ----
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

  useEffect(() => {
    profileApi
      .get()
      .then((res) => {
        setProfile(res.profile);
        setFullName(res.profile.fullName ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el perfil"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSavingName(true);
    try {
      const res = await profileApi.update(fullName.trim());
      setProfile(res.profile);
      setSuccess("Nombre actualizado correctamente");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el nombre");
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (newPassword.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }

    setSavingPassword(true);
    try {
      await profileApi.changePassword(currentPassword, newPassword);
      setSuccess("Contraseña cambiada correctamente");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
    } finally {
      setSavingPassword(false);
    }
  }

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

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertDescription>{error ?? "No se pudo cargar el perfil"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <UserIcon className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {profile.fullName ?? profile.email}
          </h1>
          <p className="text-sm text-muted-foreground">{profile.email}</p>
        </div>
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

      {/* Datos de la cuenta */}
      <Card>
        <CardHeader>
          <CardTitle>Información de la cuenta</CardTitle>
          <CardDescription>Tu email es tu identidad — no se puede cambiar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{profile.email}</p>
            </div>
            <Badge variant="secondary">
              {profile.loginMethod === "google" ? "Google" : "Email + contraseña"}
            </Badge>
          </div>

          <form onSubmit={handleSaveName} className="space-y-2">
            <Label htmlFor="fullName">Nombre</Label>
            <div className="flex gap-2">
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Tu nombre"
              />
              <Button type="submit" disabled={savingName || fullName.trim() === (profile.fullName ?? "")}>
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-2 hidden sm:inline">Guardar</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Cambiar contraseña — solo para cuentas con email+password */}
      {profile.loginMethod === "password" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Cambiar contraseña
            </CardTitle>
            <CardDescription>Usá tu contraseña actual para cambiarla</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Contraseña actual</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nueva contraseña</Label>
                <Input
                  id="newPassword"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar nueva contraseña</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" disabled={savingPassword}>
                {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cambiar contraseña
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {profile.loginMethod === "google" && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Tu cuenta usa Google como método de ingreso. No tenés contraseña que cambiar.
              {user?.fullName ?? ""}
            </p>
          </CardContent>
        </Card>
      )}

      {/* API Keys — claves personales para agentes externos (MCP) */}
      <Card>
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
            <Alert variant="destructive">
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
          </form>

          {newSecret && (
            <Alert className="border-amber-500/40 bg-amber-500/10">
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
            <ul className="space-y-2">
              {keys.map((key) => (
                <li key={key.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{key.name}</p>
                      <Badge variant={key.scope === "trade" ? "default" : "secondary"}>
                        {key.scope === "trade" ? "read + trade" : "read"}
                      </Badge>
                      <Badge
                        variant={key.enabled ? "outline" : "ghost"}
                        className={key.enabled ? "text-emerald-600" : "text-muted-foreground"}
                      >
                        {key.enabled ? "Activa" : "Revocada"}
                      </Badge>
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
    </div>
  );
}
