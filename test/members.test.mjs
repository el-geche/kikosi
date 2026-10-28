import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { validateHandle, generateRecoveryCode, hashRecoveryCode, verifyRecoveryCode, signSession, verifySession,
  restoreMember, restoreAllowed, LIMITS, COOKIE_MAX_AGE, ipKey } from "../lib/members.js";

const SECRET = randomBytes(48).toString("base64");
const ID = "3f2a9c1e-4b5d-4e6f-8a7b-9c0d1e2f3a4b";

test("handle validation: accepts good handles, trims", () => {
  for (const h of ["kbest", "Gor_Mahia_Fan", "Dickson254", "abc", "a".repeat(20)]) assert.equal(validateHandle(h).ok, true, h);
  assert.equal(validateHandle("  kbest ").handle, "kbest");
});
test("handle validation: rejects bad length, characters, shape, reserved and blocked words", () => {
  for (const h of ["ab", "a".repeat(21), "", null, 42, "has space", "emoji😀x", "dash-name", "_lead", "trail_", "dou__ble", "123456",
    "admin", "Kikosi", "ADM1N", "fuck_this", "fu_ck", "5hit_head", "sh1tty", "malaya", "casino_king", "mpesa_boss"])
    assert.equal(validateHandle(h).ok, false, String(h));
});
test("recovery code format and uniqueness", () => {
  const c = generateRecoveryCode();
  assert.match(c, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  assert.notEqual(c, generateRecoveryCode());
});
test("recovery code hashing: salted, verifies, normalises case/spacing, rejects wrong", () => {
  const c = generateRecoveryCode(), h1 = hashRecoveryCode(c), h2 = hashRecoveryCode(c);
  assert.notEqual(h1, h2); assert.ok(!h1.includes(c.replace(/-/g, "")));
  assert.match(h1, /^scrypt\$[\w-]+\$[\w-]+$/);
  assert.equal(verifyRecoveryCode(c, h1), true);
  assert.equal(verifyRecoveryCode(c.toLowerCase().replace(/-/g, " "), h1), true);
  assert.equal(verifyRecoveryCode(generateRecoveryCode(), h1), false);
  assert.equal(verifyRecoveryCode("", h1), false);
  assert.equal(verifyRecoveryCode(c, "garbage"), false);
});
test("session cookie: round-trips, rejects tampering, wrong secret and expiry", () => {
  const now = Date.now(), v = signSession(ID, SECRET, now);
  assert.equal(verifySession(v, SECRET, now), ID);
  const [a, , c, d] = v.split(".");
  assert.equal(verifySession(`${a}.00000000-0000-4000-8000-000000000000.${c}.${d}`, SECRET, now), null);
  assert.equal(verifySession(v.slice(0, -2) + "xx", SECRET, now), null);
  assert.equal(verifySession(v, randomBytes(48).toString("base64"), now), null);
  assert.equal(verifySession(v, SECRET, now + (COOKIE_MAX_AGE + 60) * 1000), null);
  assert.equal(verifySession("nonsense", SECRET), null); assert.equal(verifySession(undefined, SECRET), null);
  assert.throws(() => signSession(ID, "short"));
});
test("ipKey hashes IPs (never stores raw)", () => {
  const k = ipKey("196.201.214.10", SECRET);
  assert.ok(!k.includes("196")); assert.equal(k, ipKey("196.201.214.10", SECRET)); assert.notEqual(k, ipKey("196.201.214.11", SECRET));
});

function memStore(members) {
  const attempts = [];
  return {
    async countFailures(kind, key, since) { return attempts.filter((a) => a.kind === kind && a.key === key && !a.ok && a.at > since).length; },
    async recordAttempt(kind, key, ok) { attempts.push({ kind, key, ok, at: Date.now() }); },
    async findByHandle(h) { return members.find((m) => m.handle.toLowerCase() === h) || null; },
  };
}
test("restore: right code signs in, wrong code is 401, handle is case-insensitive", async () => {
  const code = generateRecoveryCode(), s = memStore([{ id: ID, handle: "Kbest", recovery_hash: hashRecoveryCode(code), banned: false }]);
  assert.equal((await restoreMember(s, { handle: "KBEST", code, ip: "ip1" })).status, 200);
  assert.equal((await restoreMember(s, { handle: "kbest", code: generateRecoveryCode(), ip: "ip1" })).status, 401);
  assert.equal((await restoreMember(s, { handle: "nobody", code, ip: "ip1" })).status, 401);
  assert.equal((await restoreMember(s, { handle: "", code, ip: "ip1" })).status, 400);
});
test("restore rate limit: 5 failures per handle per 15 min, then 429 even with the right code; resets after window", async () => {
  const code = generateRecoveryCode();
  const members = [{ id: ID, handle: "kbest", recovery_hash: hashRecoveryCode(code), banned: false }];
  const attempts = []; let clock = Date.parse("2026-10-28T09:00:00Z");
  const s = { async countFailures(k, key, since) { return attempts.filter((a) => a.k === k && a.key === key && !a.ok && a.at > since).length; },
    async recordAttempt(k, key, ok) { attempts.push({ k, key, ok, at: clock }); }, async findByHandle(h) { return members.find((m) => m.handle === h) || null; } };
  for (let i = 0; i < LIMITS.restoreHandle.max; i++) assert.equal((await restoreMember(s, { handle: "kbest", code: "WRONG-CODE-0000-0000", ip: `ip${i}` }, clock)).status, 401);
  const blocked = await restoreMember(s, { handle: "kbest", code, ip: "fresh-ip" }, clock);
  assert.equal(blocked.status, 429); assert.ok(blocked.retryAfter > 0);
  clock += LIMITS.restoreHandle.windowMs + 1000;
  assert.equal((await restoreMember(s, { handle: "kbest", code, ip: "fresh-ip" }, clock)).status, 200);
});
test("restore rate limit: 20 failures per IP per hour across handles", async () => {
  assert.equal(restoreAllowed({ handleFails: 0, ipFails: LIMITS.restoreIp.max - 1 }).ok, true);
  assert.equal(restoreAllowed({ handleFails: 0, ipFails: LIMITS.restoreIp.max }).ok, false);
  assert.equal(restoreAllowed({ handleFails: LIMITS.restoreHandle.max, ipFails: 0 }).ok, false);
});
test("restore: banned members cannot restore", async () => {
  const code = generateRecoveryCode(), attempts = [];
  const s = { async countFailures() { return 0; }, async recordAttempt(...a) { attempts.push(a); },
    async findByHandle() { return { id: ID, handle: "bad", recovery_hash: hashRecoveryCode(code), banned: true }; } };
  assert.equal((await restoreMember(s, { handle: "bad", code, ip: "x" })).status, 401);
});
