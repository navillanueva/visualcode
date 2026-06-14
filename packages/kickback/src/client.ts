// Kickback AI — backend client (Plan 1, Task 1).
//
// A thin client for the Visual Code backend (see plans/CONTRACT.md). The TUI is a
// thin client: it serves an ad, reports impressions, and reads earnings — nothing
// else. All three calls are authenticated with a Bearer device token.
//
// GRACEFUL DEGRADATION is the whole point: every method returns a typed result and
// NEVER throws into the TUI. On any network/auth/parse error the result is
// `{ ok: false, reason: "unavailable", ... }`, so the caller can transparently fall
// back to the existing local mock (SAMPLE_AD + mock providers). Backend data is
// purely additive — when no client is configured the TUI behaves exactly as before.
//
// DISPLAY-ONLY DISCIPLINE: the ad text this returns is rendered in the TUI status
// line only; nothing here ever enters the LLM context (see CLAUDE.md golden rule #4).

import type { BaseUnits } from "./money"

/** A status-line ad served by the backend auction (CONTRACT: GET /api/ad/serve). */
export interface ServedAd {
  id: string
  advertiser: string
  /** Ad copy shown in the status line. Display-only — never sent to the model. */
  text: string
  /** Click target opened in the default browser. */
  url: string
}

/** Result of `serveAd()`. `null` ad = the auction had no winner (a valid, empty slot). */
export type ServeAdResult =
  | { ok: true; ad: ServedAd | null }
  | { ok: false; reason: "unavailable"; message: string }

/** Result of `reportImpressions(...)`. */
export type ReportImpressionsResult =
  | { ok: true; creditedBaseUnits: BaseUnits }
  | { ok: false; reason: "unavailable"; message: string }

/** Developer earnings snapshot (CONTRACT: GET /api/me/earnings). */
export interface Earnings {
  balanceBaseUnits: BaseUnits
  impressions: number
  clicks: number
  walletAddress: string
  /**
   * World ID personhood gate (Plan 5). When false the developer has not bound a
   * unique human proof yet, so the TUI surfaces a "verify to get paid" banner in
   * place of the payout while accrual keeps flowing. Defaults to false when the
   * backend omits the field (older API / unconfigured), so we never reveal a
   * withdrawable number to an unverified account.
   */
  worldIdVerified: boolean
  /** Optional web wallet-page URL where the dev produces the World ID proof. */
  verifyUrl?: string
}

/** Result of `getEarnings()`. */
export type EarningsResult =
  | { ok: true; earnings: Earnings }
  | { ok: false; reason: "unavailable"; message: string }

export interface KickbackClientOptions {
  /** Backend base URL (the Railway public URL), e.g. `https://app.up.railway.app`. */
  baseUrl: string
  /** Device token issued by the web app; sent as `Authorization: Bearer <token>`. */
  token: string
  /** Override fetch (tests inject a stub). Defaults to the global `fetch`. */
  fetch?: typeof fetch
}

export interface KickbackClient {
  serveAd(): Promise<ServeAdResult>
  reportImpressions(input: { adId: string; count: number }): Promise<ReportImpressionsResult>
  getEarnings(): Promise<EarningsResult>
}

function unavailable(message: string): { ok: false; reason: "unavailable"; message: string } {
  return { ok: false, reason: "unavailable", message }
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Trim a single trailing slash so `baseUrl + "/api/..."` never doubles up. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "")
}

/**
 * Parse a string field that must be present. Returns undefined when missing or the
 * wrong type, so the caller can reject a malformed payload rather than trust it.
 */
function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

/**
 * Parse a USDC base-units amount sent as a decimal string (CONTRACT: "all amounts
 * are USDC base units as strings"). Returns undefined on anything that isn't a
 * non-negative integer string, so a malformed amount degrades instead of throwing.
 */
function parseBaseUnits(value: unknown): BaseUnits | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined
  return BigInt(value)
}

