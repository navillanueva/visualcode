// The Hono app — every CONTRACT.md endpoint, wired to injected dependencies
// (db, settlement service, Dynamic verifier). Built by `createApp(deps)` so tests
// can drive it with PGlite + mock settlement + a local JWKS, and production wires
// the real ones in src/index.ts.
//
// Auth split (CONTRACT): web routes use a signed session cookie; TUI routes use a
// Bearer device token. Middleware is attached PER ROUTE (not as a catch-all on a
// mounted sub-app) so session-only and bearer-only routes can coexist under /api.
// All USDC amounts cross the wire as integer base-unit strings (what the TUI
// client's parser expects).

import { Hono, type Context } from "hono"
import { cors } from "hono/cors"
import { getCookie, setCookie } from "hono/cookie"
import { createMiddleware } from "hono/factory"
import { privateKeyToAccount } from "viem/accounts"
import type { Database } from "./db/index"
import * as repo from "./db/repo"
import { selectRotating } from "./auction"
import { allowedImpressionCount, RATE_WINDOW_MS } from "./ratelimit"
import { computeImpressionCharge } from "./accounting"
import { toBaseUnits, USDC_DECIMALS } from "@kickback/money"
import { encryptSecret } from "./auth/crypto"
import { SESSION_COOKIE, signSession, verifySession } from "./auth/session"
import type { DynamicVerifier } from "./auth/dynamic"
import type { SettlementService } from "./settlement/service"

export interface AppDeps {
  db: Database
  settlement: SettlementService
  dynamicVerifier: DynamicVerifier
  tokenSigningSecret: string
  secureCookies: boolean
  /** Allowed browser origins; null = reflect request origin (dev). */
  corsOrigins: string[] | null
  /**
   * Where advertisers send their public USDC payment (the treasury EOA) + which
   * token/chain/decimals — surfaced via GET /api/treasury so the web hardcodes
   * nothing. Null when not configured (mock/dev): the endpoint returns 503.
   */
  treasury: TreasuryInfo | null
  /** Injected clock (tests pass a fixed value); defaults to Date.now. */
  now?: () => number
  /**
   * USDC base-unit decimals for fixed pricing (ARC_USDC_DECIMALS): 6dp on
   * mainnet, 18dp for the arc-testnet pool token. Defaults to USDC_DECIMALS.
   */
  usdcDecimals?: number
}

export interface TreasuryInfo {
  address: string
  token: string
  chainId: number
  decimals: number
}

type Vars = { Variables: { accountId: string } }

const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/
const BASE_UNITS_RE = /^\d+$/

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined
}

/** Parse an integer base-units string ("1000000"); reject anything else. */
function parseBaseUnits(v: unknown): bigint | undefined {
  if (typeof v !== "string" || !BASE_UNITS_RE.test(v)) return undefined
  return BigInt(v)
}

/** Clamp the ?limit= query for list endpoints to [1, 200], defaulting to 50. */
function parseLimit(raw: string | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 50
  return Math.min(Math.floor(n), 200)
}

