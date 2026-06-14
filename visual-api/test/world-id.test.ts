// World ID personhood gate (Plan 5). Proves the anti-Sybil constraint judges grade:
// (a) verify-human binds a nullifier and a SECOND account presenting the SAME
//     nullifier is rejected 409 (one human = one account);
// (b) withdraw is 403 before verification and 200 after (developer payout gate);
// (c) POST /api/campaigns is 403 before verification (advertiser KYB).
// The verifier is stubbed (injected) so no test hits the World cloud endpoint.

import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { jsonInit, makeHarness, sessionCookie } from "./helpers"
import { earnings } from "../src/db/schema"
import * as repo from "../src/db/repo"
import { createWorldIdVerifier, type WorldIdVerifier } from "../src/auth/world-id"

const A = "0x" + "1".repeat(40)
const B = "0x" + "2".repeat(40)
const NULLIFIER = "0xnullifier-human-1"

/** A stub verifier that returns the nullifier embedded in the IDKit payload — no
 *  network. Mirrors how the Dynamic verifier is injected with a local key. */
const stubVerifier: WorldIdVerifier = {
  async verify(payload) {
    const n = (payload as { nullifier_hash?: string })?.nullifier_hash
    if (!n) throw new Error("missing nullifier_hash")
    return { nullifierHash: n }
  },
}

/** Authenticate a fresh account via the Dynamic flow and return its session cookie. */
async function login(
  h: Awaited<ReturnType<typeof makeHarness>>,
  sub: string,
  address: string,
): Promise<string> {
  const jwt = await h.signDynamicJwt({ sub, address })
  const auth = await h.app.request("/api/auth/dynamic", jsonInit("POST", { dynamicJwt: jwt }))
  return sessionCookie(auth)
}

