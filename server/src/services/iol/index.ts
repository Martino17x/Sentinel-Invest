import type { IolProvider } from "./IolProvider.js";
import { MockIolProvider } from "./MockIolProvider.js";
import { IolApiProvider } from "./IolApiProvider.js";
import { BymaDataProvider } from "./BymaDataProvider.js";
import type {
  IolCredentials,
  PanelQuote,
  PanelSummary,
  Quote,
} from "./types.js";

/**
 * Punto único de decisión de providers.
 *
 * IOL_PROVIDER=mock  → MockIolProvider (SOLO desarrollo local)
 * IOL_PROVIDER=api   → IolApiProvider (cuenta real) + QUOTE_PROVIDER
 *
 * QUOTE_PROVIDER=iol  → cotizaciones vía IOL (default)
 * QUOTE_PROVIDER=byma → cotizaciones vía BYMADATA (API pública de BYMA)
 * QUOTE_PROVIDER=auto → intenta IOL, si falla → BYMA (fallback automático)
 *
 * La app importa SIEMPRE desde este módulo, nunca las clases concretas.
 */
export function getIolProvider(): IolProvider {
  const provider = process.env.IOL_PROVIDER ?? "mock";

  switch (provider) {
    case "mock":
      return new MockIolProvider();
    case "api":
      return new QuoteFallbackProvider(new IolApiProvider());
    default:
      throw new Error(`Proveedor IOL desconocido: ${provider}`);
  }
}

/**
 * Wrapper que agrega el fallback de cotizaciones:
 * las operaciones de CUENTA van al provider principal (IOL),
 * las de COTIZACIONES respetan QUOTE_PROVIDER con fallback automático.
 */
class QuoteFallbackProvider implements IolProvider {
  private byma = new BymaDataProvider();

  constructor(private accountProvider: IolProvider) {}

  private get quoteMode(): string {
    return process.env.QUOTE_PROVIDER ?? "iol";
  }

  private async withFallback<T>(
    iolFn: () => Promise<T>,
    bymaFn: () => Promise<T>
  ): Promise<T> {
    const mode = this.quoteMode;

    if (mode === "byma") {
      return bymaFn();
    }

    // "iol" o "auto": intentar IOL primero
    try {
      return await iolFn();
    } catch (err) {
      if (mode === "auto") {
        // Fallback automático a BYMA
        return bymaFn();
      }
      // modo "iol": el error de IOL se propaga (ser honestos)
      throw err;
    }
  }

  async getQuote(creds: IolCredentials, symbol: string, market: string): Promise<Quote> {
    return this.withFallback(
      () => this.accountProvider.getQuote(creds, symbol, market),
      () => this.byma.getQuote(creds, symbol, market)
    );
  }

  async getQuoteHistory(
    creds: IolCredentials,
    symbol: string,
    market: string,
    days: number
  ): Promise<{ date: string; close: number }[]> {
    const mode = this.quoteMode;
    if (mode === "byma") {
      return this.byma.getQuoteHistory(creds, symbol, market, days);
    }
    try {
      const fromIol = await this.accountProvider.getQuoteHistory(creds, symbol, market, days);
      if (fromIol.length > 0) return fromIol;
      // IOL devolvió vacío → fallback a BYMADATA
      return this.byma.getQuoteHistory(creds, symbol, market, days);
    } catch {
      return this.byma.getQuoteHistory(creds, symbol, market, days);
    }
  }

  async getPanel(
    creds: IolCredentials,
    market: string,
    assetType: string
  ): Promise<{ summary: PanelSummary; quotes: PanelQuote[] }> {
    return this.withFallback(
      () => this.accountProvider.getPanel(creds, market, assetType),
      () => this.byma.getPanel(creds, market, assetType)
    );
  }

  // Métodos de cuenta → siempre al provider principal
  getPortfolio(creds: IolCredentials, accountNumber: string) {
    return this.accountProvider.getPortfolio(creds, accountNumber);
  }
  getOperations(creds: IolCredentials, accountNumber: string) {
    return this.accountProvider.getOperations(creds, accountNumber);
  }
  getPortfolioHistory(creds: IolCredentials, accountNumber: string, days: number) {
    return this.accountProvider.getPortfolioHistory(creds, accountNumber, days);
  }
  getMonthlyCloses(creds: IolCredentials, accountNumber: string) {
    return this.accountProvider.getMonthlyCloses(creds, accountNumber);
  }
  getMonthlyReport(creds: IolCredentials, accountNumber: string, month: string) {
    return this.accountProvider.getMonthlyReport(creds, accountNumber, month);
  }
}
