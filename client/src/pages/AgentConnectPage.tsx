import { useState } from "react";
import {
  Bot,
  Check,
  Copy,
  Cpu,
  ExternalLink,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AgentApiKeysCard } from "@/components/agent/AgentApiKeysCard";
import { CodeBlock } from "@/components/agent/CodeBlock";

const OPENCODE_CONFIG = `{
  "mcp": {
    "sentinel": {
      "type": "local",
      "command": ["cmd", "/c", "npx", "-y", "tsx", "C:\\\\Users\\\\Martino\\\\Documents\\\\PROGRAMACION III\\\\Invertir\\\\server\\\\src\\\\mcp\\\\stdio.ts"],
      "env": {
        "SENTINEL_API_KEY": "<tu key>"
      }
    }
  }
}`;

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "sentinel": {
      "command": "node",
      "args": ["<ruta>\\\\server\\\\dist\\\\mcp\\\\stdio.js"],
      "env": {
        "SENTINEL_API_KEY": "<tu key>"
      }
    }
  }
}`;

const MCP_TOOLS = [
  { name: "get_portfolio", description: "Cartera completa: posiciones, cash y variaciones" },
  { name: "get_quote", description: "Cotización puntual de un símbolo" },
  { name: "search_instruments", description: "Búsqueda de instrumentos por texto" },
  { name: "get_dollar_rates", description: "Cotizaciones del dólar (CCL, MEP, oficial, etc.)" },
  { name: "get_monthly_reports", description: "Reportes mensuales de la cuenta" },
  { name: "place_order", description: "Ejecutar órdenes de compra/venta", inDevelopment: true },
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
  {
    name: "macro-liquidity (star23/Day1Global-Skills)",
    description: "Análisis de liquidez macro global",
    command: "npx skills add https://github.com/star23/Day1Global-Skills --skill macro-liquidity",
    url: "https://github.com/star23/Day1Global-Skills",
  },
  {
    name: "finance_skills (JoelLewis)",
    description: "Finanzas personales y mercados",
    command: "npx skills add https://github.com/JoelLewis/finance_skills",
    url: "https://github.com/JoelLewis/finance_skills",
  },
];

export function AgentConnectPage() {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  async function handleCopyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCommand(command);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch {
      /* clipboard no disponible — el usuario puede copiarla a mano */
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Conectá Sentinel con tu Agente
          </h1>
          <p className="text-sm text-muted-foreground">
            Tu agente de IA puede leer tu cartera y cotizaciones en tiempo real vía MCP.
          </p>
        </div>
      </div>

      <AgentApiKeysCard />

      {/* Información del MCP */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            Información del MCP
          </CardTitle>
          <CardDescription>
            Un MCP (Model Context Protocol) es el estándar que usa tu agente para conectarse
            con datos y herramientas externas. Sentinel expone un servidor MCP local que le
            da acceso a tu cartera, cotizaciones y reportes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">opencode</p>
            <p className="text-xs text-muted-foreground">
              Agregá este bloque a tu <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">opencode.json</code> y reemplazá{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">&lt;tu key&gt;</code> por la key que creaste.
            </p>
            <CodeBlock code={OPENCODE_CONFIG} label="opencode.json" />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Claude Desktop</p>
            <p className="text-xs text-muted-foreground">
              Agregá este bloque a tu <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">claude_desktop_config.json</code>.
              Necesitás el server compilado (<code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npm run build</code> en server/).
            </p>
            <CodeBlock code={CLAUDE_CONFIG} label="claude_desktop_config.json" />
          </div>

          <Alert className="border-amber-500/40 bg-amber-500/10">
            <ShieldAlert className="h-4 w-4 text-amber-700" />
            <AlertTitle className="text-amber-700">Seguridad</AlertTitle>
            <AlertDescription className="text-amber-700">
              La key vive en el archivo de configuración de tu máquina — tratela como una
              contraseña. Usá scope{" "}
              <span className="font-medium">read</span> salvo que el agente vaya a operar.
              Si sospechás que se filtró, revocá la key al instante desde la sección API Keys.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <p className="text-sm font-medium">Tools que expone Sentinel</p>
            <ul className="space-y-2">
              {MCP_TOOLS.map((tool) => (
                <li
                  key={tool.name}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium">{tool.name}</p>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                  {tool.inDevelopment && (
                    <Badge variant="secondary">
                      <Wrench className="mr-1 h-3 w-3" />
                      en desarrollo
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Skills recomendadas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Skills recomendadas
          </CardTitle>
          <CardDescription>
            Skills de skills.sh para que tu agente sea experto en bolsa. Estas skills las usa
            tu agente para acceder a datos y metodologías — Sentinel le da tu cartera y
            cotizaciones vía MCP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <ul className="space-y-2">
            {AGENT_SKILLS.map((skill) => (
              <li key={skill.name} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{skill.name}</p>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => void handleCopyCommand(skill.command)}
                    >
                      {copiedCommand === skill.command ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span className="ml-1.5">{copiedCommand === skill.command ? "Copiado" : "Copiar"}</span>
                    </Button>
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
                </div>
                <p className="text-xs text-muted-foreground">{skill.description}</p>
                <code className="block overflow-x-auto rounded-md bg-muted/70 px-2 py-1.5 font-mono text-xs">
                  {skill.command}
                </code>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
