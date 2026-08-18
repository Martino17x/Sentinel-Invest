// ============================================================
// FORMATEO DE MONEDA — helpers compartidos del client
// Evita duplicar Intl.NumberFormat en cada página.
// ============================================================

const formatterARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const formatterARSNoDecimals = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const formatterUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

/** Formatea un monto según la moneda (ARS con separadores es-AR, USD en-US) */
export function formatMoney(value: number, currency: string): string {
  if (currency === "USD") return formatterUSD.format(value);
  return formatterARS.format(value);
}

/** Formatea ARS con decimales (para montos chicos, ej. ganancia diaria) */
export function formatArs(value: number): string {
  return formatterARS.format(value);
}

/** Formatea ARS sin decimales (para totales grandes) */
export function formatArsNoDecimals(value: number): string {
  return formatterARSNoDecimals.format(value);
}

/** Formatea USD */
export function formatUsd(value: number): string {
  return formatterUSD.format(value);
}

const formatterARSCompact = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatterUSDCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Formato COMPACTO para montos enormes (espacios angostos, ej. centro del donut):
 * ≥ 1.000.000 → "$ 100,0 M" / "$ 1,2 MM" (es-AR usa "M" con sufijo diferente
 * según Intl; en en-US "USD 100M"). Debajo de 1M usa el formato normal.
 */
export function formatCompact(value: number, currency: string): string {
  const abs = Math.abs(value);
  if (abs < 1_000_000) {
    return currency === "USD" ? formatterUSD.format(value) : formatterARSNoDecimals.format(value);
  }
  return currency === "USD" ? formatterUSDCompact.format(value) : formatterARSCompact.format(value);
}

/**
 * Enmascara un monto (para el botón "ojo" de ocultar valores).
 * Muestra "••••" en lugar del número.
 */
export function maskAmount(value: number | string): string {
  void value;
  return "••••";
}

/**
 * Formatea la variación diaria como "+$ 1.234,56" o "-$ 1.234,56".
 * @param value monto (positivo = ganancia, negativo = pérdida)
 * @param currency moneda para el formato
 */
export function formatChangeAmount(value: number, currency: string): string {
  const abs = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatMoney(abs, currency)}`;
}

/**
 * Formatea un porcentaje con su signo: "+1,50%" / "-0,62%" / "0,00%".
 */
export function formatPct(value: number): string {
  const sign = value > 0.01 ? "+" : value < -0.01 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}
