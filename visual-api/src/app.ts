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
import { selectWinner } from "./auction"
import { allowedImpressionCount, RATE_WINDOW_MS } from "./ratelimit"
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
  /** Injected clock (tests pass a fixed value); defaults to Date.now. */
  now?: () => number
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

export function createApp(deps: AppDeps) {
  const now = deps.now ?? (() => Date.now())
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

  app.get("/health", (c) =>
    c.json({
      ok: true,
      settlement: { mode: deps.settlement.mode, live: deps.settlement.live, notes: deps.settlement.notes },
    }),
  )

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

  // CONTRACT: POST /api/campaigns { advertiser, text, url, bidBaseUnits, budgetBaseUnits } → { campaign }
  app.post("/api/campaigns", sessionAuth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const advertiser = asString(body?.["advertiser"])
    const text = asString(body?.["text"])
    const url = asString(body?.["url"])
    const bid = parseBaseUnits(body?.["bidBaseUnits"])
    const budget = parseBaseUnits(body?.["budgetBaseUnits"])
    if (!advertiser || !text || !url || bid === undefined || budget === undefined) {
      return c.json(
        { ok: false, error: "advertiser, text, url, bidBaseUnits, budgetBaseUnits (base-unit strings) are required" },
        400,
      )
    }
    if (bid <= 0n) return c.json({ ok: false, error: "bidBaseUnits must be positive" }, 400)
    const campaign = await repo.createCampaign(deps.db, {
      advertiserAccountId: c.get("accountId"),
      advertiser,
      text,
      url,
      bidBaseUnits: bid,
      budgetBaseUnits: budget,
    })
    return c.json({ campaign })
  })

  // CONTRACT: GET /api/campaigns → advertiser's campaigns + spend
  app.get("/api/campaigns", sessionAuth, async (c) => {
    const campaigns = await repo.listCampaignsByAdvertiser(deps.db, c.get("accountId"))
    return c.json({ campaigns })
  })

  // CONTRACT: POST /api/campaigns/:id/fund → on-chain private deposit; activates the campaign
  app.post("/api/campaigns/:id/fund", sessionAuth, async (c) => {
    const accountId = c.get("accountId")
    const id = c.req.param("id")
    const campaign = await repo.getCampaignById(deps.db, id)
    if (!campaign) return c.json({ ok: false, error: "campaign not found" }, 404)
    const owned = await repo.listCampaignsByAdvertiser(deps.db, accountId)
    if (!owned.some((x) => x.id === id)) return c.json({ ok: false, error: "forbidden" }, 403)
    const account = await repo.getAccountById(deps.db, accountId)

    let txRef: string
    try {
      const res = await deps.settlement.fundCampaign({
        campaignId: id,
        amountBaseUnits: BigInt(campaign.budgetBaseUnits),
        advertiserAddress: account?.address ?? "",
      })
      txRef = res.txRef
    } catch (e) {
      return c.json({ ok: false, error: `funding failed: ${errMsg(e)}` }, 502)
    }
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
    return c.json({ ad: selectWinner(candidates) })
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
