import { useState } from "react";
import {
  Bot,
  ChevronDown,
  ExternalLink,
  FileCode,
  MousePointer2,
  ShieldAlert,
  Sparkles,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AgentApiKeysCard } from "@/components/agent/AgentApiKeysCard";
import { CodeBlock } from "@/components/agent/CodeBlock";

const SERVER_STDIO_DIST = "C:\\ruta\\a\\Sentinel\\server\\dist\\mcp\\stdio.js";
const SERVER_STDIO_SRC = "C:\\ruta\\a\\Sentinel\\server\\src\\mcp\\stdio.ts";

const CLAUDE_COMMAND = `claude mcp add sentinel -- node "${SERVER_STDIO_DIST}"`;

const CLAUDE_DESKTOP_CONFIG = `{
  "mcpServers": {
    "sentinel": {
      "command": "node",
      "args": ["${SERVER_STDIO_DIST}"],
      "env": {
        "SENTINEL_API_KEY": "tu-key"
      }
    }
  }
}`;

const CURSOR_CONFIG = `{
  "mcpServers": {
    "sentinel": {
      "command": "node",
      "args": ["${SERVER_STDIO_DIST}"],
      "env": {
        "SENTINEL_API_KEY": "tu-key"
      }
    }
  }
}`;

const OPENCODE_CONFIG = `{
  "mcp": {
    "sentinel": {
      "type": "local",
      "command": ["cmd", "/c", "npx", "-y", "tsx", "${SERVER_STDIO_SRC}"],
      "env": {
        "SENTINEL_API_KEY": "tu-key"
      }
    }
  }
}`;

const CODEX_CONFIG = `[mcp_servers.sentinel]
command = "node"
args = ["${SERVER_STDIO_DIST}"]
env = { SENTINEL_API_KEY = "tu-key" }`;

interface AgentConfigBlock {
  label: string;
  code: string;
}

interface AgentInfo {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  blocks: AgentConfigBlock[];
}

const AGENTS: AgentInfo[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    tagline: "Agente de Anthropic para tu terminal",
    description:
      "Claude Code es el agente de Anthropic. Podés registrarlo por CLI o usar la config de Claude Desktop.",
    icon: Bot,
    blocks: [
      { label: "Comando", code: CLAUDE_COMMAND },
      { label: "claude_desktop_config.json", code: CLAUDE_DESKTOP_CONFIG },
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    tagline: "Editor de código con IA integrada",
    description:
      "Cursor conecta servers MCP desde el archivo .cursor/mcp.json en la raíz del proyecto.",
    icon: MousePointer2,
    blocks: [{ label: ".cursor/mcp.json", code: CURSOR_CONFIG }],
  },
  {
    id: "opencode",
    name: "opencode",
    tagline: "CLI de agentes open source",
    description:
      "opencode corre el server directo desde TypeScript con tsx — sin necesidad de compilar.",
    icon: Terminal,
    blocks: [{ label: "opencode.json", code: OPENCODE_CONFIG }],
  },
  {
    id: "codex",
    name: "Codex",
    tagline: "Agente de OpenAI en tu terminal",
    description:
      "Codex lee servers MCP desde ~/.codex/config.toml — agregá la sección mcp_servers.",
    icon: FileCode,
    blocks: [{ label: "~/.codex/config.toml", code: CODEX_CONFIG }],
  },
];

const SETUP_STEPS = [
  "Creá tu API key abajo, en la sección \"API Keys\". El scope read alcanza para consultas; trade queda reservado para operar.",
  "Copiá la configuración — reemplazá la ruta al server y la key por las tuyas.",
  "Reiniciá tu agente para que cargue el server MCP de Sentinel.",
];

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
    when: "Operar acciones, CEDEARs, bonos o MEP. Requiere API key con scope trade y el server con IOL_TRADING_ENABLED=true.",
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

function AgentConfigDialog({ agent }: { agent: AgentInfo }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="mt-auto w-full">
          Ver configuración
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <agent.icon className="h-4 w-4" />
            </span>
            {agent.name}
          </DialogTitle>
          <DialogDescription>{agent.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {SETUP_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <div className="space-y-2">
            {agent.blocks.map((block) => (
              <CodeBlock key={block.label} code={block.code} label={block.label} />
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Las rutas usan el placeholder{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              C:\ruta\a\Sentinel
            </code>{" "}
            — reemplazalas por la ruta real del server y la key que creaste.
          </p>

          <Alert className="border-amber-500 bg-amber-500 text-amber-950">
            <ShieldAlert className="h-4 w-4 text-amber-950" />
            <AlertTitle className="text-amber-950">Seguridad</AlertTitle>
            <AlertDescription className="text-amber-950">
              La key da acceso a tu cartera — tratela como una contraseña. Si sospechás que se
              filtró, revocala al instante desde la sección API Keys.
            </AlertDescription>
          </Alert>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AgentConnectPage() {
  const [openTool, setOpenTool] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conectá Sentinel con tu Agente</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu agente de IA puede leer tu cartera y cotizaciones en tiempo real vía MCP — configuralo
          en minutos.
        </p>
      </div>

      {/* Elige tu agente */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Elige tu agente</h2>
          <p className="text-sm text-muted-foreground">
            Sentinel expone un server MCP local con las herramientas de tu cartera.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AGENTS.map((agent, i) => (
            <Card
              key={agent.id}
              className="h-full animate-in fade-in-0 duration-300 motion-reduce:animate-none"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <CardContent className="flex h-full flex-col gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted p-2 text-muted-foreground">
                  <agent.icon className="h-5 w-5" />
                </span>
                <div className="space-y-1">
                  <p className="font-semibold">{agent.name}</p>
                  <p className="text-sm text-muted-foreground">{agent.tagline}</p>
                </div>
                <AgentConfigDialog agent={agent} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Qué puede hacer tu agente */}
      <Card
        className="animate-in fade-in-0 duration-300 motion-reduce:animate-none"
        style={{ animationDelay: "300ms" }}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Qué puede hacer tu agente
          </CardTitle>
          <CardDescription>
            Tools que expone el server MCP de Sentinel. Las de scope read consultan tu cartera y el
            mercado; las de scope trade operan (compra/venta, FCI, cancelación) cuando el server
            corre con IOL_TRADING_ENABLED=true.
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
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {tool.summary}
                      </span>
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
                        <p className="text-xs font-semibold text-muted-foreground">
                          Scope requerido
                        </p>
                        <Badge variant={tool.scope === "trade" ? "default" : "secondary"}>
                          {tool.scope === "trade" ? "read + trade" : "read"}
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

      {/* API keys */}
      <AgentApiKeysCard />

      {/* Skills recomendadas */}
      <Card
        className="animate-in fade-in-0 duration-300 motion-reduce:animate-none"
        style={{ animationDelay: "420ms" }}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Skills recomendadas
          </CardTitle>
          <CardDescription>
            Skills de skills.sh para que tu agente sea experto en bolsa. Estas skills las usa tu
            agente para acceder a datos y metodologías — Sentinel le da tu cartera y cotizaciones
            vía MCP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <ul className="space-y-2">
            {AGENT_SKILLS.map((skill) => (
              <li key={skill.name} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{skill.name}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    asChild
                  >
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
