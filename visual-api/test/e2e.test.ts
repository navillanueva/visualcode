// End-to-end against the mocks (deterministic, in-process): advertiser imports
// identity → creates + funds a campaign → developer connects a device token →
// TUI serves the ad → reports impressions → earnings rise → withdraw zeroes them,
// and the advertiser's spend is reflected. Exercises every CONTRACT.md endpoint.

import { beforeAll, describe, expect, test } from "bun:test"
import { jsonInit, makeHarness, sessionCookie, type TestHarness } from "./helpers"

const ADV = "0x" + "a".repeat(40)
const DEV = "0x" + "b".repeat(40)

let h: TestHarness
let advCookie: string
let devCookie: string
let deviceToken: string
let campaignId: string

beforeAll(async () => {
  h = await makeHarness()
})

describe("full money loop (mock providers)", () => {
  test("health reports mock settlement", async () => {
    const res = await h.app.request("/health")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; settlement: { mode: string } }
    expect(body.ok).toBe(true)
    expect(body.settlement.mode).toBe("mock")
  })

  test("advertiser authenticates via Dynamic JWT", async () => {
    const jwt = await h.signDynamicJwt({ sub: "adv-1", address: ADV })
    const res = await h.app.request("/api/auth/dynamic", jsonInit("POST", { dynamicJwt: jwt }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { address: string; ok: boolean }
    expect(body.ok).toBe(true)
    expect(body.address).toBe(ADV)
    advCookie = sessionCookie(res)
  })

  test("advertiser creates and funds a campaign", async () => {
    const create = await h.app.request(
      "/api/campaigns",
      jsonInit(
        "POST",
        {
          advertiser: "Acme",
          text: "Acme builds widgets — try it",
          url: "https://acme.test",
          bidBaseUnits: "1000000", // 1 USDC per 1,000 impressions
          budgetBaseUnits: "10000000", // 10 USDC
        },
        { cookie: advCookie },
      ),
    )
    expect(create.status).toBe(200)
    const { campaign } = (await create.json()) as { campaign: { id: string; status: string } }
    campaignId = campaign.id
    expect(campaign.status).toBe("draft")

    // Not served until funded.
    const fund = await h.app.request(`/api/campaigns/${campaignId}/fund`, jsonInit("POST", {}, { cookie: advCookie }))
    expect(fund.status).toBe(200)
    const funded = (await fund.json()) as { campaign: { status: string }; txRef: string }
    expect(funded.campaign.status).toBe("active")
    expect(funded.txRef).toMatch(/^mock-fund:/)
  })

  test("developer authenticates and mints a device token", async () => {
    const jwt = await h.signDynamicJwt({ sub: "dev-1", address: DEV })
    const auth = await h.app.request("/api/auth/dynamic", jsonInit("POST", { dynamicJwt: jwt }))
    devCookie = sessionCookie(auth)

    const res = await h.app.request("/api/device-tokens", jsonInit("POST", {}, { cookie: devCookie }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { token: string }
    expect(body.token).toMatch(/^vc_dt_/)
    deviceToken = body.token
  })

  test("session token authenticates web routes via Authorization (no cookie)", async () => {
    // The deployed web app is a different host than the API, so it can't rely on a
    // cross-site cookie — it sends the returned session token as a Bearer header.
    const jwt = await h.signDynamicJwt({ sub: "dev-2", address: "0x" + "c".repeat(40) })
    const auth = await h.app.request("/api/auth/dynamic", jsonInit("POST", { dynamicJwt: jwt }))
    const { session } = (await auth.json()) as { session?: string }
    expect(session).toBeTruthy()

    const res = await h.app.request(
      "/api/device-tokens",
      jsonInit("POST", {}, { Authorization: `Bearer ${session}` }),
    )
    expect(res.status).toBe(200)
    expect(((await res.json()) as { token: string }).token).toMatch(/^vc_dt_/)
  })

  test("TUI serves the funded campaign as the auction winner", async () => {
    const res = await h.app.request("/api/ad/serve", { headers: { Authorization: `Bearer ${deviceToken}` } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ad: { id: string; advertiser: string; text: string; url: string } | null }
    expect(body.ad).not.toBeNull()
    expect(body.ad?.id).toBe(campaignId)
    expect(body.ad?.advertiser).toBe("Acme")
  })

  test("reporting impressions credits the developer 50%", async () => {
    // 120 = the per-request impression cap (10 min of 5s views).
    const res = await h.app.request(
      "/api/impressions",
      jsonInit("POST", { adId: campaignId, count: 120 }, { Authorization: `Bearer ${deviceToken}` }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; creditedBaseUnits: string }
    expect(body.ok).toBe(true)
    // charge = floor(1,000,000 * 120 / 1,000) = 120,000; dev gets 50% = 60,000.
    expect(body.creditedBaseUnits).toBe("60000")
    expect(/^\d+$/.test(body.creditedBaseUnits)).toBe(true) // integer base-units string (TUI client contract)
  })

  test("earnings reflect the credit (TUI bearer view)", async () => {
    const res = await h.app.request("/api/me/earnings", { headers: { Authorization: `Bearer ${deviceToken}` } })
    const body = (await res.json()) as {
      balanceBaseUnits: string
      impressions: number
      clicks: number
      walletAddress: string
    }
    expect(body.balanceBaseUnits).toBe("60000")
    expect(body.impressions).toBe(120)
    expect(body.clicks).toBe(0)
    expect(body.walletAddress).toBe(DEV)
  })

  test("advertiser sees spend reflected", async () => {
    const res = await h.app.request("/api/campaigns", { headers: { cookie: advCookie } })
    const body = (await res.json()) as {
      campaigns: { id: string; budgetRemainingBaseUnits: string; spendBaseUnits: string }[]
    }
    const c = body.campaigns.find((x) => x.id === campaignId)
    expect(c?.budgetRemainingBaseUnits).toBe("9880000")
    expect(c?.spendBaseUnits).toBe("120000")
  })

  test("GET /api/me reports balance + role for the developer", async () => {
    const res = await h.app.request("/api/me", { headers: { cookie: devCookie } })
    const body = (await res.json()) as { address: string; balanceBaseUnits: string; role: string }
    expect(body.address).toBe(DEV)
    expect(body.balanceBaseUnits).toBe("60000")
    expect(body.role).toBe("developer")
  })

  test("withdraw settles earnings and zeroes the balance", async () => {
    const res = await h.app.request("/api/withdraw", jsonInit("POST", {}, { cookie: devCookie }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; withdrawnBaseUnits: string; txRef: string }
    expect(body.ok).toBe(true)
    expect(body.withdrawnBaseUnits).toBe("60000")
    expect(body.txRef).toMatch(/^mock-withdraw:/)

    const after = await h.app.request("/api/me/earnings", { headers: { Authorization: `Bearer ${deviceToken}` } })
    const earnings = (await after.json()) as { balanceBaseUnits: string }
    expect(earnings.balanceBaseUnits).toBe("0")
  })

  test("unauthenticated + unauthorized requests are rejected", async () => {
    expect((await h.app.request("/api/ad/serve")).status).toBe(401) // no bearer
    expect((await h.app.request("/api/me", { headers: { cookie: "vc_session=garbage" } })).status).toBe(401)
    expect((await h.app.request("/api/campaigns")).status).toBe(401) // no session
  })
})
