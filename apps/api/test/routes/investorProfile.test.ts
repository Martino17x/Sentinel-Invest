import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../../src/lib/jwt.js";
import investorProfileRouter from "../../src/interfaces/http/routes/investorProfile.js";
import agentRouter from "../../src/interfaces/http/routes/agent.js";
import portfolioRouter from "../../src/interfaces/http/routes/portfolio.js";
import { db, schema } from "../../src/db/index.js";

const USER_ID = randomUUID();
const EMAIL = "investor-profile-test@sentinel.local";
const OTHER_ID = randomUUID();
const OTHER_EMAIL = "other@sentinel.local";

let server: import("node:http").Server;
let base: string;
let token: string;
let otherToken: string;

before(async () => {
  await db.insert(schema.users).values({ id: USER_ID, email: EMAIL, passwordHash: "x" });
  await db.insert(schema.users).values({ id: OTHER_ID, email: OTHER_EMAIL, passwordHash: "x" });
  // portfolio proposals/agents need account? gate tests use real user without account — 428 before account check.
  // For /proposals we need account to pass getAccountForUser after gate; insert minimal account for USER_ID
  await db.insert(schema.accounts).values({ id: randomUUID(), userId: USER_ID, iolAccountNumber: `INV-${USER_ID.slice(0, 6)}`, currency: "ARS" }).catch(() => undefined);

  token = signAccessToken(USER_ID, EMAIL);
  otherToken = signAccessToken(OTHER_ID, OTHER_EMAIL);

  const app = express();
  app.use(express.json());
  app.use("/api/investor-profile", investorProfileRouter);
  app.use("/api/agent", agentRouter);
  app.use("/api/portfolio", portfolioRouter);
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.delete(schema.portfolioProposals).where(eq(schema.portfolioProposals.userId, USER_ID)).catch(() => undefined);
  await db.delete(schema.investorProfiles).where(eq(schema.investorProfiles.userId, USER_ID)).catch(() => undefined);
  await db.delete(schema.investorProfiles).where(eq(schema.investorProfiles.userId, OTHER_ID)).catch(() => undefined);
  await db.delete(schema.accounts).where(eq(schema.accounts.userId, USER_ID)).catch(() => undefined);
  await db.delete(schema.accounts).where(eq(schema.accounts.userId, OTHER_ID)).catch(() => undefined);
  await db.delete(schema.users).where(eq(schema.users.id, USER_ID)).catch(() => undefined);
  await db.delete(schema.users).where(eq(schema.users.id, OTHER_ID)).catch(() => undefined);
});

async function req(method: string, path: string, body?: unknown, tk = token) {
  const headers: Record<string, string> = {};
  if (tk) headers.Authorization = `Bearer ${tk}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  return res;
}

test("401 sin token en POST /api/investor-profile", async () => {
  const res = await req("POST", "/api/investor-profile", { answers: Array(12).fill(1) }, "");
  assert.equal(res.status, 401);
});

test("400 Zod: menos de 12 respuestas", async () => {
  const res = await req("POST", "/api/investor-profile", { answers: [1, 2, 3] });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { issues: unknown[] };
  assert.ok(body.issues);
});

test("200 POST upsert crea perfil (version 1) + GET own 200", async () => {
  const res = await req("POST", "/api/investor-profile", { answers: Array(12).fill(4) });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { profile: { riskScore: number; profileVersion: number; riskTolerance: string } };
  assert.ok(body.profile.riskScore >= 0 && body.profile.riskScore <= 100);
  assert.equal(body.profile.profileVersion, 1);
  assert.equal(body.profile.riskTolerance, "agresivo");

  const get = await req("GET", "/api/investor-profile");
  assert.equal(get.status, 200);
  const gbody = (await get.json()) as { profile: { riskScore: number } };
  assert.equal(gbody.profile.riskScore, body.profile.riskScore);
});

test("200 segundo POST incrementa profile_version a 2", async () => {
  const res = await req("POST", "/api/investor-profile", { answers: Array(12).fill(0) });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { profile: { profileVersion: number } };
  assert.equal(body.profile.profileVersion, 2);
});

test("GET /:userId 403 si no admin y distinto user", async () => {
  const res = await req("GET", `/api/investor-profile/${OTHER_ID}`);
  assert.equal(res.status, 403);
});

test("GET own con alias /:userId 200 (self)", async () => {
  const res = await req("GET", `/api/investor-profile/${USER_ID}`);
  assert.equal(res.status, 200);
});

test("Gate 428 sin perfil (other user) en POST /api/agent/analyze-exhaustive", async () => {
  const res = await req("POST", "/api/agent/analyze-exhaustive", {}, otherToken);
  assert.equal(res.status, 428);
  const body = (await res.json()) as { error: string; next: string };
  assert.equal(body.error, "profile_required");
  assert.equal(body.next, "/investor-profile");
});

test("Gate libera tras perfil: POST /api/agent/analyze-exhaustive 200", async () => {
  const res = await req("POST", "/api/agent/analyze-exhaustive", {});
  assert.equal(res.status, 200);
  const body = (await res.json()) as { profile: { risk_tolerance: string } | null };
  assert.ok(body.profile);
  assert.ok(["conservador", "moderado", "agresivo"].includes(body.profile!.risk_tolerance));
});

test("Gate 428 sin perfil en POST /api/portfolio/proposals", async () => {
  const res = await req("POST", "/api/portfolio/proposals", {}, otherToken);
  assert.equal(res.status, 428);
});

test("Gate libera en POST /api/portfolio/proposals 201 tras perfil", async () => {
  const res = await req("POST", "/api/portfolio/proposals", {});
  assert.equal(res.status, 201);
  const body = (await res.json()) as { proposal: { id: string } };
  assert.ok(body.proposal.id);
});

test("GET /api/investor-profile sin perfil → 404 con next", async () => {
  const res = await req("GET", "/api/investor-profile", undefined, otherToken);
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string; next: string };
  assert.equal(body.error, "profile_not_found");
  assert.equal(body.next, "/investor-profile");
});

test("GET /api/investor-profile/:userId 400 si uuid inválido", async () => {
  const res = await req("GET", "/api/investor-profile/not-a-uuid");
  assert.equal(res.status, 400);
});
