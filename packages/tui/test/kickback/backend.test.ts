import { afterEach, describe, expect, test } from "bun:test"
import type { KickbackClient } from "@kickback-ai/providers"
import * as Backend from "../../src/kickback/backend"
import type { PollingTimers } from "../../src/kickback/backend"
import { adStore, SAMPLE_AD, adFromServed } from "../../src/kickback/ad-store"
import { startViewTracking, type ViewTrackingTimers } from "../../src/kickback/view-tracking"
import { buildRevenueView, fetchBackendEarnings } from "../../src/kickback/revenue"

// Verifies the graceful-degradation contract: with NO client configured the ad
// surfaces behave exactly as the offline mock (SAMPLE_AD, no reporting), and with a
// client they swap the ad source + report impressions + read backend earnings.

afterEach(() => {
  Backend.__resetForTest()
  adStore.setAd(SAMPLE_AD)
})

function fakeClient(overrides: Partial<KickbackClient> = {}): KickbackClient {
  return {
    serveAd: async () => ({ ok: true, ad: null }),
    reportImpressions: async () => ({ ok: true, creditedBaseUnits: 0n }),
    getEarnings: async () => ({ ok: false, reason: "unavailable", message: "x" }),
    ...overrides,
  }
}

describe("graceful degradation — nothing configured", () => {
  test("init with no client keeps SAMPLE_AD and reports nothing", async () => {
    await Backend.init(async () => undefined)
    expect(Backend.isConfigured()).toBe(false)
    expect(adStore.getState().ad).toEqual(SAMPLE_AD)
    // reportImpression is a no-op; flushing does nothing and never throws.
    Backend.reportImpression(SAMPLE_AD.id)
    await Backend.__flushForTest()
    expect(Backend.getClient()).toBeUndefined()
  })
})

describe("backend configured — ad swap", () => {
  test("init swaps the ad source to the served ad", async () => {
    const served = { id: "c9", advertiser: "BackendCo", text: "Live ad", url: "https://x" }
    await Backend.init(async () => fakeClient({ serveAd: async () => ({ ok: true, ad: served }) }))
    expect(Backend.isConfigured()).toBe(true)
    expect(adStore.getState().ad).toEqual(adFromServed(served))
  })

  test("a null/unavailable served ad keeps SAMPLE_AD (slot never empty)", async () => {
    await Backend.init(async () => fakeClient({ serveAd: async () => ({ ok: true, ad: null }) }))
    expect(adStore.getState().ad).toEqual(SAMPLE_AD)
    Backend.__resetForTest()
    adStore.setAd(SAMPLE_AD)
    await Backend.init(async () =>
      fakeClient({ serveAd: async () => ({ ok: false, reason: "unavailable", message: "down" }) }),
    )
    expect(adStore.getState().ad).toEqual(SAMPLE_AD)
  })
})

describe("backend configured — impression batching", () => {
  test("flushes a batch once the size threshold is hit", async () => {
    const reported: { adId: string; count: number }[] = []
    await Backend.init(async () =>
      fakeClient({
        serveAd: async () => ({ ok: true, ad: { id: "c1", advertiser: "A", text: "t", url: "u" } }),
        reportImpressions: async (input) => {
          reported.push(input)
          return { ok: true, creditedBaseUnits: 0n }
        },
      }),
    )
    // BATCH_FLUSH_SIZE is 5 — five impressions trigger an immediate flush.
    for (let i = 0; i < 5; i++) Backend.reportImpression("c1")
    await Backend.__flushForTest()
    const total = reported.reduce((sum, r) => sum + r.count, 0)
    expect(total).toBe(5)
    expect(reported[0]?.adId).toBe("c1")
  })

  test("a failed report re-buffers the count (not lost)", async () => {
    let attempts = 0
    await Backend.init(async () =>
      fakeClient({
        serveAd: async () => ({ ok: true, ad: { id: "c1", advertiser: "A", text: "t", url: "u" } }),
        reportImpressions: async () => {
          attempts++
          return { ok: false, reason: "unavailable", message: "offline" }
        },
      }),
    )
    Backend.reportImpression("c1")
    await Backend.__flushForTest() // attempt 1 fails, re-buffers
    await Backend.__flushForTest() // attempt 2 retries the re-buffered count
    expect(attempts).toBeGreaterThanOrEqual(2)
  })
})