describe("World ID personhood gate", () => {
  test("verify-human binds a nullifier; a 2nd account with the SAME nullifier is 409", async () => {
    const h = await makeHarness({ worldId: { appId: "app_test", verifier: stubVerifier } })

    const cookieA = await login(h, "human-a", A)
    const first = await h.app.request(
      "/api/me/verify-human",
      jsonInit("POST", { nullifier_hash: NULLIFIER }, { cookie: cookieA }),
    )
    expect(first.status).toBe(200)
    expect((await first.json()) as unknown).toEqual({ ok: true, worldIdVerified: true })

    // GET /api/me now reflects the verified flag.
    const me = await h.app.request("/api/me", { headers: { cookie: cookieA } })
    expect(((await me.json()) as { worldIdVerified: boolean }).worldIdVerified).toBe(true)

    // The SAME account re-presenting the SAME nullifier is idempotent (still 200).
    const again = await h.app.request(
      "/api/me/verify-human",
      jsonInit("POST", { nullifier_hash: NULLIFIER }, { cookie: cookieA }),
    )
    expect(again.status).toBe(200)

    // A DIFFERENT account presenting the SAME nullifier is blocked — the anti-Sybil core.
    const cookieB = await login(h, "human-b", B)
    const conflict = await h.app.request(
      "/api/me/verify-human",
      jsonInit("POST", { nullifier_hash: NULLIFIER }, { cookie: cookieB }),
    )
    expect(conflict.status).toBe(409)
    expect((await conflict.json()) as unknown).toEqual({ ok: false, error: "already_linked" })
  })

  test("verify-human returns 503 when World ID is not configured", async () => {
    const h = await makeHarness() // no worldId dep
    const cookie = await login(h, "human-unconfigured", A)
    const res = await h.app.request(
      "/api/me/verify-human",
      jsonInit("POST", { nullifier_hash: NULLIFIER }, { cookie }),
    )
    expect(res.status).toBe(503)
    expect((await res.json()) as unknown).toEqual({ ok: false, error: "worldid_not_configured" })
  })

  test("verify-human returns 400 when the proof fails validation", async () => {
    const h = await makeHarness({ worldId: { appId: "app_test", verifier: stubVerifier } })
    const cookie = await login(h, "human-badproof", A)
    // No nullifier_hash → the stub verifier throws → 400.
    const res = await h.app.request("/api/me/verify-human", jsonInit("POST", {}, { cookie }))
    expect(res.status).toBe(400)
    expect((await res.json()) as unknown).toEqual({ ok: false, error: "verification_failed" })
  })

  test("withdraw is 403 before verification and 200 after (developer payout gate)", async () => {
    const h = await makeHarness({ worldId: { appId: "app_test", verifier: stubVerifier } })
    const cookie = await login(h, "human-dev", A)

    // Seed a non-zero balance so a successful withdraw would actually settle.
    const { id } = await repo.upsertAccountByAddress(h.db, { address: A })
    await h.db.update(earnings).set({ balanceBaseUnits: "600000" }).where(eq(earnings.accountId, id))

    const blocked = await h.app.request("/api/withdraw", jsonInit("POST", {}, { cookie }))
    expect(blocked.status).toBe(403)
    expect((await blocked.json()) as unknown).toEqual({ ok: false, error: "personhood_required" })

    // Verify, then the same withdraw settles.
    const verify = await h.app.request(
      "/api/me/verify-human",
      jsonInit("POST", { nullifier_hash: NULLIFIER }, { cookie }),
    )
    expect(verify.status).toBe(200)

    const ok = await h.app.request("/api/withdraw", jsonInit("POST", {}, { cookie }))
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as { ok: boolean; withdrawnBaseUnits: string }
    expect(body.ok).toBe(true)
    expect(body.withdrawnBaseUnits).toBe("600000")
  })

  test("POST /api/campaigns is 403 before verification (advertiser KYB)", async () => {
    const h = await makeHarness({ worldId: { appId: "app_test", verifier: stubVerifier } })
    const cookie = await login(h, "human-adv", A)

    const blocked = await h.app.request(
      "/api/campaigns",
      jsonInit(
        "POST",
        { advertiser: "Acme", text: "Acme widgets", url: "https://acme.test", budgetBaseUnits: "10000000" },
        { cookie },
      ),
    )
    expect(blocked.status).toBe(403)
    expect((await blocked.json()) as unknown).toEqual({ ok: false, error: "personhood_required" })

    // After verification the campaign is created.
    await h.app.request("/api/me/verify-human", jsonInit("POST", { nullifier_hash: NULLIFIER }, { cookie }))
    const created = await h.app.request(
      "/api/campaigns",
      jsonInit(
        "POST",
        { advertiser: "Acme", text: "Acme widgets", url: "https://acme.test", budgetBaseUnits: "10000000" },
        { cookie },
      ),
    )
    expect(created.status).toBe(200)
    expect(((await created.json()) as { campaign: { status: string } }).campaign.status).toBe("draft")
  })

  test("verifier POSTs the IDKit payload and returns the nullifier on HTTP 200", async () => {
    let capturedUrl = ""
    let capturedBody: unknown
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url)
      capturedBody = JSON.parse(String(init?.body))
      return new Response("{}", { status: 200 })
    }) as unknown as typeof fetch
    const verifier = createWorldIdVerifier({ appId: "app_xyz", action: "visualcode-account", fetchImpl })

    const { nullifierHash } = await verifier.verify({
      nullifier_hash: NULLIFIER,
      merkle_root: "0xroot",
      proof: "0xproof",
      verification_level: "orb",
    })
    expect(nullifierHash).toBe(NULLIFIER)
    expect(capturedUrl).toBe("https://developer.worldcoin.org/api/v2/verify/app_xyz")
    expect(capturedBody).toEqual({
      nullifier_hash: NULLIFIER,
      merkle_root: "0xroot",
      proof: "0xproof",
      verification_level: "orb",
      action: "visualcode-account",
    })
  })

  test("verifier throws on a non-200 (no proof leaked in the message)", async () => {
    const fetchImpl = (async () =>
      new Response("invalid proof: 0xsecret", { status: 400 })) as unknown as typeof fetch
    const verifier = createWorldIdVerifier({ appId: "app_xyz", action: "visualcode-account", fetchImpl })
    await expect(verifier.verify({ nullifier_hash: NULLIFIER })).rejects.toThrow(/HTTP 400/)
    await expect(verifier.verify({ nullifier_hash: NULLIFIER })).rejects.not.toThrow(/0xsecret/)
  })
})
