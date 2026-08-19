import { useState } from "react";
import { Loader2, FileCheck2, AlertTriangle, ChevronDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { movementsApi, type ImportRowPreview } from "@/lib/api";
import { FileDropzone, type SelectedFileInfo } from "./FileDropzone";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function MovementsImportDialog({ open, onOpenChange, onImported }: Props) {
  const [selectedFile, setSelectedFile] = useState<SelectedFileInfo | null>(null);
  const [text, setText] = useState("");
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ImportRowPreview[] | null>(null);
  const [summary, setSummary] = useState<{ total: number; valid: number; invalid: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSelectedFile(null);
    setText("");
    setIsManualOpen(false);
    setPreview(null);
    setSummary(null);
    setErrors([]);
    setResult(null);
    setError(null);
  }

  async function handleFileSelect(file: File) {
    try {
      const content = await file.text();
      setText(content);
      setSelectedFile({ name: file.name, size: file.size });
      setError(null);
      setPreview(null);
      setResult(null);
    } catch {
      setError("No se pudo leer el archivo seleccionado");
    }
  }

  function handleFileClear() {
    setSelectedFile(null);
    setText("");
    setPreview(null);
    setSummary(null);
    setErrors([]);
    setResult(null);
    setError(null);
  }

  function handleTextChange(val: string) {
    setText(val);
    setError(null);
    if (!val.trim()) {
      setSelectedFile(null);
    }
  }

  async function analyze() {
    if (!text.trim()) {
      setError("Arrastrá o seleccioná un archivo de IOL, o pegá su contenido");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await movementsApi.importPreview(text);
      setPreview(data.preview);
      setSummary(data.summary);
      setErrors(data.errors);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo analizar el archivo");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    const valid = preview.filter((p) => p.valid).map((p) => p.parsed);
    if (valid.length === 0) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await movementsApi.importConfirm(valid);
      setResult(res);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron importar los movimientos");
    } finally {
      setConfirming(false);
    }
  }

  const validCount = summary?.valid ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar movimientos IOL</DialogTitle>
          <DialogDescription>
            Subí el export de <strong>Movimientos Históricos</strong> de IOL (.xls HTML) o
            pegá su contenido. Revisamos y confirmás antes de guardar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FileDropzone
            selectedFile={selectedFile}
            onFileSelect={handleFileSelect}
            onFileClear={handleFileClear}
            disabled={loading || confirming}
          />

          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => setIsManualOpen((prev) => !prev)}
              className="flex w-full items-center justify-between py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
              aria-expanded={isManualOpen}
            >
              <span>…o pegá el contenido HTML manualmente</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-200 text-muted-foreground group-hover:text-foreground motion-reduce:transition-none",
                  isManualOpen && "rotate-180"
                )}
              />
            </button>

            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                isManualOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="overflow-hidden">
                <textarea
                  id="mv-paste"
                  value={text}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder="Pegá aquí el HTML del export de IOL"
                  className="h-28 w-full rounded-lg border border-input bg-transparent p-2.5 text-xs font-mono outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 transition-colors"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {summary && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">
                {summary.total} filas
              </Badge>
              <Badge variant="default" className="gap-1">
                <FileCheck2 className="h-3 w-3" /> {summary.valid} válidas
              </Badge>
              {summary.invalid > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> {summary.invalid} ignoradas
                </Badge>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}

          {preview && (
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border p-2">
              {preview.map((p) => (
                <div
                  key={p.row}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{p.parsed.tipoMov || `#${p.parsed.nroMov}`}</span>
                    <span className="ml-2 tabular-nums text-muted-foreground">
                      {p.parsed.liquidDate ?? "—"} · {p.parsed.monto.toLocaleString("es-AR")} {p.parsed.currency}
                    </span>
                  </span>
                  {p.valid ? (
                    <Badge variant="default" className="shrink-0">Válida</Badge>
                  ) : (
                    <Badge variant="destructive" className="shrink-0" title={p.errors[0]}>
                      Ignorada
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          {result && (
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Importadas {result.imported} · omitidas (ya existían) {result.skipped}
            </p>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={analyze} disabled={loading || !text.trim()}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Analizar
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={confirming || validCount === 0 || !preview}
            >
              {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
              {result ? "Importar de nuevo" : `Importar ${validCount}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
