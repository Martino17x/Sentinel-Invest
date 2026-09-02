import { test } from "node:test";
import assert from "node:assert/strict";
import { MockIolProvider } from "../../src/services/iol/MockIolProvider.js";
import { IolApiProvider } from "../../src/services/iol/IolApiProvider.js";
import { getIolProvider } from "../../src/services/iol/index.js";

// ============================================================
// getOperations con filtros {from?, to?, status?} (spec F3-B2,
// design D7) — retrocompatible: sin filtros devuelve lo de siempre.
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

test("MockIolProvider: sin filtros devuelve todas las operaciones (retrocompatible)", async () => {
  const provider = new MockIolProvider();
  const all = await provider.getOperations({ username: "u", password: "p" }, "423827");
  assert.ok(all.length >= 5);
});

test("MockIolProvider: filtro status accepted acota el resultado", async () => {
  const provider = new MockIolProvider();
  const accepted = await provider.getOperations({ username: "u", password: "p" }, "423827", { status: "accepted" });
  assert.ok(accepted.length > 0);
  assert.ok(accepted.every((op) => op.status === "accepted"));
});

test("MockIolProvider: filtro status sin coincidencias → []", async () => {
  const provider = new MockIolProvider();
  const rejected = await provider.getOperations({ username: "u", password: "p" }, "423827", { status: "rejected" });
  assert.deepEqual(rejected, []);
});

test("MockIolProvider: rango from/to inclusivo por fecha de operación", async () => {
  const provider = new MockIolProvider();
  const june = await provider.getOperations({ username: "u", password: "p" }, "423827", {
    from: "2026-06-01",
    to: "2026-06-30",
  });
  assert.ok(june.length > 0);
  assert.ok(june.every((op) => op.date.slice(0, 10) >= "2026-06-01" && op.date.slice(0, 10) <= "2026-06-30"));
});

test("MockIolProvider: from+to+status combinados", async () => {
  const provider = new MockIolProvider();
  const filtered = await provider.getOperations({ username: "u", password: "p" }, "423827", {
    from: "2026-03-01",
    to: "2026-12-31",
    status: "accepted",
  });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((op) => op.status === "accepted"));
});

test("IolApiProvider: sin filtros llama a /api/v2/operaciones sin query", async () => {
  let captured = "";
  const restore = stubFetch((url) => {
    captured = url;
    if (url.includes("/token")) return Response.json({ access_token: "tok-test" });
    return Response.json([]);
  });
  try {
    const provider = new IolApiProvider();
    const ops = await provider.getOperations({ username: "u", password: "p" }, "423827");
    assert.deepEqual(ops, []);
    assert.equal(captured, "https://api.invertironline.com/api/v2/operaciones");
  } finally {
    restore();
  }
});

test("IolApiProvider: filtros → fechaDesde/fechaHasta/estado como query params", async () => {
  let captured = "";
  const restore = stubFetch((url) => {
    captured = url;
    if (url.includes("/token")) return Response.json({ access_token: "tok-test" });
    return Response.json([]);
  });
  try {
    const provider = new IolApiProvider();
    await provider.getOperations({ username: "u", password: "p" }, "423827", {
      from: "2026-08-01",
      to: "2026-08-31",
      status: "accepted",
    });
    const parsed = new URL(captured);
    assert.equal(parsed.pathname, "/api/v2/operaciones");
    assert.equal(parsed.searchParams.get("fechaDesde"), "2026-08-01");
    assert.equal(parsed.searchParams.get("fechaHasta"), "2026-08-31");
    assert.equal(parsed.searchParams.get("estado"), "Aceptada");
  } finally {
    restore();
  }
});

test("IolApiProvider: solo from → solo fechaDesde", async () => {
  let captured = "";
  const restore = stubFetch((url) => {
    captured = url;
    if (url.includes("/token")) return Response.json({ access_token: "tok-test" });
    return Response.json([]);
  });
  try {
    const provider = new IolApiProvider();
    await provider.getOperations({ username: "u", password: "p" }, "423827", { from: "2026-08-01" });
    const parsed = new URL(captured);
    assert.equal(parsed.searchParams.get("fechaDesde"), "2026-08-01");
    assert.equal(parsed.searchParams.get("fechaHasta"), null);
    assert.equal(parsed.searchParams.get("estado"), null);
  } finally {
    restore();
  }
});

test("IolApiProvider: el estado se mapea al label español de IOL", async () => {
  const provider = new IolApiProvider();
  const statuses: Record<string, string> = {
    pending: "Pendiente",
    accepted: "Aceptada",
    rejected: "Rechazada",
    cancelled: "Cancelada",
  };
  for (const [status, expected] of Object.entries(statuses)) {
    let captured = "";
    const restore = stubFetch((url) => {
      captured = url;
      if (url.includes("/token")) return Response.json({ access_token: "tok-test" });
      return Response.json([]);
    });
    try {
      await provider.getOperations(
        { username: "u", password: "p" },
        "423827",
        { status: status as "pending" }
      );
      assert.equal(new URL(captured).searchParams.get("estado"), expected, `estado=${status}`);
    } finally {
      restore();
    }
  }
});

test("QuoteFallbackProvider (wrapper): reenvía los filtros al provider de cuenta", async () => {
  const prev = process.env.IOL_PROVIDER;
  process.env.IOL_PROVIDER = "api";
  let captured = "";
  const restore = stubFetch((url) => {
    captured = url;
    if (url.includes("/token")) return Response.json({ access_token: "tok-test" });
    return Response.json([]);
  });
  try {
    // getIolProvider() con IOL_PROVIDER=api devuelve QuoteFallbackProvider
    // envuelto sobre IolApiProvider: el wrapper debe pasar los filtros
    // (no silenciarlos) a getOperations del provider de cuenta.
    const provider = getIolProvider();
    await provider.getOperations({ username: "u", password: "p" }, "423827", {
      from: "2026-08-01",
      to: "2026-08-31",
      status: "accepted",
    });
    const parsed = new URL(captured);
    assert.equal(parsed.pathname, "/api/v2/operaciones");
    assert.equal(parsed.searchParams.get("fechaDesde"), "2026-08-01");
    assert.equal(parsed.searchParams.get("fechaHasta"), "2026-08-31");
    assert.equal(parsed.searchParams.get("estado"), "Aceptada");
  } finally {
    restore();
    if (prev === undefined) delete process.env.IOL_PROVIDER;
    else process.env.IOL_PROVIDER = prev;
  }
});