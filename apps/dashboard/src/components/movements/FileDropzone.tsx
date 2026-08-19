import { useRef, useState, useCallback } from "react";
import { UploadCloud, FileSpreadsheet, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface SelectedFileInfo {
  name: string;
  size: number;
}

interface FileDropzoneProps {
  selectedFile: SelectedFileInfo | null;
  onFileSelect: (file: File) => void;
  onFileClear: () => void;
  accept?: string;
  disabled?: boolean;
  className?: string;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : "DOC";
}

export function FileDropzone({
  selectedFile,
  onFileSelect,
  onFileClear,
  accept = ".xls,.html,.htm,text/html,application/vnd.ms-excel",
  disabled = false,
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleClick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const processFile = useCallback(
    (file: File) => {
      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // Reset the input value so the same file can be chosen again if needed
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragCounterRef.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div className={cn("w-full space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {selectedFile ? (
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4 transition-all duration-200",
            "animate-in fade-in-50 zoom-in-95 motion-reduce:animate-none"
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p
                className="truncate text-sm font-medium text-foreground max-w-[240px] sm:max-w-xs md:max-w-sm"
                title={selectedFile.name}
              >
                {selectedFile.name}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                <span>{formatFileSize(selectedFile.size)}</span>
                <span>•</span>
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono uppercase tracking-wider">
                  {getFileExtension(selectedFile.name)}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClick}
              disabled={disabled}
              className="h-8 gap-1.5 text-xs font-normal"
              title="Seleccionar otro archivo"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cambiar</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onFileClear}
              disabled={disabled}
              className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              aria-label="Quitar archivo"
              title="Quitar archivo"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Arrastrá tu archivo de IOL acá o hacé clic para explorar"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all duration-200 cursor-pointer select-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            isDragging
              ? "border-primary bg-primary/5 ring-2 ring-primary/20 scale-[0.99]"
              : "border-border/80 bg-background/50 hover:border-primary/50 hover:bg-muted/30",
            disabled && "cursor-not-allowed opacity-50 pointer-events-none"
          )}
        >
          <div
            className={cn(
              "mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-all duration-200 group-hover:text-primary group-hover:scale-105",
              isDragging && "bg-primary/10 text-primary scale-110"
            )}
          >
            <UploadCloud className="h-6 w-6" />
          </div>

          <p className="text-sm font-medium text-foreground">
            {isDragging ? "Soltá tu archivo acá" : "Arrastrá tu archivo de IOL acá o hacé clic para explorar"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Formatos soportados: <span className="font-mono">.xls</span>, <span className="font-mono">.html</span> (export de Movimientos Históricos)
          </p>
        </div>
      )}
    </div>
  );
}
