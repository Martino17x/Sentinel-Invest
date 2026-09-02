import { test } from "node:test";
import assert from "node:assert/strict";
import { IolApiProvider } from "../../src/services/iol/IolApiProvider.js";

// ============================================================
// Provider IOL — getQuoteHistory (seriehistorica) y getQuote
// enriquecido, con fetch stubeado (patrón de route.test.ts).
// ============================================================

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1")) return original(input, init);
    return handler(url, init);
  }) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

test("getQuoteHistory usa seriehistorica de IOL y mapea fecha/precio", async () => {
  let captured = "";
  const restore = stubFetch((url) => {
    captured = url;
    if (url.includes("/token")) {
      return Response.json({ access_token: "tok-test" });
    }
    if (url.includes("seriehistorica")) {
      return Response.json([
        { fechaHora: "2026-08-14T16:59:54.707", ultimoPrecio: 6850 },
        { fechaHora: "2026-08-13T16:59:54.707", ultimoPrecio: 6700 },
      ]);
    }
    return new Response("not stubbed", { status: 500 });
  });
  try {
    const provider = new IolApiProvider();
    const history = await provider.getQuoteHistory({ username: "u", password: "p" }, "GGAL", "bcba", 30);
    assert.equal(history.length, 2);
    assert.equal(history[0].close, 6850);
    assert.ok(history[0].date.startsWith("2026-08-14"), "fecha ISO correcta");
    assert.ok(captured.includes("/bCBA/Titulos/GGAL/Cotizacion/seriehistorica/"), "market code bCBA en la URL");
  } finally {
    restore();
  }
});

test("getQuote enriquece con apertura/máx/mín/cierre/volumen desde Cotizacion", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("/token")) {
      return Response.json({ access_token: "tok-test" });
    }
    if (url.includes("/Cotizacion")) {
      return Response.json({
        simbolo: "GGAL",
        ultimoPrecio: 6710,
        variacion: -2.04,
        apertura: 6850,
        maximo: 6960,
        minimo: 6630,
        cierreAnterior: 6850,
        volumenNominal: 1234567,
        moneda: "peso_argentino",
        puntaCompra: 6680,
        puntaVenta: 6740,
      });
    }
    return new Response("not stubbed", { status: 500 });
  });
  try {
    const provider = new IolApiProvider();
    const quote = await provider.getQuote({ username: "u", password: "p" }, "GGAL", "bcba");
    assert.equal(quote.lastPrice, 6710);
    assert.equal(quote.open, 6850);
    assert.equal(quote.high, 6960);
    assert.equal(quote.low, 6630);
    assert.equal(quote.prevClose, 6850);
    assert.equal(quote.volume, 1234567);
    assert.equal(quote.bid, 6680);
    assert.equal(quote.ask, 6740);
  } finally {
    restore();
  }
});

test("getQuote ante fallo del endpoint Cotizacion devuelve cotización vacía (fallback BYMA)", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("/token")) return Response.json({ access_token: "tok" });
    return new Response("boom", { status: 500 });
  });
  try {
    const provider = new IolApiProvider();
    const quote = await provider.getQuote({ username: "u", password: "p" }, "GGAL", "bcba");
    assert.equal(quote.lastPrice, 0);
    assert.equal(quote.high, null);
  } finally {
    restore();
  }
});

test("placeOrder: un 400 de IOL se traduce a mensaje accionable con el detalle del body", async () => {
  const restore = stubFetch((url, init) => {
    if (url.includes("/token")) return Response.json({ access_token: "tok" });
    if (url.includes("/operar/Comprar")) {
      return new Response(JSON.stringify({ error: "Saldo insuficiente" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    void init;
    return new Response("not stubbed", { status: 500 });
  });
  try {
    const provider = new IolApiProvider();
    const err = await provider
      .placeOrder(
        { username: "u", password: "p" },
        "423827",
        { side: "buy", symbol: "GGAL", market: "bCBA", quantity: 10, priceType: "limit", price: 100 }
      )
      .then(() => null)
      .catch((e) => e as Error);
    assert.ok(err, "debe lanzar");
    assert.match(err!.message, /Datos de la orden inválidos/);
    assert.match(err!.message, /Saldo insuficiente/);
  } finally {
    restore();
  }
});
