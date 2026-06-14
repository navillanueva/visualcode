// Data-access layer. Every DB read/write goes through here so the routes stay
// thin and the accounting transaction lives in one place. Written once against
// the `Database` type, so it runs identically on Postgres (prod) and PGlite
// (tests). USDC amounts are bigint base units in code; `numeric` columns
// serialize them as integer strings (the contract wire shape).

import { and, desc, eq, sql } from "drizzle-orm"
import type { Database } from "./index"
import { accounts, campaigns, deviceTokens, earnings, impressions, settlements } from "./schema"
import { computeImpressionCharge } from "../accounting"
import type { AuctionCandidate } from "../auction"
import { generateDeviceToken, newId } from "../auth/tokens"

export interface AccountRow {
  id: string
  address: string
  encPrivateKey: string | null
  email: string | null
}

/** Create the account for `address` if absent (and its earnings row); return it.
 *  When `encPrivateKey` is supplied (import fallback) it is stored/updated. */
export async function upsertAccountByAddress(
  db: Database,
  params: { address: string; encPrivateKey?: string; email?: string },
): Promise<AccountRow> {
  const address = params.address.toLowerCase()
  await db
    .insert(accounts)
    .values({ id: newId(), address, encPrivateKey: params.encPrivateKey ?? null, email: params.email ?? null })
    .onConflictDoNothing({ target: accounts.address })
  const [row] = await db.select().from(accounts).where(eq(accounts.address, address))
  if (!row) throw new Error("account row missing immediately after upsert")
  if (params.encPrivateKey && row.encPrivateKey !== params.encPrivateKey) {
    await db.update(accounts).set({ encPrivateKey: params.encPrivateKey }).where(eq(accounts.id, row.id))
    row.encPrivateKey = params.encPrivateKey
  }
  await db.insert(earnings).values({ accountId: row.id }).onConflictDoNothing({ target: earnings.accountId })
  return { id: row.id, address: row.address, encPrivateKey: row.encPrivateKey, email: row.email }
}

export async function getAccountById(db: Database, id: string): Promise<AccountRow | null> {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, id))
  return row ? { id: row.id, address: row.address, encPrivateKey: row.encPrivateKey, email: row.email } : null
}

/** Issue a device token (CONTRACT: POST /api/device-tokens). */
export async function createDeviceToken(db: Database, accountId: string): Promise<string> {
  const token = generateDeviceToken()
  await db.insert(deviceTokens).values({ token, accountId })
  return token
}

/** Resolve a bearer device token to its account id (null if unknown/revoked). */
export async function accountIdForDeviceToken(db: Database, token: string): Promise<string | null> {
  const [row] = await db
    .select({ accountId: deviceTokens.accountId, revokedAt: deviceTokens.revokedAt })
    .from(deviceTokens)
    .where(eq(deviceTokens.token, token))
  if (!row || row.revokedAt) return null
  return row.accountId
}

export interface CampaignRow {
  id: string
  advertiser: string
  text: string
  url: string
  bidBaseUnits: string
  budgetBaseUnits: string
  budgetRemainingBaseUnits: string
  status: string
  /** Advertiser's on-chain payment tx hash once funded (real mode); null otherwise. */
  paymentTxHash: string | null
}

function toCampaignRow(r: typeof campaigns.$inferSelect): CampaignRow {
  return {
    id: r.id,
    advertiser: r.advertiser,
    text: r.text,
    url: r.url,
    bidBaseUnits: r.bidBaseUnits,
    budgetBaseUnits: r.budgetBaseUnits,
    budgetRemainingBaseUnits: r.budgetRemainingBaseUnits,
    status: r.status,
    paymentTxHash: r.paymentTxHash ?? null,
  }
}

/** Create a campaign in 'draft' with its requested budget parked (funded later). */
export async function createCampaign(
  db: Database,
  params: {
    advertiserAccountId: string
    advertiser: string
    text: string
    url: string
    bidBaseUnits: bigint
    budgetBaseUnits: bigint
  },
): Promise<CampaignRow> {
  const id = newId()
  const [row] = await db
    .insert(campaigns)
    .values({
      id,
      advertiserAccountId: params.advertiserAccountId,
      advertiser: params.advertiser,
      text: params.text,
      url: params.url,
      bidBaseUnits: params.bidBaseUnits.toString(),
      budgetBaseUnits: params.budgetBaseUnits.toString(),
      budgetRemainingBaseUnits: params.budgetBaseUnits.toString(),
      status: "draft",
    })
    .returning()
  if (!row) throw new Error("campaign insert returned no row")
  return toCampaignRow(row)
}

