// ============================================================
// Formateo de texto plano para resultados de tools
// (el LLM recibe SIEMPRE texto plano sanitizado — nunca HTML)
// ============================================================

const ars = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function fmtArs(n: number): string {
  return `$${ars.format(n)}`;
}

export function fmtUsd(n: number): string {
  return `USD ${usd.format(n)}`;
}

export function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function fmtQty(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 6 }).format(n);
}
