import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { BymaDataProvider } from "../../../src/services/iol/BymaDataProvider.js";

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1")) return original(input, init);
    return handler(url, init);
  }) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

describe("BymaDataProvider.mapInstrument — bifurcation volumeNominal/volumeEfectivo, bid/ask null off-hours", () => {
  test("bifurcation: volumeNominal=tradeVolume, volumeEfectivo=volumeAmount", async () => {
    const rawInstrument = {
      symbol: "AL30",
      description: "AL30 bono",
      trade: 58.2,
      previousClosingPrice: 57.5,
      bidPrice: 58.0,
      offerPrice: 58.4,
      tradeVolume: 5000,
      volumeAmount: 1200000,
      denominationCcy: "USD",
      tradingHighPrice: 59,
      tradingLowPrice: 57,
      openingPrice: 57.8,
    };

    const restore = stubFetch((url) => {
      if (url.includes("public-bonds")) return Response.json([rawInstrument]);
      if (url.includes("market-open")) return Response.json(true);
      return new Response("not stubbed: " + url, { status: 500 });
    });

    try {
      const provider = new BymaDataProvider();
      // Use getPanel which internally calls mapInstrument
      const result = await provider.getPanel({ id: "", email: "" } as any, "bcba", "bono", 1, 25);
      assert.equal(result.quotes.length, 1);
      const q = result.quotes[0] as any;
      assert.equal(q.symbol, "AL30");
      assert.equal(q.volumeNominal, 5000, "volumeNominal should be tradeVolume");
      assert.equal(q.volumeEfectivo, 1200000, "volumeEfectivo should be volumeAmount");
      // legacy volume alias maps to volumeNominal
      assert.equal(q.volume, 5000);
      assert.equal(q.bid, 58.0);
      assert.equal(q.ask, 58.4);
      assert.equal(q.currency, "USD");
    } finally {
      restore();
    }
  });

  test("volume null off-hours: null when campos ausentes", async () => {
    const rawOffHours = {
      symbol: "GD30",
      trade: 65.0,
      previousClosingPrice: 64.5,
      denominationCcy: "USD",
      // no tradeVolume, no volumeAmount, no bid/offer off-hours
    };
    const restore = stubFetch((url) => {
      if (url.includes("public-bonds")) return Response.json([rawOffHours]);
      if (url.includes("market-open")) return Response.json(false);
      if (url.includes("cedears") || url.includes("leading-equity")) return Response.json([]);
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const provider = new BymaDataProvider();
      const result = await provider.getPanel({ id: "", email: "" } as any, "bcba", "bono", 1, 25);
      assert.equal(result.quotes.length, 1);
      const q = result.quotes[0] as any;
      assert.equal(q.volumeNominal, null);
      assert.equal(q.volumeEfectivo, null);
      assert.equal(q.volume, null);
      assert.equal(q.bid, null);
      assert.equal(q.ask, null);
      assert.equal(q.currency, "USD");
    } finally {
      restore();
    }
  });

  test("bid/ask null off-hours → UI shows — (spread null)", async () => {
    const rawNoSpread = {
      symbol: "TX26",
      trade: 1200,
      previousClosingPrice: 1190,
      tradeVolume: 100,
      volumeAmount: 50000,
      denominationCcy: "ARS",
      // bidPrice and offerPrice intentionally absent (market closed)
    };
    const restore = stubFetch((url) => {
      if (url.includes("public-bonds")) return Response.json([rawNoSpread]);
      if (url.includes("market-open")) return Response.json(false);
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const provider = new BymaDataProvider();
      const result = await provider.getPanel({ id: "", email: "" } as any, "bcba", "bono", 1, 25);
      const q = result.quotes[0] as any;
      assert.equal(q.bid, null);
      assert.equal(q.ask, null);
      // spread derived in bonds.ts marketData = ask - bid only if both non-null → null
      assert.ok(q.bid == null || q.ask == null, "off-hours bid/ask null");
    } finally {
      restore();
    }
  });

  test("only one volume field present → other null", async () => {
    const rawPartial = {
      symbol: "S31L6",
      trade: 100,
      previousClosingPrice: 99,
      tradeVolume: 1000,
      // volumeAmount missing
      denominationCcy: "ARS",
      bidPrice: 99.5,
      offerPrice: 100.5,
    };
    const restore = stubFetch((url) => {
      if (url.includes("public-bonds")) return Response.json([rawPartial]);
      if (url.includes("market-open")) return Response.json(true);
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const provider = new BymaDataProvider();
      const result = await provider.getPanel({ id: "", email: "" } as any, "bcba", "bono", 1, 25);
      const q = result.quotes[0] as any;
      assert.equal(q.volumeNominal, 1000);
      assert.equal(q.volumeEfectivo, null);
      assert.equal(q.volume, 1000);
    } finally {
      restore();
    }
  });

  test("getBondFichaRaw public exposes raw ficha", async () => {
    const ficha = { ley: "LEY NY", interes: "0,50% semestral", codigoIsin: "AR000123", formaAmortizacion: "Integra al vencimiento", fechaVencimiento: "2030-07-09 00:00:00.0" };
    const restore = stubFetch((url) => {
      if (url.includes("fichatecnica/especies/general")) return Response.json({ data: [ficha], empty: false });
      if (url.includes("flujofondoscotiz")) return Response.json([]);
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const provider = new BymaDataProvider();
      const raw = await provider.getBondFichaRaw("AL30");
      assert.ok(raw);
      assert.equal(raw!.ley, "LEY NY");
      assert.equal(raw!.codigoIsin, "AR000123");
    } finally {
      restore();
    }
  });
});