export async function getCampaignById(db: Database, id: string): Promise<CampaignRow | null> {
  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id))
  return row ? toCampaignRow(row) : null
}

/** Mark a funded campaign active so the auction can serve it. */
export async function activateCampaign(db: Database, id: string): Promise<CampaignRow | null> {
  const [row] = await db.update(campaigns).set({ status: "active" }).where(eq(campaigns.id, id)).returning()
  return row ? toCampaignRow(row) : null
}

/** Bind the advertiser's verified on-chain payment tx to the campaign (real mode). */
export async function setCampaignPaymentTx(db: Database, id: string, paymentTxHash: string): Promise<void> {
  await db.update(campaigns).set({ paymentTxHash }).where(eq(campaigns.id, id))
}

/** Find a campaign already bound to `paymentTxHash` (idempotency / reuse guard). */
export async function getCampaignByPaymentTx(db: Database, paymentTxHash: string): Promise<CampaignRow | null> {
  const [row] = await db.select().from(campaigns).where(eq(campaigns.paymentTxHash, paymentTxHash))
  return row ? toCampaignRow(row) : null
}

/** Total outstanding developer earnings (pool must always cover this — /health). */
export async function sumOutstandingEarnings(db: Database): Promise<bigint> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${earnings.balanceBaseUnits}), 0)` })
    .from(earnings)
  return BigInt(row?.total ?? "0")
}

export interface CampaignWithSpend extends CampaignRow {
  spendBaseUnits: string
}

export async function listCampaignsByAdvertiser(db: Database, accountId: string): Promise<CampaignWithSpend[]> {
  const rows = await db.select().from(campaigns).where(eq(campaigns.advertiserAccountId, accountId))
  return rows.map((r) => {
    const c = toCampaignRow(r)
    const spend = BigInt(c.budgetBaseUnits) - BigInt(c.budgetRemainingBaseUnits)
    return { ...c, spendBaseUnits: (spend < 0n ? 0n : spend).toString() }
  })
}

/** Active, funded campaigns eligible for the auction. */
export async function activeAuctionCandidates(db: Database): Promise<AuctionCandidate[]> {
  const rows = await db.select().from(campaigns).where(eq(campaigns.status, "active"))
  return rows.map((r) => ({
    id: r.id,
    advertiser: r.advertiser,
    text: r.text,
    url: r.url,
    bidBaseUnits: BigInt(r.bidBaseUnits),
    budgetRemaining: BigInt(r.budgetRemainingBaseUnits),
    status: r.status,
    createdAt: r.createdAt,
  }))
}

export interface DevImpressionRow {
  campaignId: string
  advertiser: string
  text: string
  /** Campaign bid (base units per 1,000 impressions) — lets the caller recompute the credit. */
  bidBaseUnits: string
  count: number
  createdAt: Date
}

/** A developer's own impression rows, newest first, joined to their campaign
 *  (advertiser + text for display, bid so the caller recomputes the 50% credit). */
export async function listImpressionsByDev(
  db: Database,
  devAccountId: string,
  limit: number,
): Promise<DevImpressionRow[]> {
  return db
    .select({
      campaignId: impressions.campaignId,
      advertiser: campaigns.advertiser,
      text: campaigns.text,
      bidBaseUnits: campaigns.bidBaseUnits,
      count: impressions.count,
      createdAt: impressions.createdAt,
    })
    .from(impressions)
    .innerJoin(campaigns, eq(impressions.campaignId, campaigns.id))
    .where(eq(impressions.devAccountId, devAccountId))
    .orderBy(desc(impressions.createdAt))
    .limit(limit)
}

/** Sum of impression counts credited to an account since `since`. */
export async function recentImpressionCount(db: Database, accountId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${impressions.count}), 0)` })
    .from(impressions)
    .where(and(eq(impressions.devAccountId, accountId), sql`${impressions.createdAt} >= ${since}`))
  return Number(row?.total ?? "0")
}

export interface ImpressionResult {
  credited: bigint
  charged: bigint
}

/**
 * Record `allowedCount` impressions against `campaignId` for `devAccountId` and
 * apply accounting atomically: decrement the advertiser budget (guarded against
 * overspend), credit the developer 50%, and exhaust the campaign when budget
 * hits zero. Returns the base units actually credited.
 */
