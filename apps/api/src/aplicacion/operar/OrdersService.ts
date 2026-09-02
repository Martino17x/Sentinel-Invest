/**
 * OrdersService — orquestador de órdenes (SDD8).
 * Capa aplicación, DIP: no importa infraestructura/interfaces.
 * Centraliza validación, gate, credenciales, price-ref y audit.
 *
 * Spec: D→bcba, limit sin price 400, gate IOL_TRADING_ENABLED 403,
 * price-ref vía MarketDataPort, map vía IOL_MARKET_CODE_MAP,
 * audit auditAgentAction warn-only con clientName:"api:orders".
 */
import { SettlementType, IOL_MARKET_CODE_MAP } from "../../dominio/tipos.js";
import type { TradingPort, FciPort, MarketDataPort } from "./ports.js";
import type { IolCredentials, OrderResult } from "../../services/iol/types.js";
import { isTradingEnabled, tradingGate, requireCreds } from "./gates.js";
import type { AuditInput } from "../agente/audit.js";

// ---------------------------------------------------------------------------
// DTOs — espejan createOrderSchema de routes/orders.ts (sin zod aquí)
// ---------------------------------------------------------------------------
export interface PlaceOrderDto {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  priceType: "market" | "limit";
  price?: number;
  market: "bcba" | "nyse" | "nasdaq" | "bonds";
  term?: string;
  validity?: string;
  specie?: SettlementType;
}

export interface FciSubscribeDto {
  symbol: string;
  amount: number;
}

export interface FciRescueDto {
  symbol: string;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Error con status HTTP — el adaptador HTTP lo mapea a res.status
// ---------------------------------------------------------------------------
export class OrderServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "OrderServiceError";
  }
}

export type AuditFn = (input: AuditInput) => Promise<void>;

