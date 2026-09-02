import type { BondAnalytics, BondPanelRow } from "@/features/renta-fija/api";

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; header: string }[]): string {
  const header = columns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(",");
  const lines = rows.map((r) =>
    columns
      .map((c) => {
        const v = r[c.key];
        if (v == null) return "";
        const s = String(v);
        if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
        return s;
      })
      .join(",")
  );
  return [header, ...lines].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function bondPanelToCsvRows(rows: BondPanelRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    symbol: r.symbol,
    precio: r.precio,
    tir: r.tir,
    md: r.md,
    duration: r.duration,
    paridad: r.cuadroTecnico?.paridad ?? r.paridad,
    vt: r.cuadroTecnico?.vt,
    vr: r.cuadroTecnico?.vr,
    vencimiento: r.vencimiento,
    ley: r.ley ?? r.cuadroTecnico?.ley,
    moneda: r.moneda,
    tipo: r.tipo,
    isin: r.isin ?? r.cuadroTecnico?.isin,
  }));
}

export function compareToCsvRows(analytics: BondAnalytics[]): Record<string, unknown>[] {
  return analytics.map((a) => ({
    symbol: a.symbol,
    precio: a.precio,
    tir: a.tir,
    md: a.md,
    duration: a.duration,
    paridad: a.paridad,
    vencimiento: a.schedule.vencimiento,
    moneda: a.schedule.moneda,
    tipo: a.schedule.tipo,
  }));
}