export function createApp(deps: AppDeps) {
  const now = deps.now ?? (() => Date.now())
  // Fixed pricing: every campaign bids $10 per 1,000 views, in the deployment's
  // USDC base units (ARC_USDC_DECIMALS — 6dp mainnet, 18dp arc-testnet pool token).
  const FIXED_BID_BASE_UNITS = toBaseUnits("10", deps.usdcDecimals ?? USDC_DECIMALS)
  // Round-robin cursor for the ad slot: every served ad advances it so repeated
  // /api/ad/serve calls rotate through the tied top-bid campaigns (fixed pricing
  // makes them all tie) instead of always returning the earliest-created one.
  let serveCursor = 0
  const app = new Hono<Vars>()

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!deps.corsOrigins) return origin || "*"
        return deps.corsOrigins.includes(origin) ? origin : null
      },
      credentials: true,
    }),
  )

  app.get("/health", async (c) => {
    // Reconciliation: the shielded pool must always cover outstanding developer
    // earnings (liabilities). poolBalance is the live shielded balance when real
    // (cached by the service); null when there is no on-chain pool (mock).
    const liabilities = await repo.sumOutstandingEarnings(deps.db)
    let poolBalance: bigint | null = null
    try {
      poolBalance = deps.settlement.getPoolBalance ? await deps.settlement.getPoolBalance() : null
    } catch {
      poolBalance = null
    }
    const healthy = poolBalance === null ? true : poolBalance >= liabilities
    return c.json({
      ok: true,
      settlement: { mode: deps.settlement.mode, live: deps.settlement.live, notes: deps.settlement.notes },
      reconciliation: {
        poolBalanceBaseUnits: poolBalance === null ? null : poolBalance.toString(),
        liabilitiesBaseUnits: liabilities.toString(),
        healthy,
      },
    })
  })

  function setSessionCookie(c: Context, accountId: string): string {
    const token = signSession(accountId, deps.tokenSigningSecret)
    // SameSite=None so the cookie can ride cross-site fetches from the web app
    // (web and api are different *.up.railway.app hosts); requires Secure, set in
    // prod. The token is also RETURNED so the SPA can send it as a Bearer header —
    // that's the primary path, since cross-site cookies are increasingly blocked.
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "None",
      secure: deps.secureCookies,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
    return token
  }

  // Per-route auth middleware (see header note on why this isn't a sub-app `use`).
  const sessionAuth = createMiddleware<Vars>(async (c, next) => {
    // Accept the signed session token from the Authorization header (primary,
    // cross-site safe) or the cookie (same-origin / dev). Try both.
    const bearer = /^Bearer\s+(.+)$/.exec(c.req.header("Authorization") ?? "")?.[1]?.trim()
    const accountId =
      verifySession(bearer, deps.tokenSigningSecret) ??
      verifySession(getCookie(c, SESSION_COOKIE), deps.tokenSigningSecret)
    if (!accountId || !(await repo.getAccountById(deps.db, accountId))) {
      return c.json({ ok: false, error: "unauthorized" }, 401)
    }
    c.set("accountId", accountId)
    await next()
  })

  const bearerAuth = createMiddleware<Vars>(async (c, next) => {
    const header = c.req.header("Authorization") ?? ""
    const token = /^Bearer\s+(.+)$/.exec(header)?.[1]?.trim()
    if (!token) return c.json({ ok: false, error: "missing bearer token" }, 401)
    const accountId = await repo.accountIdForDeviceToken(deps.db, token)
    if (!accountId) return c.json({ ok: false, error: "invalid device token" }, 401)
    c.set("accountId", accountId)
    await next()
  })

  // ── Public auth (no session yet) ───────────────────────────────────────────

  // CONTRACT: POST /api/auth/dynamic { dynamicJwt } → { address, ok }
  app.post("/api/auth/dynamic", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const jwt = asString(body?.["dynamicJwt"])
    if (!jwt) return c.json({ ok: false, error: "dynamicJwt is required" }, 400)
    let identity
    try {
      identity = await deps.dynamicVerifier.verify(jwt)
    } catch (e) {
      return c.json({ ok: false, error: `invalid Dynamic JWT: ${errMsg(e)}` }, 401)
    }
    const account = await repo.upsertAccountByAddress(deps.db, { address: identity.address, email: identity.email })
    const session = setSessionCookie(c, account.id)
    return c.json({ address: account.address, ok: true, session })
  })

  // CONTRACT: POST /api/auth/import { privateKey } → { address, ok } (custodial fallback)
  app.post("/api/auth/import", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const privateKey = asString(body?.["privateKey"])
    if (!privateKey || !PRIVATE_KEY_RE.test(privateKey)) {
      return c.json({ ok: false, error: "privateKey must be a 0x-prefixed 32-byte hex string" }, 400)
    }
    let address: string
    try {
      address = privateKeyToAccount(privateKey as `0x${string}`).address.toLowerCase()
    } catch (e) {
      return c.json({ ok: false, error: `invalid private key: ${errMsg(e)}` }, 400)
    }
    const enc = encryptSecret(privateKey, deps.tokenSigningSecret)
    const account = await repo.upsertAccountByAddress(deps.db, { address, encPrivateKey: enc })
    const session = setSessionCookie(c, account.id)
    return c.json({ address: account.address, ok: true, session })
  })

  // ── Web routes (session cookie) ────────────────────────────────────────────

  // CONTRACT: POST /api/device-tokens → { token }
  app.post("/api/device-tokens", sessionAuth, async (c) => {
    const token = await repo.createDeviceToken(deps.db, c.get("accountId"))
    return c.json({ token })
  })

  // CONTRACT: POST /api/campaigns { advertiser, text, url, budgetBaseUnits } → { campaign }
  // (bid is fixed server-side at $10/1,000 views; any client-sent bid is ignored.)
  app.post("/api/campaigns", sessionAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const advertiser = asString(body?.["advertiser"])
    const text = asString(body?.["text"])
    const url = asString(body?.["url"])
    const budget = parseBaseUnits(body?.["budgetBaseUnits"])
    if (!advertiser || !text || !url || budget === undefined) {
      return c.json(
        { ok: false, error: "advertiser, text, url, budgetBaseUnits (base-unit string) are required" },
        400,
      )
    }
    // Pricing is fixed platform-wide ($10/1,000 views): the bid is set server-side
    // so clients can't under- or over-bid; only the budget is theirs to control.
    const campaign = await repo.createCampaign(deps.db, {
      advertiserAccountId: c.get("accountId"),
      advertiser,
      text,
      url,
      bidBaseUnits: FIXED_BID_BASE_UNITS,
      budgetBaseUnits: budget,
    })
    return c.json({ campaign })
  })

  // CONTRACT: GET /api/campaigns → advertiser's campaigns + spend
  app.get("/api/campaigns", sessionAuth, async (c) => {
    const campaigns = await repo.listCampaignsByAdvertiser(deps.db, c.get("accountId"))
    return c.json({ campaigns })
  })

  // Where advertisers send their public USDC payment, + which token/chain/decimals.
  // The web reads this instead of hardcoding any address or decimal count.
  app.get("/api/treasury", (c) => {
    if (!deps.treasury) return c.json({ ok: false, error: "treasury not configured" }, 503)
    return c.json(deps.treasury)
  })

  // CONTRACT: POST /api/campaigns/:id/fund → verify the advertiser's public payment,
  // then shield the budget into the private pool (Unlink); activates the campaign.
  // Body: { paymentTxHash } (required in real mode; ignored in mock).
  app.post("/api/campaigns/:id/fund", sessionAuth, async (c) => {
    const accountId = c.get("accountId")
    const id = c.req.param("id")
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const paymentTxHash = asString(body?.["paymentTxHash"])

    const campaign = await repo.getCampaignById(deps.db, id)
    if (!campaign) return c.json({ ok: false, error: "campaign not found" }, 404)
    const owned = await repo.listCampaignsByAdvertiser(deps.db, accountId)
    if (!owned.some((x) => x.id === id)) return c.json({ ok: false, error: "forbidden" }, 403)

    // Idempotency: an already-funded campaign returns success without re-depositing.
    if (campaign.status === "active" && campaign.paymentTxHash) {
      return c.json({ campaign, txRef: null, alreadyFunded: true })
    }
    // Reuse guard: a payment hash can fund at most one campaign.
    if (paymentTxHash) {
      const other = await repo.getCampaignByPaymentTx(deps.db, paymentTxHash)
      if (other && other.id !== id) {
        return c.json({ ok: false, error: "paymentTxHash already used to fund another campaign" }, 409)
      }
    }

    const account = await repo.getAccountById(deps.db, accountId)
    let txRef: string
    try {
      const res = await deps.settlement.fundCampaign({
        campaignId: id,
        amountBaseUnits: BigInt(campaign.budgetBaseUnits),
        advertiserAddress: account?.address ?? "",
        paymentTxHash,
      })
      txRef = res.txRef
    } catch (e) {
      // Deposit/verify failed → campaign stays draft, payment not consumed (retryable).
      return c.json({ ok: false, error: `funding failed: ${errMsg(e)}` }, 502)
    }
    if (paymentTxHash) await repo.setCampaignPaymentTx(deps.db, id, paymentTxHash)
    const activated = await repo.activateCampaign(deps.db, id)
    await repo.recordSettlement(deps.db, {
      accountId,
      amountBaseUnits: BigInt(campaign.budgetBaseUnits),
      txRef,
      kind: "fund",
    })
    return c.json({ campaign: activated, txRef })
  })

  // CONTRACT: GET /api/me → { address, balanceBaseUnits, role }
  app.get("/api/me", sessionAuth, async (c) => {
    const accountId = c.get("accountId")
    const account = await repo.getAccountById(deps.db, accountId)
    const { balanceBaseUnits } = await repo.getEarnings(deps.db, accountId)
    const role = await repo.accountRole(deps.db, accountId)
    return c.json({ address: account?.address ?? "", balanceBaseUnits: balanceBaseUnits.toString(), role })
  })

  // CONTRACT: GET /api/me/impressions?limit=N (default 50, max 200) → the session
  // developer's own impression ledger, newest first, each row joined to its
  // campaign with the dev's 50% credit for that batch at the campaign's bid.
  app.get("/api/me/impressions", sessionAuth, async (c) => {
    const accountId = c.get("accountId")
    const limit = parseLimit(c.req.query("limit"))
    const rows = await repo.listImpressionsByDev(deps.db, accountId, limit)
    const impressions = rows.map((r) => {
      const bidBaseUnits = BigInt(r.bidBaseUnits)
      // Reuse the canonical accounting math. budgetRemaining is bid*count (always
      // ≥ the floor(bid*count/1000) charge), so the credit shown is this row's full
      // nominal 50% — never clamped by a budget that later exhausted.
      const { devCredit } = computeImpressionCharge({
        bidBaseUnits,
        budgetRemaining: bidBaseUnits * BigInt(r.count),
        count: r.count,
      })
      return {
        campaignId: r.campaignId,
        advertiser: r.advertiser,
        text: r.text,
        count: r.count,
        creditedBaseUnits: devCredit.toString(),
        createdAt: r.createdAt.toISOString(),
      }
    })
    return c.json({ impressions })
  })

  // CONTRACT: POST /api/withdraw → settle earnings to the account's wallet
  app.post("/api/withdraw", sessionAuth, async (c) => {
    const accountId = c.get("accountId")
    const account = await repo.getAccountById(deps.db, accountId)
    const { balanceBaseUnits } = await repo.getEarnings(deps.db, accountId)
    if (balanceBaseUnits <= 0n) return c.json({ ok: true, withdrawnBaseUnits: "0", txRef: null })
    let txRef: string
    try {
      const res = await deps.settlement.withdrawEarnings({
        accountId,
        amountBaseUnits: balanceBaseUnits,
        recipientEvmAddress: account?.address ?? "",
      })
      txRef = res.txRef
    } catch (e) {
      return c.json({ ok: false, error: `withdraw failed: ${errMsg(e)}` }, 502)
    }
    const withdrawn = await repo.zeroEarnings(deps.db, accountId)
    await repo.recordSettlement(deps.db, { accountId, amountBaseUnits: withdrawn, txRef, kind: "withdraw" })
    return c.json({ ok: true, withdrawnBaseUnits: withdrawn.toString(), txRef })
  })

  // ── TUI routes (Bearer device token) ───────────────────────────────────────

  // CONTRACT: GET /api/ad/serve → { ad: { id, advertiser, text, url } | null }
  app.get("/api/ad/serve", bearerAuth, async (c) => {
    const candidates = await repo.activeAuctionCandidates(deps.db)
    return c.json({ ad: selectRotating(candidates, serveCursor++) })
  })

  // CONTRACT: POST /api/impressions { adId, count } → { ok: true, creditedBaseUnits }
  app.post("/api/impressions", bearerAuth, async (c) => {
    const accountId = c.get("accountId")
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const adId = asString(body?.["adId"])
    const rawCount = body?.["count"]
    const count = typeof rawCount === "number" ? rawCount : Number(rawCount)
    if (!adId || !Number.isFinite(count) || count <= 0) {
      return c.json({ ok: false, error: "adId and a positive count are required" }, 400)
    }
    const campaign = await repo.getCampaignById(deps.db, adId)
    if (!campaign || campaign.status !== "active") {
      // Ad gone/exhausted — valid, just nothing credited (client treats as ok).
      return c.json({ ok: true, creditedBaseUnits: "0" })
    }
    const since = new Date(now() - RATE_WINDOW_MS)
    const recent = await repo.recentImpressionCount(deps.db, accountId, since)
    const allowed = allowedImpressionCount({ requested: count, recentInWindow: recent })
    const { credited } = await repo.recordImpression(deps.db, {
      devAccountId: accountId,
      campaignId: adId,
      allowedCount: allowed,
    })
    return c.json({ ok: true, creditedBaseUnits: credited.toString() })
  })

  // CONTRACT: GET /api/me/earnings → { balanceBaseUnits, impressions, clicks, walletAddress }
  app.get("/api/me/earnings", bearerAuth, async (c) => {
    const accountId = c.get("accountId")
    const account = await repo.getAccountById(deps.db, accountId)
    const { balanceBaseUnits, impressions } = await repo.getEarnings(deps.db, accountId)
    return c.json({
      balanceBaseUnits: balanceBaseUnits.toString(),
      impressions,
      clicks: 0,
      walletAddress: account?.address ?? "",
    })
  })

  return app
}

export type App = ReturnType<typeof createApp>
