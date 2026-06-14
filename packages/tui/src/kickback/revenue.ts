// Kickback AI — developer revenue view model (Task 5).
//
// Pure adapter between the ad-layer state (ad-store.ts) + the Visual Code backend
// (KickbackClient.getEarnings) and the `/me` dialog (component/dialog-me.tsx). Keeping
// the formatting here (not in the component) makes it unit-testable without rendering.
// DISPLAY-ONLY: nothing here ever enters the LLM context (see CLAUDE.md golden rule #4).
//
// HONEST SOURCING: the balance shown in `/me` is the developer's REAL backend earnings
// (getEarnings → balanceBaseUnits). There is no seeded faucet balance and no invented
// "shielded/private" figure. When no backend is configured the view reports
// `connected: false` and the dialog shows a "paste a device token via /wallet" prompt
// instead of any number or ad.

import { fromBaseUnits, type Earnings, type KickbackClient } from "@kickback-ai/providers"
import type { AdState } from "./ad-store"

/** Fully-formatted snapshot for the `/me` view. Strings are render-ready. */
export interface RevenueView {
  /** Backend connection state. False ⇒ the dialog shows the "not connected" prompt. */
  connected: boolean
  /** True once real backend earnings have loaded (balance + impressions are meaningful). */
  hasEarnings: boolean
  /** Consent / kill-switch mirror — when off, the slot earns nothing. */
  enabled: boolean
  /** True when an auction-winning ad is currently served (connected only). */
  hasAd: boolean
  advertiser: string
  adText: string
  adUrl: string
  /** Counted impressions, from the backend. */
  impressions: number
  /** Accrued (unsettled) developer share, formatted USDC e.g. "0.05" — from the backend. */
  earningsUsdc: string
  /** Developer's settlement wallet address (backend). Empty until earnings load. */
  walletAddress: string
  /**
   * World ID personhood gate (Plan 5). False ⇒ the dialog hides the payout value and
   * shows a "verify your humanity to receive payouts" banner instead, while still
   * showing impressions. Defaults to false until real backend earnings load, so the
   * unconfigured/mock path (no earnings) never surfaces a payout to an unverified dev.
   */
  worldIdVerified: boolean
  /**
   * Where to verify. The backend `verifyUrl` when present, else the configured
   * apiUrl's wallet page, else "" (the dialog falls back to generic instructions).
   */
  verifyUrl: string
}

/**
 * Build the render-ready `/me` model from the ad-store snapshot, the backend
 * connection state, and the fetched backend earnings (undefined until they load, or
 * when the call was unavailable). Pure — the caller owns the I/O so this stays
 * trivially testable.
 *
 *   - Not connected (no device token): an ad-less, money-less view → the dialog shows
 *     the "paste a device token via /wallet" prompt. No fabricated balance or ad.
 *   - Connected: the served ad comes from the ad-store (display) while the balance,
 *     impressions, and settlement wallet are the backend's source of truth.
 *
 * `apiUrl` (the configured backend URL) is used only to derive a verify link when the
 * backend didn't send one — pure string work, so this stays trivially testable.
 */
export function buildRevenueView(
  state: AdState,
  connected: boolean,
  earnings: Earnings | undefined,
  apiUrl?: string,
): RevenueView {
  return {
    connected,
    hasEarnings: earnings !== undefined,
    enabled: state.enabled,
    hasAd: connected && state.ad !== null,
    advertiser: state.ad?.advertiser ?? "",
    adText: state.ad?.text ?? "",
    adUrl: state.ad?.url ?? "",
    impressions: earnings?.impressions ?? 0,
    earningsUsdc: earnings ? fromBaseUnits(earnings.balanceBaseUnits) : "0",
    walletAddress: earnings?.walletAddress ?? "",
    // Default false until real earnings load: an unloaded/unconfigured view never
    // claims a dev is verified, but the dialog only shows the gate once earnings exist.
    worldIdVerified: earnings?.worldIdVerified ?? false,
    verifyUrl: resolveVerifyUrl(earnings?.verifyUrl, apiUrl),
  }
}

/**
 * Choose the verification link the dialog shows an unverified dev: the backend's
 * `verifyUrl` first, else the configured backend URL's wallet page, else "" so the
 * dialog can fall back to generic instructions. Pure — no I/O.
 */
function resolveVerifyUrl(backendVerifyUrl: string | undefined, apiUrl: string | undefined): string {
  if (backendVerifyUrl) return backendVerifyUrl
  if (apiUrl) return `${apiUrl.replace(/\/+$/, "")}/wallet`
  return ""
}

/**
 * Fetch backend earnings when a client is configured, returning undefined on any
 * unavailable result so the caller can show a "couldn't load" state rather than a
 * fabricated number. Never throws.
 */
export async function fetchBackendEarnings(client: KickbackClient | undefined): Promise<Earnings | undefined> {
  if (!client) return undefined
  const result = await client.getEarnings()
  return result.ok ? result.earnings : undefined
}
