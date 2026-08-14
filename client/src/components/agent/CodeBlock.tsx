import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  label?: string;
}

export function CodeBlock({ code, label }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard no disponible — el usuario puede copiarla a mano */
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-muted/50">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/70 px-3 py-2">
        <span className="truncate font-mono text-xs text-muted-foreground">
          {label ?? "config"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={() => void handleCopy()}
        >
          {copied ? (
            <Check
              key="copied"
              className="h-3.5 w-3.5 animate-in fade-in-0 duration-150 motion-reduce:animate-none text-emerald-600"
            />
          ) : (
            <Copy key="copy" className="h-3.5 w-3.5" />
          )}
          <span
            key={copied ? "copied-label" : "copy-label"}
            className={cn(
              "ml-1.5 animate-in fade-in-0 duration-150 motion-reduce:animate-none",
              copied && "text-emerald-600"
            )}
          >
            {copied ? "Copiado" : "Copiar"}
          </span>
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}
