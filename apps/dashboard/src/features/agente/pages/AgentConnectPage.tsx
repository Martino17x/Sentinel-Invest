import { useState } from "react";
import { ChevronDown, ExternalLink, Sparkles, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentConnectionsTable } from "@/components/agent/AgentConnectionsTable";
import { CodeBlock } from "@/components/agent/CodeBlock";

interface ToolInfo {
  name: string;
  summary: string;
  returns: string;
  when: string;
  scope: "read" | "trade";
}

const MCP_TOOLS: ToolInfo[] = [
  {
    name: "get_portfolio",
    summary: "Resumen y posiciones de tu cartera (totales, rendimiento, efectivo)",
    returns: "structuredContent { totalArs, totalUsd, positions: [...] }",
    when: "Cuando el agente necesite el estado general: efectivo, posiciones abiertas y rendimiento.",
    scope: "read",
  },
  {
    name: "get_quote",
    summary: "Cotización en tiempo real de un instrumento (precio, variación, bid/ask)",
    returns: "structuredContent { symbol, price, variationPct, bid, ask }",
    when: "Para consultar un instrumento puntual antes de tomar una decisión.",
    scope: "read",
  },
  {
    name: "search_instruments",
    summary: "Buscá instrumentos por símbolo o nombre en el mercado argentino y americano",
    returns: "structuredContent { instruments: [...] }",
    when: "Cuando no sepas el símbolo exacto o quieras explorar alternativas por nombre.",
    scope: "read",
  },
  {
    name: "get_dollar_rates",
    summary: "Cotizaciones del dólar (oficial, blue, bolsa/CCL, contado con liqui, tarjeta)",
    returns: "structuredContent { rates: { oficial, blue, mep, ccl, tarjeta } }",
    when: "Para comparar tipos de cambio o valuar inversiones en dólares.",
    scope: "read",
  },
  {
    name: "get_monthly_reports",
    summary: "Rendimiento mensual de tu cartera (TWR, benchmark Merval, movimientos)",
    returns: "structuredContent { twrPct, benchmarkPct, movements: [...] }",
    when: "Para analizar el rendimiento histórico mes a mes y contra el Merval.",
    scope: "read",
  },
  {
    name: "search_knowledge",
    summary: "Base de conocimiento del mercado argentino (CEDEARs, bonos, análisis, impuestos)",
    returns: "structuredContent { answer, sources: [...] }",
    when: "Preguntas conceptuales: qué es un CEDEAR, cómo tributan los bonos, contexto de mercado.",
    scope: "read",
  },
  {
    name: "place_order",
    summary: "Compra/venta de instrumentos en tu cuenta IOL (incluye MEP con especie D)",
    returns: "structuredContent { ok, message }",
    when: "Operar acciones, CEDEARs, bonos o MEP. Requiere conexión con alcance Lectura+operar y server con IOL_TRADING_ENABLED=true.",
    scope: "trade",
  },
  {
    name: "cancel_order",
    summary: "Cancela una operación pendiente en IOL",
    returns: "structuredContent { ok, message }",
    when: "Cancelar una orden pendiente. Mismos requisitos que place_order.",
    scope: "trade",
  },
  {
    name: "subscribe_fci",
    summary: "Suscribe a un fondo común de inversión (FCI) por monto",
    returns: "structuredContent { ok, message }",
    when: "Invertir en un FCI de tu cuenta IOL. Mismos requisitos que place_order.",
    scope: "trade",
  },
  {
    name: "rescue_fci",
    summary: "Rescata cuotapartes de un FCI",
    returns: "structuredContent { ok, message }",
    when: "Retirar plata de un FCI. Mismos requisitos que place_order.",
    scope: "trade",
  },
];

const AGENT_SKILLS = [
  {
    name: "gauss314/skills",
    description: "Datos del mercado argentino: BYMA, MAE, BCRA, data912 e INDEC",
    command: "npx skills add gauss314/skills --all",
    url: "https://www.skills.sh/gauss314/skills",
  },
  {
    name: "xvary-stock-research",
    description: "Análisis de subyacentes de EE.UU.",
    command:
      "npx skills add https://github.com/xvary-research/claude-code-stock-analysis-skill --skill xvary-stock-research",
    url: "https://github.com/xvary-research/claude-code-stock-analysis-skill",
  },
  {
    name: "trading-analysis (gracefullight/stock-checker)",
    description: "Análisis técnico de acciones",
    command: "npx skills add https://github.com/gracefullight/stock-checker --skill trading-analysis",
    url: "https://github.com/gracefullight/stock-checker",
  },
  {
    name: "anthropics/financial-services",
    description: "Metodología de reportes financieros",
    command:
      "npx skills add https://github.com/anthropics/financial-services --skill investment-proposal",
    url: "https://github.com/anthropics/financial-services",
  },
];

export function AgentConnectPage() {
  const [openTool, setOpenTool] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="animate-in fade-in-0 duration-300 motion-reduce:animate-none">
        <h1 className="text-2xl font-semibold tracking-tight">Conectá Sentinel con tu Agente</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu agente de IA puede leer tu cartera y cotizaciones en tiempo real vía MCP — creá una conexión y pegá
          la key en tu agente.
        </p>
      </div>

      {/* Tus conexiones — tabla */}
      <div className="animate-in fade-in-0 duration-300 motion-reduce:animate-none" style={{ animationDelay: "60ms" }}>
        <AgentConnectionsTable />
      </div>

      {/* Qué puede hacer tu agente */}
      <Card
        className="animate-in fade-in-0 duration-300 motion-reduce:animate-none"
        style={{ animationDelay: "120ms" }}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Qué puede hacer tu agente
          </CardTitle>
          <CardDescription>
            Tools que expone el server MCP de Sentinel. Las de Solo lectura consultan tu cartera y el mercado; las
            de Lectura+operar operan (compra/venta, FCI, cancelación) cuando el server corre con
            IOL_TRADING_ENABLED=true.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {MCP_TOOLS.map((tool) => {
              const isOpen = openTool === tool.name;
              return (
                <li key={tool.name} className="rounded-lg border">
                  <button
                    type="button"
                    onClick={() => setOpenTool(isOpen ? null : tool.name)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-sm font-medium">{tool.name}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">{tool.summary}</span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180"
                      )}
                    />
                  </button>
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="space-y-3 border-t px-4 py-3">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground">Qué devuelve</p>
                          <code className="block overflow-x-auto rounded-md bg-muted/50 px-2 py-1.5 font-mono text-xs">
                            {tool.returns}
                          </code>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground">Cuándo usarla</p>
                          <p className="text-sm">{tool.when}</p>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-muted-foreground">Alcance requerido</p>
                          <Badge variant={tool.scope === "trade" ? "default" : "secondary"}>
                            {tool.scope === "trade" ? "Lectura + operar" : "Solo lectura"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Skills recomendadas */}
      <Card
        className="animate-in fade-in-0 duration-300 motion-reduce:animate-none"
        style={{ animationDelay: "180ms" }}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Skills recomendadas
          </CardTitle>
          <CardDescription>
            Skills de skills.sh para que tu agente sea experto en bolsa. Estas skills las usa tu agente para acceder
            a datos y metodologías — Sentinel le da tu cartera y cotizaciones vía MCP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <ul className="space-y-2">
            {AGENT_SKILLS.map((skill) => (
              <li key={skill.name} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{skill.name}</p>
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
                    <a href={skill.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="ml-1.5">Ver skill</span>
                    </a>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{skill.description}</p>
                <CodeBlock code={skill.command} label="instalación" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
