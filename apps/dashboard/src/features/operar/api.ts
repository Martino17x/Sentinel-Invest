/**
 * Feature `operar` — fuente única para ordersApi.
 * Extraído de lib/api.ts (SDD dashboard-features-resto C3).
 * Mover, no duplicar. Importa apiFetch desde lib/api-client para evitar ciclo con shim.
 */

import { apiFetch } from "@/lib/api-client";

// ============================================================
// Órdenes — operar contra IOL desde la app (POST /api/orders)
// ============================================================

export type OrderSide = "buy" | "sell";
export type PriceType = "market" | "limit";
export type OrderMarket = "bcba" | "nyse" | "nasdaq" | "bonds";
export type OrderTerm = "t0" | "t1" | "t2";

export interface CreateOrderInput {
  symbol: string;
  side: OrderSide;
  qty: number;
  priceType?: PriceType;
  price?: number;
  market?: OrderMarket;
  term?: OrderTerm;
  validity?: "1d" | "7d" | string;
  specie?: "D";
}

export interface FciSubscriptionInput {
  symbol: string;
  amount: number;
}

export interface FciRedemptionInput {
  symbol: string;
  quantity: number;
}

export interface OrderResult {
  ok: boolean;
  orderId: string;
  status: string;
  message?: string;
}

export const ordersApi = {
  async createOrder(input: CreateOrderInput): Promise<OrderResult> {
    return apiFetch("/orders", { method: "POST", body: JSON.stringify(input) });
  },
  async cancelOrder(operationNumber: string | number): Promise<OrderResult> {
    return apiFetch(`/orders/${encodeURIComponent(String(operationNumber))}/cancel`, {
      method: "POST",
    });
  },
  async subscribeFci(input: FciSubscriptionInput): Promise<OrderResult> {
    return apiFetch("/orders/fci/subscribe", { method: "POST", body: JSON.stringify(input) });
  },
  async rescueFci(input: FciRedemptionInput): Promise<OrderResult> {
    return apiFetch("/orders/fci/rescue", { method: "POST", body: JSON.stringify(input) });
  },
};
