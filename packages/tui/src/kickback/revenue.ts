// Kickback AI — developer revenue view model (Task 5).
//
// Pure adapter between the ad-layer state (ad-store.ts) + the mock providers
// (@kickback-ai/providers/mock) and the `/me` dialog (component/dialog-me.tsx).
// Keeping the math/formatting here (not in the component) makes it unit-testable
// without rendering. DISPLAY-ONLY: nothing here ever enters the LLM context, and
// the mock providers never touch the network (see CLAUDE.md golden rules #4, #5).

import { createMockPrivacyProvider, MOCK_USDC } from "@kickback-ai/providers/mock"
import { fromBaseUnits, type PrivacyProvider, type Earnings, type KickbackClient } from "@kickback-ai/providers"
import type { AdState } from "./ad-store"

/** Fully-formatted snapshot for the `/me` view. Strings are render-ready. */
export interface RevenueView {
  /** Consent / kill-switch mirror — when off, the slot earns nothing. */
  enabled: boolean
  /** True when an auction-winning ad is currently served. */
  hasAd: boolean
  advertiser: string
  adText: string
  adUrl: string
  impressions: number
  clicks: number
  /** Accrued (unsettled) developer share, formatted USDC e.g. "0.05". */
  earningsUsdc: string
  /** Settled private balance held in the (mock) Unlink account, formatted USDC. */
  privateBalanceUsdc: string
  /** Where the earnings figures came from — drives the provenance line in `/me`. */
  source: "backend" | "mock"
  /** Developer's settlement wallet address (backend only); empty in the mock path. */
  walletAddress: string
}

/**
 * Combine an ad-store snapshot + a private balance (base units) into a render-ready
 * model. Pure — the caller fetches the balance from a PrivacyProvider and passes it
 * in, so this stays trivially testable.
 */
export function buildRevenueView(state: AdState, privateBalanceBaseUnits: bigint): RevenueView {
  return {
    enabled: state.enabled,
    hasAd: state.ad !== null,
    advertiser: state.ad?.advertiser ?? "",
    adText: state.ad?.text ?? "",
    adUrl: state.ad?.url ?? "",
    impressions: state.impressions,
    clicks: state.clicks,
    earningsUsdc: fromBaseUnits(state.developerEarningsBaseUnits),
    privateBalanceUsdc: fromBaseUnits(privateBalanceBaseUnits),
    source: "mock",
    walletAddress: "",
  }
}

/**
 * Overlay backend earnings onto a mock-derived view. The served ad still comes from
 * the ad-store (display), but the money + counters become the backend's source of
 * truth: balance, impressions, clicks, and the settlement wallet address. The mock
 * `privateBalanceUsdc` is dropped (the backend balance is authoritative).
 */
export function withBackendEarnings(view: RevenueView, earnings: Earnings): RevenueView {
  return {
    ...view,
    impressions: earnings.impressions,
    clicks: earnings.clicks,
    earningsUsdc: fromBaseUnits(earnings.balanceBaseUnits),
    privateBalanceUsdc: fromBaseUnits(earnings.balanceBaseUnits),
    source: "backend",
    walletAddress: earnings.walletAddress,
  }
}

/**
 * Fetch backend earnings when a client is configured, returning undefined on any
 * unavailable result so the caller keeps the mock-derived view. Never throws.
 */
export async function fetchBackendEarnings(client: KickbackClient | undefined): Promise<Earnings | undefined> {
  if (!client) return undefined
  const result = await client.getEarnings()
  return result.ok ? result.earnings : undefined
}

/**
 * Read a token's settled private balance from a PrivacyProvider (the mock in the
 * TUI). Returns base units; 0 when the account holds none of that token.
 */
export async function readPrivateBalance(privacy: PrivacyProvider, tokenSymbol = "USDC"): Promise<bigint> {
  const balances = await privacy.getBalances()
  return balances.find((b) => b.token.symbol === tokenSymbol)?.amount ?? 0n
}

/**
 * Lazily-seeded demo private account so the `/me` view shows a non-zero *settled*
 * balance offline. Seeds a fresh mock Unlink account once via the faucet (in-memory,
 * NOT a live call) and reuses it process-wide. Exercises the mock PrivacyProvider
 * exactly as the build plan asks; the real Unlink balance replaces it once privacy
 * goes live (see PROGRESS.md TODO(human)).
 */
let demoPrivacy: PrivacyProvider | undefined
export async function getDemoPrivateBalance(): Promise<bigint> {
  if (!demoPrivacy) {
    const provider = createMockPrivacyProvider()
    await provider.ensureRegistered()
    await provider.requestFaucet(MOCK_USDC) // 1.000000 USDC demo seed
    demoPrivacy = provider
  }
  return readPrivateBalance(demoPrivacy)
}
