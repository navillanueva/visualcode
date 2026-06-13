import { describe, expect, test } from "bun:test"
import { createKickbackClient, parseServedAd, parseEarnings } from "../src/client"

const OPTS = { baseUrl: "https://api.example.test/", token: "dev-token-123" }

interface Captured {
  url: string
  init?: RequestInit
}

/** Build a fetch stub that returns one canned response, capturing the last request. */
function stubFetch(responder: (url: string, init?: RequestInit) => Response): {
  fetch: typeof fetch
  last(): Captured
} {
  let captured: Captured | undefined
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    captured = { url, init }
    return responder(url, init)
  }) as typeof fetch
  return {
    fetch: fn,
    last() {
      if (!captured) throw new Error("fetch was not called")
      return captured
    },
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("parseServedAd", () => {
  test("parses a well-formed ad", () => {
    expect(parseServedAd({ id: "c1", advertiser: "Acme", text: "Buy", url: "https://x" })).toEqual({
      id: "c1",
      advertiser: "Acme",
      text: "Buy",
      url: "https://x",
    })
  })

  test("null is a valid empty slot", () => {
    expect(parseServedAd(null)).toBeNull()
  })

  test("missing field is malformed (undefined, distinct from null)", () => {
    expect(parseServedAd({ id: "c1", advertiser: "Acme", text: "Buy" })).toBeUndefined()
    expect(parseServedAd("nope")).toBeUndefined()
  })
})

describe("parseEarnings", () => {
  test("parses base-unit strings + counts", () => {
    expect(
      parseEarnings({ balanceBaseUnits: "1500000", impressions: 42, clicks: 3, walletAddress: "0xabc" }),
    ).toEqual({ balanceBaseUnits: 1_500_000n, impressions: 42, clicks: 3, walletAddress: "0xabc" })
  })

  test("missing balance or wallet is malformed", () => {
    expect(parseEarnings({ impressions: 1, walletAddress: "0xabc" })).toBeUndefined()
    expect(parseEarnings({ balanceBaseUnits: "1", impressions: 1 })).toBeUndefined()
  })

  test("a non-integer base-units string is rejected", () => {
    expect(parseEarnings({ balanceBaseUnits: "1.5", walletAddress: "0xabc" })).toBeUndefined()
  })
})

describe("createKickbackClient — serveAd", () => {
  test("normalizes baseUrl, sends bearer token, parses the ad", async () => {
    const { fetch, last } = stubFetch(() =>
      json({ ad: { id: "c1", advertiser: "Acme", text: "Ship faster", url: "https://acme" } }),
    )
    const client = createKickbackClient({ ...OPTS, fetch })
    const res = await client.serveAd()
    expect(res).toEqual({ ok: true, ad: { id: "c1", advertiser: "Acme", text: "Ship faster", url: "https://acme" } })
    // Trailing slash trimmed (no double slash) and bearer header present.
    expect(last().url).toBe("https://api.example.test/api/ad/serve")
    expect((last().init?.headers as Record<string, string>).Authorization).toBe("Bearer dev-token-123")
  })

  test("explicit null ad is a valid empty slot, not a failure", async () => {
    const { fetch } = stubFetch(() => json({ ad: null }))
    const res = await createKickbackClient({ ...OPTS, fetch }).serveAd()
    expect(res).toEqual({ ok: true, ad: null })
  })

  test("network error → unavailable (never throws)", async () => {
    const { fetch } = stubFetch(() => {
      throw new Error("ECONNREFUSED")
    })
    const res = await createKickbackClient({ ...OPTS, fetch }).serveAd()
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe("unavailable")
      expect(res.message).toContain("ECONNREFUSED")
    }
  })

  test("HTTP 401 → unavailable", async () => {
    const { fetch } = stubFetch(() => json({ error: "unauthorized" }, 401))
    const res = await createKickbackClient({ ...OPTS, fetch }).serveAd()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toContain("401")
  })

  test("malformed ad payload → unavailable", async () => {
    const { fetch } = stubFetch(() => json({ ad: { id: "c1" } }))
    const res = await createKickbackClient({ ...OPTS, fetch }).serveAd()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toContain("malformed")
  })
})

describe("createKickbackClient — reportImpressions", () => {
  test("POSTs adId+count and returns credited base units", async () => {
    const { fetch, last } = stubFetch(() => json({ ok: true, creditedBaseUnits: "2500" }))
    const res = await createKickbackClient({ ...OPTS, fetch }).reportImpressions({ adId: "c1", count: 5 })
    expect(res).toEqual({ ok: true, creditedBaseUnits: 2500n })
    expect(last().init?.method).toBe("POST")
    expect(JSON.parse(last().init?.body as string)).toEqual({ adId: "c1", count: 5 })
  })

  test("missing creditedBaseUnits defaults to 0n (still ok)", async () => {
    const { fetch } = stubFetch(() => json({ ok: true }))
    const res = await createKickbackClient({ ...OPTS, fetch }).reportImpressions({ adId: "c1", count: 1 })
    expect(res).toEqual({ ok: true, creditedBaseUnits: 0n })
  })

  test("network error → unavailable", async () => {
    const { fetch } = stubFetch(() => {
      throw new Error("offline")
    })
    const res = await createKickbackClient({ ...OPTS, fetch }).reportImpressions({ adId: "c1", count: 1 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("unavailable")
  })
})

describe("createKickbackClient — getEarnings", () => {
  test("parses earnings", async () => {
    const { fetch } = stubFetch(() =>
      json({ balanceBaseUnits: "1000000", impressions: 10, clicks: 2, walletAddress: "0xdev" }),
    )
    const res = await createKickbackClient({ ...OPTS, fetch }).getEarnings()
    expect(res).toEqual({
      ok: true,
      earnings: { balanceBaseUnits: 1_000_000n, impressions: 10, clicks: 2, walletAddress: "0xdev" },
    })
  })

  test("malformed earnings → unavailable", async () => {
    const { fetch } = stubFetch(() => json({ impressions: 1 }))
    const res = await createKickbackClient({ ...OPTS, fetch }).getEarnings()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toContain("malformed")
  })

  test("HTTP 500 → unavailable", async () => {
    const { fetch } = stubFetch(() => json({}, 500))
    const res = await createKickbackClient({ ...OPTS, fetch }).getEarnings()
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toContain("500")
  })
})