/** Parse a non-negative integer count; tolerates numbers or numeric strings. */
function parseCount(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return 0
}

/**
 * Map an arbitrary `ad` payload into a `ServedAd`, or `null`. Returns `undefined`
 * (distinct from a valid `null` ad) when the shape is invalid so the caller treats
 * a malformed response as "unavailable" rather than silently showing a broken ad.
 */
export function parseServedAd(raw: unknown): ServedAd | null | undefined {
  if (raw === null) return null
  if (typeof raw !== "object") return undefined
  const ad = raw as Record<string, unknown>
  const id = asString(ad.id)
  const advertiser = asString(ad.advertiser)
  const text = asString(ad.text)
  const url = asString(ad.url)
  if (id === undefined || advertiser === undefined || text === undefined || url === undefined) return undefined
  return { id, advertiser, text, url }
}

/** Map an arbitrary earnings payload into `Earnings`, or `undefined` if malformed. */
export function parseEarnings(raw: unknown): Earnings | undefined {
  if (typeof raw !== "object" || raw === null) return undefined
  const e = raw as Record<string, unknown>
  const balanceBaseUnits = parseBaseUnits(e.balanceBaseUnits)
  const walletAddress = asString(e.walletAddress)
  if (balanceBaseUnits === undefined || walletAddress === undefined) return undefined
  // worldIdVerified is the personhood gate (Plan 5). Treat anything that isn't a
  // literal `true` as unverified — a missing/garbled field must NEVER unlock payout.
  const verifyUrl = asString(e.verifyUrl)
  return {
    balanceBaseUnits,
    impressions: parseCount(e.impressions),
    clicks: parseCount(e.clicks),
    walletAddress,
    worldIdVerified: e.worldIdVerified === true,
    ...(verifyUrl !== undefined ? { verifyUrl } : {}),
  }
}

/**
 * Build a backend client. Construction never performs I/O — the caller decides
 * real-vs-mock from whether a `baseUrl`/`token` is configured at all.
 */
export function createKickbackClient(options: KickbackClientOptions): KickbackClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const doFetch = options.fetch ?? fetch
  const authHeader = { Authorization: `Bearer ${options.token}` }

  /** Run a request, returning the parsed JSON body or a typed failure. Never throws. */
  async function request(
    pathname: string,
    init?: RequestInit,
  ): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
    try {
      const res = await doFetch(`${baseUrl}${pathname}`, {
        ...init,
        headers: { ...authHeader, ...init?.headers },
      })
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` }
      const body = await res.json()
      return { ok: true, body }
    } catch (e) {
      return { ok: false, message: errMessage(e) }
    }
  }

  return {
    async serveAd() {
      const res = await request("/api/ad/serve")
      if (!res.ok) return unavailable(res.message)
      const body = res.body as Record<string, unknown> | null
      // The contract returns `{ ad: ... | null }`. A present-but-invalid `ad` is a
      // malformed response → unavailable; an explicit `null` is a valid empty slot.
      const ad = parseServedAd(body && typeof body === "object" ? body.ad : undefined)
      if (ad === undefined) return unavailable("malformed /api/ad/serve response")
      return { ok: true, ad }
    },

    async reportImpressions(input) {
      const res = await request("/api/impressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adId: input.adId, count: input.count }),
      })
      if (!res.ok) return unavailable(res.message)
      const body = res.body as Record<string, unknown> | null
      // Credit is informational; default to 0 when absent rather than failing the call.
      const credited = body && typeof body === "object" ? parseBaseUnits(body.creditedBaseUnits) : undefined
      return { ok: true, creditedBaseUnits: credited ?? 0n }
    },

    async getEarnings() {
      const res = await request("/api/me/earnings")
      if (!res.ok) return unavailable(res.message)
      const earnings = parseEarnings(res.body)
      if (earnings === undefined) return unavailable("malformed /api/me/earnings response")
      return { ok: true, earnings }
    },
  }
}
