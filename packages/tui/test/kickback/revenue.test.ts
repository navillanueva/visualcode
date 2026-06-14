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
      worldIdVerified: true,
    })
    expect(view.connected).toBe(true)
    expect(view.hasEarnings).toBe(true)
    expect(view.impressions).toBe(1000)
    expect(view.earningsUsdc).toBe("2.5")
    expect(view.walletAddress).toBe("0xdev")
    expect(view.worldIdVerified).toBe(true)
    // The served ad (display) still comes from the ad-store snapshot.
    expect(view.advertiser).toBe(SAMPLE_AD.advertiser)
  })

  test("mirrors the consent kill-switch", () => {
    const store = createAdStore({ enabled: false, ad: SAMPLE_AD })
    expect(buildRevenueView(store.getState(), true, undefined).enabled).toBe(false)
  })

  test("World ID personhood gate (Plan 5) — unverified earnings surface the flag + a verify link", () => {
    const store = createAdStore({ enabled: true, ad: SAMPLE_AD })
    const view = buildRevenueView(
      store.getState(),
      true,
      { balanceBaseUnits: 2_500_000n, impressions: 1000, clicks: 4, walletAddress: "0xdev", worldIdVerified: false },
      "https://app.test/",
    )
    expect(view.worldIdVerified).toBe(false)
    // Impressions stay visible so accrued value is still shown to an unverified dev.
    expect(view.impressions).toBe(1000)
    // No backend verifyUrl → derive the wallet page from the configured apiUrl (slash trimmed).
    expect(view.verifyUrl).toBe("https://app.test/wallet")
  })

  test("backend verifyUrl wins over the derived apiUrl link", () => {
    const store = createAdStore({ enabled: true, ad: SAMPLE_AD })
    const view = buildRevenueView(
      store.getState(),
      true,
      {
        balanceBaseUnits: 0n,
        impressions: 0,
        clicks: 0,
        walletAddress: "0xdev",
        worldIdVerified: false,
        verifyUrl: "https://custom.test/verify",
      },
      "https://app.test",
    )
    expect(view.verifyUrl).toBe("https://custom.test/verify")
  })

  test("no apiUrl and no backend verifyUrl → empty link (dialog shows generic text)", () => {
    const store = createAdStore({ enabled: true, ad: SAMPLE_AD })
    const view = buildRevenueView(store.getState(), true, undefined)
    expect(view.verifyUrl).toBe("")
    // Default false until real earnings load, so the dialog never gates the mock path.
    expect(view.worldIdVerified).toBe(false)
  })
})
