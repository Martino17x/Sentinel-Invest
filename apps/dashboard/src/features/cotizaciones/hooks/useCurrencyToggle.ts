import { useState, useCallback } from "react";
import { isUsdSettlementVariant, getSettlementSuffix } from "@sentinel/domain";
import type { PanelQuote } from "../api";

export type CedearCurrency = "all" | "ars" | "usd" | "usd_c";

/**
 * Clasifica moneda display para CEDEARs.
 * Reemplaza chequeo manual de sufijo por helpers de `@sentinel/domain`.
 *
 * Reglas (copia fiel de QuotesPage.tsx getQuoteCurrencyLabel):
 * - market !== bcba  → US$
 * - currency === USD + sufijo C válido (via domain) → US$ C
 * - currency === USD (resto, incluye D) → US$
 * - sino → AR$
 *
 * Usa `isUsdSettlementVariant` para validar base existente y
 * `getSettlementSuffix` para distinguir C vs D sin chequeo manual.
 */
export function getCurrencyLabel(q: {
  symbol: string;
  market: string;
  currency: string;
}): "AR$" | "US$" | "US$ C" {
  if (q.market !== "bcba") return "US$";
  if (q.currency === "USD") {
    const suffix = getSettlementSuffix(q.symbol);
    // suffix C solo es CCL si la base existe (isUsdSettlementVariant valida)
    if (suffix === "C" && isUsdSettlementVariant(q.symbol)) return "US$ C";
    return "US$";
  }
  // Variante sin currency USD pero con base válida (edge case) → respetar sufijo
  // Spec: GGAL→AR$ (no USD), GGALC→US$ C, GGALD→US$
  // Si no hay currency USD, es AR$ aunque el sufijo exista aislado
  // isUsdSettlementVariant sin currency solo valida sufijo → no debe mapear a US$ C sin currency
  if (isUsdSettlementVariant(q.symbol) && getSettlementSuffix(q.symbol) === "C") {
    // Sufijo C válido pero currency no USD → sigue siendo AR$ por spec (GGAL base)
    // Mantener AR$ para no romper filtro ars vs usd_c
    return "AR$";
  }
  return "AR$";
}

/**
 * Hook para filtro de moneda CEDEAR.
 * Expone estado y helper puro `getCurrencyLabel` que usa `isUsdSettlementVariant`.
 */
export function useCurrencyToggle(initial: CedearCurrency = "all") {
  const [cedearCurrency, setCedearCurrency] = useState<CedearCurrency>(initial);

  const getCurrencyLabelMemo = useCallback(
    (q: PanelQuote): "AR$" | "US$" | "US$ C" => getCurrencyLabel(q),
    []
  );

  return {
    cedearCurrency,
    setCedearCurrency,
    getCurrencyLabel: getCurrencyLabelMemo,
  };
}