export interface OrdersServiceDeps {
  tradingPort: TradingPort;
  fciPort: FciPort;
  marketDataPort: MarketDataPort;
  audit: AuditFn;
  /** Provider inyectado — evita importar lib/iol-credentials directo */
  getCredentials: (userId: string) => Promise<IolCredentials>;
  /** AccountNumber opcional — default "" como routes actuales */
  getAccountNumber?: (userId: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isIolClientError(message: string): boolean {
  return /Datos de la orden inválidos|rechazó la operación|credenciales de IOL/.test(message);
}

function sanitizeArgs(args: unknown): unknown {
  // audit sanitiza internamente; aquí solo pasamos directo
  return args;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export class OrdersService {
  constructor(private readonly deps: OrdersServiceDeps) {}

  // --------------------------- placeOrder ---------------------------
  async placeOrder(
    dto: PlaceOrderDto,
    user: { id: string },
  ): Promise<OrderResult> {
    // Gate único
    const gate = tradingGate();
    if (!gate.ok) {
      await this.auditSafe({
        userId: user.id,
        tool: "place_order",
        args: sanitizeArgs(dto),
        resultStatus: "error",
        clientName: "api:orders",
        errorMessage: gate.message,
      });
      throw new OrderServiceError(gate.message, gate.code);
    }

    // Validación pura (sin I/O) — D→bcba, limit sin price, qty>0
    const validationError = this.validatePlaceOrder(dto);
    if (validationError) {
      await this.auditSafe({
        userId: user.id,
        tool: "place_order",
        args: sanitizeArgs(dto),
        resultStatus: "validation_error",
        clientName: "api:orders",
        errorMessage: validationError,
      });
      throw new OrderServiceError(validationError, 400);
    }

    // Credenciales (mock bypass)
    const creds = await this.deps.getCredentials(user.id);
    const credsGate = requireCreds(creds);
    if (!credsGate.ok) {
      await this.auditSafe({
        userId: user.id,
        tool: "place_order",
        args: sanitizeArgs(dto),
        resultStatus: "error",
        clientName: "api:orders",
        errorMessage: credsGate.message,
      });
      throw new OrderServiceError(credsGate.message, credsGate.code);
    }

    // Price-ref para market sin price
    let price = dto.price;
    if ((price === undefined || price <= 0) && dto.priceType === "market") {
      const quote = await this.deps.marketDataPort.getQuote(creds, dto.symbol, dto.market);
      if (quote.lastPrice <= 0) {
        const msg = `No se pudo resolver un precio de referencia para ${dto.symbol}.`;
        await this.auditSafe({
          userId: user.id,
          tool: "place_order",
          args: sanitizeArgs(dto),
          resultStatus: "validation_error",
          clientName: "api:orders",
          errorMessage: msg,
        });
        throw new OrderServiceError(msg, 400);
      }
      price = quote.lastPrice;
    }

    const marketCode = IOL_MARKET_CODE_MAP[dto.market];
    const accountNumber = this.deps.getAccountNumber ? await this.deps.getAccountNumber(user.id) : "";

    try {
      const result = await this.deps.tradingPort.placeOrder(creds, accountNumber, {
        side: dto.side,
        symbol: dto.symbol,
        market: marketCode,
        quantity: dto.qty,
        priceType: dto.priceType,
        price,
        term: dto.term,
        validity: dto.validity,
        specie: dto.specie,
      });

      await this.auditSafe({
        userId: user.id,
        tool: "place_order",
        args: sanitizeArgs({ ...dto, price }),
        resultStatus: "success",
        clientName: "api:orders",
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al ejecutar la orden";
      // No re-auditar si ya es OrderServiceError (ya auditado arriba)
      if (err instanceof OrderServiceError) throw err;
      await this.auditSafe({
        userId: user.id,
        tool: "place_order",
        args: sanitizeArgs(dto),
        resultStatus: "error",
        clientName: "api:orders",
        errorMessage: message.slice(0, 800),
      });
      const status = isIolClientError(message) ? 400 : 502;
      throw new OrderServiceError(message, status);
    }
  }

  // --------------------------- cancelOrder ---------------------------
  async cancelOrder(numero: string, user: { id: string }): Promise<OrderResult> {
    const gate = tradingGate();
    if (!gate.ok) {
      await this.auditSafe({
        userId: user.id,
        tool: "cancel_order",
        args: { operationNumber: numero },
        resultStatus: "error",
        clientName: "api:orders",
        errorMessage: gate.message,
      });
      throw new OrderServiceError(gate.message, gate.code);
    }
    if (!numero || numero.trim() === "") {
      throw new OrderServiceError("Falta el número de operación", 400);
    }
    const creds = await this.deps.getCredentials(user.id);
    const credsGate = requireCreds(creds);
    if (!credsGate.ok) {
      throw new OrderServiceError(credsGate.message, credsGate.code);
    }
    try {
      const result = await this.deps.tradingPort.cancelOperation(creds, numero);
      await this.auditSafe({
        userId: user.id,
        tool: "cancel_order",
        args: { operationNumber: numero },
        resultStatus: "success",
        clientName: "api:orders",
      });
      return result;
    } catch (err) {
      if (err instanceof OrderServiceError) throw err;
      const message = err instanceof Error ? err.message : "Error al cancelar la operación";
      await this.auditSafe({
        userId: user.id,
        tool: "cancel_order",
        args: { operationNumber: numero },
        resultStatus: "error",
        clientName: "api:orders",
        errorMessage: message.slice(0, 800),
      });
      throw new OrderServiceError(message, isIolClientError(message) ? 400 : 502);
    }
  }

  // --------------------------- subscribeFci ---------------------------
  async subscribeFci(dto: FciSubscribeDto, user: { id: string }): Promise<OrderResult> {
    const gate = tradingGate();
    if (!gate.ok) throw new OrderServiceError(gate.message, gate.code);
    if (!dto.symbol || dto.amount <= 0) throw new OrderServiceError("Parámetros inválidos", 400);
    const creds = await this.deps.getCredentials(user.id);
    const credsGate = requireCreds(creds);
    if (!credsGate.ok) throw new OrderServiceError(credsGate.message, credsGate.code);
    try {
      const result = await this.deps.fciPort.subscribeFci(creds, { symbol: dto.symbol, amount: dto.amount });
      await this.auditSafe({
        userId: user.id,
        tool: "subscribe_fci",
        args: dto,
        resultStatus: "success",
        clientName: "api:orders",
      });
      return result;
    } catch (err) {
      if (err instanceof OrderServiceError) throw err;
      const message = err instanceof Error ? err.message : "Error al suscribir al FCI";
      await this.auditSafe({
        userId: user.id,
        tool: "subscribe_fci",
        args: dto,
        resultStatus: "error",
        clientName: "api:orders",
        errorMessage: message.slice(0, 800),
      });
      throw new OrderServiceError(message, isIolClientError(message) ? 400 : 502);
    }
  }

  // --------------------------- rescueFci ---------------------------
  async rescueFci(dto: FciRescueDto, user: { id: string }): Promise<OrderResult> {
    const gate = tradingGate();
    if (!gate.ok) throw new OrderServiceError(gate.message, gate.code);
    if (!dto.symbol || dto.quantity <= 0) throw new OrderServiceError("Parámetros inválidos", 400);
    const creds = await this.deps.getCredentials(user.id);
    const credsGate = requireCreds(creds);
    if (!credsGate.ok) throw new OrderServiceError(credsGate.message, credsGate.code);
    try {
      const result = await this.deps.fciPort.rescueFci(creds, { symbol: dto.symbol, quantity: dto.quantity });
      await this.auditSafe({
        userId: user.id,
        tool: "rescue_fci",
        args: dto,
        resultStatus: "success",
        clientName: "api:orders",
      });
      return result;
    } catch (err) {
      if (err instanceof OrderServiceError) throw err;
      const message = err instanceof Error ? err.message : "Error al rescatar del FCI";
      await this.auditSafe({
        userId: user.id,
        tool: "rescue_fci",
        args: dto,
        resultStatus: "error",
        clientName: "api:orders",
        errorMessage: message.slice(0, 800),
      });
      throw new OrderServiceError(message, isIolClientError(message) ? 400 : 502);
    }
  }

  // --------------------------- validación pura ---------------------------
  private validatePlaceOrder(dto: PlaceOrderDto): string | null {
    if (!dto.symbol || dto.symbol.trim() === "") return "Símbolo requerido";
    if (dto.qty <= 0) return "La cantidad debe ser mayor a cero";
    if (dto.priceType === "limit" && (dto.price === undefined || dto.price <= 0)) {
      return "Las órdenes limit requieren un precio (price).";
    }
    if (dto.specie === SettlementType.D && dto.market !== "bcba") {
      return "Las órdenes en especie D (MEP) solo operan en el mercado bcba.";
    }
    return null;
  }

  private async auditSafe(input: AuditInput): Promise<void> {
    try {
      await this.deps.audit(input);
    } catch {
      // warn-only: no romper flujo si audit falla (spec)
      console.warn("⚠️ OrdersService audit:", input.tool, input.resultStatus);
    }
  }

  /** No importar infraestructura — verifica que el service no tenga imports de infra/interfaces */
  static assertNoInfraImports(): void {
    // Verificación estática vía grep en CI; método no-op para documentar invariante
  }
}