export async function recordImpression(
  db: Database,
  params: { devAccountId: string; campaignId: string; allowedCount: number },
): Promise<ImpressionResult> {
  if (params.allowedCount <= 0) return { credited: 0n, charged: 0n }
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(campaigns).where(eq(campaigns.id, params.campaignId))
    if (!c || c.status !== "active") return { credited: 0n, charged: 0n }

    const { charge, devCredit } = computeImpressionCharge({
      bidBaseUnits: BigInt(c.bidBaseUnits),
      budgetRemaining: BigInt(c.budgetRemainingBaseUnits),
      count: params.allowedCount,
    })
    if (charge <= 0n) return { credited: 0n, charged: 0n }

    const chargeStr = charge.toString()
    const updated = await tx
      .update(campaigns)
      .set({
        budgetRemainingBaseUnits: sql`${campaigns.budgetRemainingBaseUnits} - ${chargeStr}`,
        status: sql`CASE WHEN ${campaigns.budgetRemainingBaseUnits} - ${chargeStr} <= 0 THEN 'exhausted' ELSE 'active' END`,
      })
      .where(and(eq(campaigns.id, c.id), sql`${campaigns.budgetRemainingBaseUnits} >= ${chargeStr}`))
      .returning({ id: campaigns.id })
    if (updated.length === 0) return { credited: 0n, charged: 0n } // lost a concurrent race

    await tx.insert(impressions).values({
      id: newId(),
      devAccountId: params.devAccountId,
      campaignId: c.id,
      count: params.allowedCount,
    })

    await tx
      .insert(earnings)
      .values({ accountId: params.devAccountId, balanceBaseUnits: devCredit.toString() })
      .onConflictDoUpdate({
        target: earnings.accountId,
        set: {
          balanceBaseUnits: sql`${earnings.balanceBaseUnits} + ${devCredit.toString()}`,
          updatedAt: new Date(),
        },
      })

    return { credited: devCredit, charged: charge }
  })
}

export interface EarningsSnapshot {
  balanceBaseUnits: bigint
  impressions: number
}

export async function getEarnings(db: Database, accountId: string): Promise<EarningsSnapshot> {
  const [e] = await db.select().from(earnings).where(eq(earnings.accountId, accountId))
  const [imp] = await db
    .select({ total: sql<string>`coalesce(sum(${impressions.count}), 0)` })
    .from(impressions)
    .where(eq(impressions.devAccountId, accountId))
  return {
    balanceBaseUnits: e ? BigInt(e.balanceBaseUnits) : 0n,
    impressions: Number(imp?.total ?? "0"),
  }
}

/** Zero an account's earnings balance, returning the amount that was withdrawn. */
export async function zeroEarnings(db: Database, accountId: string): Promise<bigint> {
  const [e] = await db.select().from(earnings).where(eq(earnings.accountId, accountId))
  const prior = e ? BigInt(e.balanceBaseUnits) : 0n
  if (prior > 0n) {
    await db
      .update(earnings)
      .set({ balanceBaseUnits: "0", updatedAt: new Date() })
      .where(eq(earnings.accountId, accountId))
  }
  return prior
}

export async function recordSettlement(
  db: Database,
  params: { accountId: string; amountBaseUnits: bigint; txRef: string; kind: "fund" | "withdraw" },
): Promise<void> {
  await db.insert(settlements).values({
    id: newId(),
    accountId: params.accountId,
    amountBaseUnits: params.amountBaseUnits.toString(),
    txRef: params.txRef,
    kind: params.kind,
  })
}

/** Compute a coarse role for GET /api/me from the account's activity. */
export async function accountRole(
  db: Database,
  accountId: string,
): Promise<"advertiser" | "developer" | "both" | "user"> {
  const [adv] = await db
    .select({ n: sql<string>`count(*)` })
    .from(campaigns)
    .where(eq(campaigns.advertiserAccountId, accountId))
  const [dev] = await db
    .select({ n: sql<string>`count(*)` })
    .from(impressions)
    .where(eq(impressions.devAccountId, accountId))
  const isAdv = Number(adv?.n ?? "0") > 0
  const isDev = Number(dev?.n ?? "0") > 0
  if (isAdv && isDev) return "both"
  if (isAdv) return "advertiser"
  if (isDev) return "developer"
  return "user"
}
