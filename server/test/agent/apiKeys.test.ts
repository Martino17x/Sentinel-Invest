import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  API_KEY_PREFIX,
  createApiKey,
  findApiKeyBySecret,
  generateApiKey,
  hashApiKey,
  revokeApiKey,
  timingSafeEqualStrings,
} from "../../src/services/agent/apiKeys.js";
import { createTestUser, deleteTestUser } from "./helpers.js";

test("generateApiKey: prefijo sk-sentinel-, secreto con 32B base64url", () => {
  const { secret, prefix, hash } = generateApiKey();
  assert.ok(secret.startsWith(API_KEY_PREFIX));
  assert.ok(prefix.startsWith(API_KEY_PREFIX));
  assert.equal(prefix.length, API_KEY_PREFIX.length + 4);
  assert.equal(hash, hashApiKey(secret));
  assert.equal(hash.length, 64); // sha256 hex
});

test("hashApiKey: determinístico y nunca guarda el secreto", () => {
  const { secret } = generateApiKey();
  const h1 = hashApiKey(secret);
  const h2 = hashApiKey(secret);
  assert.equal(h1, h2);
  assert.ok(!h1.includes(secret));
});

test("timingSafeEqualStrings: iguales → true; distintos → false; largo distinto → false", () => {
  assert.equal(timingSafeEqualStrings("abc", "abc"), true);
  assert.equal(timingSafeEqualStrings("abc", "abd"), false);
  assert.equal(timingSafeEqualStrings("abc", "abcd"), false);
  assert.equal(timingSafeEqualStrings("", ""), true);
});

test("findApiKeyBySecret: ciclo create → find (scope) → revoke → null (requiere BD local)", async () => {
  const userId = await createTestUser("u-apitest");
  try {
    const { row, secret } = await createApiKey(userId, "test-g2", "trade");
    const found = await findApiKeyBySecret(secret);
    assert.ok(found);
    assert.equal(found!.userId, userId);
    assert.equal(found!.scope, "trade");
    assert.equal(found!.id, row.id);

    // secreto distinto → null; prefijo inválido → null
    assert.equal(await findApiKeyBySecret(secret + "x"), null);
    assert.equal(await findApiKeyBySecret("bearer-otra-cosa"), null);

    await revokeApiKey(row.id, userId);
    assert.equal(await findApiKeyBySecret(secret), null, "revocada → 401");
  } finally {
    await deleteTestUser(userId);
  }
});
