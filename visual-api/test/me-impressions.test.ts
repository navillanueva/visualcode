// GET /api/me/impressions (session-authed developer earnings ledger) + the fixed
// $10/1,000 pricing lock on POST /api/campaigns. App + PGlite + mock settlement,
// driven end to end: advertiser funds a campaign, a developer reports impressions,
// then reads back their own ledger with the per-row 50% credit.

import { beforeAll, describe, expect, test } from "bun:test"
import { jsonInit, makeHarness, sessionCookie, type TestHarness } from "./helpers"

const ADV = "0x" + "d".repeat(40)
const DEV = "0x" + "e".repeat(40)

// $10 per 1,000 views in default USDC base units (6dp) = 10 * 10^6.
const FIXED_BID = "10000000"

let h: TestHarness
let advCookie: string
let devCookie: string
let deviceToken: string
let campaignId: string

async function authCookie(sub: string, address: string): Promise<string> {
  const jwt = await h.signDynamicJwt({ sub, address })
  return sessionCookie(await h.app.request("/api/auth/dynamic", jsonInit("POST", { dynamicJwt: jwt })))
}

beforeAll(async () => {
  h = await makeHarness()

  // Advertiser: authenticate, create a campaign (with a bogus client bid that must
  // be overridden), fund it so it serves.
  advCookie = await authCookie("adv-imp", ADV)
  const create = await h.app.request(
    "/api/campaigns",
    jsonInit(
      "POST",
      { advertiser: "Globex", text: "Globex — ship faster", url: "https://globex.test", bidBaseUnits: "1", budgetBaseUnits: "10000000" },
      { cookie: advCookie },
    ),
  )
  campaignId = ((await create.json()) as { campaign: { id: string } }).campaign.id
  await h.app.request(
    `/api/campaigns/${campaignId}/fund`,
    jsonInit("POST", { paymentTxHash: "0x" + "2".repeat(64) }, { cookie: advCookie }),
  )

  // Developer: session cookie (for /api/me/*) + a device token (bearer, for reporting).
  devCookie = await authCookie("dev-imp", DEV)
  const tokRes = await h.app.request("/api/device-tokens", jsonInit("POST", {}, { cookie: devCookie }))
  deviceToken = ((await tokRes.json()) as { token: string }).token

  // Two batches (100 then 20) — both under the 120/request + 600/window caps, so
  // each is credited in full and the ledger has more than one row.
  for (const count of [100, 20]) {
    await h.app.request(
      "/api/impressions",
      jsonInit("POST", { adId: campaignId, count }, { Authorization: `Bearer ${deviceToken}` }),
    )
  }
})

interface ImpressionRow {
  campaignId: string
  advertiser: string
  text: string
  count: number
  creditedBaseUnits: string
  createdAt: string
}

describe("GET /api/me/impressions", () => {
  test("returns the session dev's own rows with correct creditedBaseUnits", async () => {
    const res = await h.app.request("/api/me/impressions", { headers: { cookie: devCookie } })
    expect(res.status).toBe(200)
    const { impressions } = (await res.json()) as { impressions: ImpressionRow[] }
    expect(impressions.length).toBe(2)

    // Per-row 50% credit at the fixed bid (10,000,000 / 1,000 = 10,000 per view):
    //   count 100 → charge 1,000,000 → credit   500,000
    //   count  20 → charge   200,000 → credit   100,000
    const byCount = new Map(impressions.map((r) => [r.count, r]))
    expect(byCount.get(100)?.creditedBaseUnits).toBe("500000")
    expect(byCount.get(20)?.creditedBaseUnits).toBe("100000")

    // Joined campaign fields + integer base-unit wire shape.
    for (const row of impressions) {
      expect(row.campaignId).toBe(campaignId)
      expect(row.advertiser).toBe("Globex")
      expect(row.text).toBe("Globex — ship faster")
      expect(/^\d+$/.test(row.creditedBaseUnits)).toBe(true)
    }
  })

  test("orders newest first", async () => {
    const res = await h.app.request("/api/me/impressions", { headers: { cookie: devCookie } })
    const { impressions } = (await res.json()) as { impressions: ImpressionRow[] }
    const times = impressions.map((r) => new Date(r.createdAt).getTime())
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1]!).toBeGreaterThanOrEqual(times[i]!)
    }
  })

  test("honours ?limit (clamped) and defaults to 50", async () => {
    const limited = await h.app.request("/api/me/impressions?limit=1", { headers: { cookie: devCookie } })
    expect(((await limited.json()) as { impressions: ImpressionRow[] }).impressions.length).toBe(1)

    // Invalid + over-max values fall back to the default / cap rather than erroring.
    for (const q of ["limit=abc", "limit=0", "limit=99999"]) {
      const res = await h.app.request(`/api/me/impressions?${q}`, { headers: { cookie: devCookie } })
      expect(res.status).toBe(200)
      expect(((await res.json()) as { impressions: ImpressionRow[] }).impressions.length).toBe(2)
    }
  })

  test("is session-authed: no session is rejected", async () => {
    expect((await h.app.request("/api/me/impressions")).status).toBe(401)
  })

  test("scopes rows to the caller (an advertiser with no impressions sees none)", async () => {
    const res = await h.app.request("/api/me/impressions", { headers: { cookie: advCookie } })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { impressions: ImpressionRow[] }).impressions.length).toBe(0)
  })
})

describe("fixed $10/1,000 pricing on POST /api/campaigns", () => {
  async function createWith(body: Record<string, unknown>): Promise<{ status: number; bid?: string }> {
    const res = await h.app.request("/api/campaigns", jsonInit("POST", body, { cookie: advCookie }))
    if (res.status !== 200) return { status: res.status }
    const { campaign } = (await res.json()) as { campaign: { bidBaseUnits: string } }
    return { status: res.status, bid: campaign.bidBaseUnits }
  }

  const base = { advertiser: "Initech", text: "Initech ad", url: "https://initech.test", budgetBaseUnits: "5000000" }

  test("overrides a client-supplied bid with the fixed bid", async () => {
    expect((await createWith({ ...base, bidBaseUnits: "1" })).bid).toBe(FIXED_BID)
    expect((await createWith({ ...base, bidBaseUnits: "999999999" })).bid).toBe(FIXED_BID)
  })

  test("applies the fixed bid even when the client omits bidBaseUnits", async () => {
    expect((await createWith(base)).bid).toBe(FIXED_BID)
  })

  test("still requires advertiser/text/url/budget", async () => {
    expect((await createWith({ advertiser: "X", text: "y", url: "https://x.test" })).status).toBe(400)
  })
})
