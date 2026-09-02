export interface Agent {
  name: string;
  description: string;
}

export interface Tool {
  name: string;
  description: string;
}

export const agents: Agent[] = [
  { name: "Claude Code", description: "Agente de Anthropic para tu terminal" },
  { name: "Cursor", description: "Editor de código con IA integrada" },
  { name: "Codex", description: "Agente de OpenAI en tu terminal" },
  { name: "opencode", description: "Agente open source para tu terminal" },
  { name: "gemini-cli", description: "Agente de Google en tu terminal" },
];

export const tools: Tool[] = [
  { name: "get_portfolio", description: "Lee tu cartera actual" },
  { name: "get_quote", description: "Cotización de un instrumento" },
  { name: "search_instruments", description: "Busca instrumentos por símbolo" },
  { name: "get_dollar_rates", description: "Dólar oficial, blue, bolsa y CCL" },
];