describe("backend configured — ad rotation polling", () => {
  /** Capture the interval callback so the test can drive ticks deterministically. */
  function captureTimers() {
    let cb: (() => void) | undefined
    let started = false
    const timers: PollingTimers = {
      setInterval: (callback) => {
        cb = callback
        started = true
        return 1 as unknown as ReturnType<typeof setInterval>
      },
      clearInterval: () => {
        cb = undefined
      },
    }
    return { timers, tick: () => cb?.(), started: () => started }
  }
  // Drain the async poll() microtasks scheduled by a tick (real setTimeout, not the
  // injected interval timers).
  const flush = () => new Promise<void>((r) => setTimeout(r, 0))

  test("re-polls on each tick and swaps to the rotating ad", async () => {
    const ads = [
      { id: "c1", advertiser: "Blurb Code", text: "t1", url: "u1" },
      { id: "c2", advertiser: "Arc", text: "t2", url: "u2" },
      { id: "c3", advertiser: "Unlink", text: "t3", url: "u3" },
    ]
    let i = 0
    const { timers, tick } = captureTimers()
    await Backend.init(
      async () => fakeClient({ serveAd: async () => ({ ok: true, ad: ads[i++ % ads.length]! }) }),
      { timers, intervalMs: 9_000 },
    )
    // init performed the first swap; ticks cycle the rest.
    expect(adStore.getState().ad?.id).toBe("c1")
    tick()
    await flush()
    expect(adStore.getState().ad?.id).toBe("c2")
    tick()
    await flush()
    expect(adStore.getState().ad?.id).toBe("c3")
  })

  test("keeps the current ad on a poll miss (null/unavailable never blanks the slot)", async () => {
    let calls = 0
    const { timers, tick } = captureTimers()
    await Backend.init(
      async () =>
        fakeClient({
          serveAd: async () => {
            calls++
            return calls === 1
              ? { ok: true, ad: { id: "c1", advertiser: "A", text: "t", url: "u" } }
              : { ok: true, ad: null }
          },
        }),
      { timers },
    )
    expect(adStore.getState().ad?.id).toBe("c1")
    tick()
    await flush()
    expect(adStore.getState().ad?.id).toBe("c1")
  })

  test("unconfigured → no poller is ever started (true no-op offline)", async () => {
    const { timers, started } = captureTimers()
    await Backend.init(async () => undefined, { timers })
    expect(started()).toBe(false)
    expect(adStore.getState().ad).toEqual(SAMPLE_AD)
  })
})

describe("view-tracking onImpression bridge", () => {
  function manualTimers(): { timers: ViewTrackingTimers; tick: () => void } {
    let cb: (() => void) | undefined
    return {
      timers: {
        setInterval: (callback) => {
          cb = callback
          return 1 as unknown as ReturnType<typeof setInterval>
        },
        clearInterval: () => {
          cb = undefined
        },
      },
      tick: () => cb?.(),
    }
  }

  test("fires onImpression with the ad id only when an impression counts", () => {
    const seen: string[] = []
    adStore.setEnabled(true)
    adStore.setAd({ id: "live-1", advertiser: "A", text: "t", url: "u", blockBidBaseUnits: 0n })
    const { timers, tick } = manualTimers()
    const stop = startViewTracking(adStore, { timers, onImpression: (id) => seen.push(id) })
    tick()
    tick()
    stop()
    expect(seen).toEqual(["live-1", "live-1"])
  })

  test("no onImpression call when consent is off (no impression counts)", () => {
    const seen: string[] = []
    adStore.setAd({ id: "live-2", advertiser: "A", text: "t", url: "u", blockBidBaseUnits: 0n })
    adStore.setEnabled(false)
    const { timers, tick } = manualTimers()
    const stop = startViewTracking(adStore, { timers, onImpression: (id) => seen.push(id) })
    tick()
    stop()
    adStore.setEnabled(true)
    expect(seen).toEqual([])
  })
})

describe("revenue — backend earnings overlay", () => {
  const adState = {
    enabled: true,
    ad: { id: "a", advertiser: "A", text: "t", url: "u", blockBidBaseUnits: 1_000_000n },
    impressions: 3,
    clicks: 1,
    developerEarningsBaseUnits: 26_500n,
  }

  test("not connected → ad suppressed, no money (no fabricated balance)", () => {
    const view = buildRevenueView(adState, false, undefined)
    expect(view.connected).toBe(false)
    expect(view.hasAd).toBe(false)
    expect(view.impressions).toBe(0)
    expect(view.earningsUsdc).toBe("0")
    expect(view.walletAddress).toBe("")
  })

  test("connected with backend earnings → real money + counters", () => {
    const view = buildRevenueView(adState, true, {
      balanceBaseUnits: 5_000_000n,
      impressions: 100,
      clicks: 4,
      walletAddress: "0xdev",
      worldIdVerified: true,
    })
    expect(view.connected).toBe(true)
    expect(view.hasEarnings).toBe(true)
    expect(view.earningsUsdc).toBe("5")
    expect(view.impressions).toBe(100)
    expect(view.walletAddress).toBe("0xdev")
    // The served ad (display) still comes from the ad-store snapshot.
    expect(view.advertiser).toBe("A")
  })

  test("fetchBackendEarnings: undefined client → undefined (mock fallback)", async () => {
    expect(await fetchBackendEarnings(undefined)).toBeUndefined()
  })

  test("fetchBackendEarnings: unavailable result → undefined", async () => {
    const client = fakeClient({ getEarnings: async () => ({ ok: false, reason: "unavailable", message: "x" }) })
    expect(await fetchBackendEarnings(client)).toBeUndefined()
  })

  test("fetchBackendEarnings: ok result → earnings", async () => {
    const earnings = { balanceBaseUnits: 1n, impressions: 1, clicks: 0, walletAddress: "0x", worldIdVerified: false }
    const client = fakeClient({ getEarnings: async () => ({ ok: true, earnings }) })
    expect(await fetchBackendEarnings(client)).toEqual(earnings)
  })
})
