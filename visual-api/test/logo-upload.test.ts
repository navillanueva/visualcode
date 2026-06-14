// Advertiser logo upload: a logo is now an uploaded image carried inline as a
// base64 data URL (stored in campaigns.logo_url), so these assert the data-URL
// path round-trips into the DB while the safety rails (raster-only, size cap,
// no script payloads) still reject everything they should.

import { beforeAll, describe, expect, test } from "bun:test"
import { jsonInit, makeHarness, sessionCookie, type TestHarness } from "./helpers"

const ADV = "0x" + "a".repeat(40)
// A real 1×1 transparent PNG — valid base64, passes the raster data-URL check.
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

let h: TestHarness
let advCookie: string

beforeAll(async () => {
  h = await makeHarness()
  const jwt = await h.signDynamicJwt({ sub: "adv-logo", address: ADV })
  const auth = await h.app.request("/api/auth/dynamic", jsonInit("POST", { dynamicJwt: jwt }))
  advCookie = sessionCookie(auth)
})

function createCampaign(logoUrl: unknown) {
  return h.app.request(
    "/api/campaigns",
    jsonInit(
      "POST",
      {
        advertiser: "Acme",
        text: "Acme builds widgets — try it",
        url: "https://acme.test",
        bidBaseUnits: "1000000",
        budgetBaseUnits: "10000000",
        ...(logoUrl === undefined ? {} : { logoUrl }),
      },
      { cookie: advCookie },
    ),
  )
}

describe("advertiser logo upload (base64 data URL)", () => {
  test("accepts an uploaded PNG and persists it to the database", async () => {
    const res = await createCampaign(PNG_DATA_URL)
    expect(res.status).toBe(200)
    const { campaign } = (await res.json()) as { campaign: { id: string; logoUrl: string | null } }
    expect(campaign.logoUrl).toBe(PNG_DATA_URL)

    // Round-trip: read it back through the list endpoint (proves it's in the DB,
    // not just echoed from the request).
    const list = await h.app.request("/api/campaigns", { headers: { cookie: advCookie } })
    const { campaigns } = (await list.json()) as { campaigns: Array<{ id: string; logoUrl: string | null }> }
    expect(campaigns.find((x) => x.id === campaign.id)?.logoUrl).toBe(PNG_DATA_URL)
  })

  test("still accepts an http(s) URL (regression)", async () => {
    const res = await createCampaign("https://acme.dev/logo.png")
    expect(res.status).toBe(200)
  })

  test("still accepts a root-relative URL (regression)", async () => {
    const res = await createCampaign("/ads/dynamic.png")
    expect(res.status).toBe(200)
  })

  test("rejects an SVG data URL (script-injection vector)", async () => {
    const res = await createCampaign("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")
    expect(res.status).toBe(400)
  })

  test("rejects a javascript: URL", async () => {
    const res = await createCampaign("javascript:alert(1)")
    expect(res.status).toBe(400)
  })

  test("rejects an oversized image (over the ~200KB cap)", async () => {
    const oversized = "data:image/png;base64," + "A".repeat(300_001)
    const res = await createCampaign(oversized)
    expect(res.status).toBe(413)
  })
})
