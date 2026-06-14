import { describe, expect, test } from "bun:test"
import { buildRevenueView } from "../../src/kickback/revenue"
import { createAdStore, SAMPLE_AD } from "../../src/kickback/ad-store"

describe("buildRevenueView", () => {
  test("not connected → ad-less, money-less view (no fabricated balance or ad)", () => {
    const store = createAdStore({ enabled: true, ad: SAMPLE_AD })
    const view = buildRevenueView(store.getState(), false, undefined)
    expect(view.connected).toBe(false)
    expect(view.hasEarnings).toBe(false)
    // The sample ad is suppressed when not connected — the dialog shows the
    // "paste a device token" prompt instead.
    expect(view.hasAd).toBe(false)
    expect(view.impressions).toBe(0)
    expect(view.earningsUsdc).toBe("0")
    expect(view.walletAddress).toBe("")
  })

  test("connected but earnings not loaded yet → ad shows, money is unloaded", () => {
    const store = createAdStore({ enabled: true, ad: SAMPLE_AD })
    const view = buildRevenueView(store.getState(), true, undefined)
    expect(view.connected).toBe(true)
    expect(view.hasEarnings).toBe(false)
    expect(view.hasAd).toBe(true)
    expect(view.advertiser).toBe(SAMPLE_AD.advertiser)
    expect(view.impressions).toBe(0)
    expect(view.earningsUsdc).toBe("0")
  })

  test("connected with backend earnings → real balance, impressions, wallet", () => {
    const store = createAdStore({ enabled: true, ad: SAMPLE_AD })
    const view = buildRevenueView(store.getState(), true, {
      balanceBaseUnits: 2_500_000n,
      impressions: 1000,
      clicks: 4,
      walletAddress: "0xdev",
    })
    expect(view.connected).toBe(true)
    expect(view.hasEarnings).toBe(true)
    expect(view.impressions).toBe(1000)
    expect(view.earningsUsdc).toBe("2.5")
    expect(view.walletAddress).toBe("0xdev")
    // The served ad (display) still comes from the ad-store snapshot.
    expect(view.advertiser).toBe(SAMPLE_AD.advertiser)
  })

  test("mirrors the consent kill-switch", () => {
    const store = createAdStore({ enabled: false, ad: SAMPLE_AD })
    expect(buildRevenueView(store.getState(), true, undefined).enabled).toBe(false)
  })
})
