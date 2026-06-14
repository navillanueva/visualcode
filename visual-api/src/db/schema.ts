// Drizzle schema — the CONTRACT.md Postgres tables. Amounts that are USDC base
// units are `numeric` columns (arbitrary-precision integers); drizzle returns
// them as decimal strings, which is exactly the wire shape the contract wants
// ("all amounts are USDC base units as strings"). Timestamps are timestamptz.

import { pgTable, text, numeric, integer, timestamp, index } from "drizzle-orm/pg-core"

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  /** Lower-cased EOA / Dynamic wallet address — the account identity. */
  address: text("address").notNull().unique(),
  /** Encrypted private key — only set for the custodial import fallback. */
  encPrivateKey: text("enc_private_key"),
  email: text("email"),
  /** World ID nullifier hash — unique per (human, app, action). The DB-unique
   *  constraint enforces one-human-one-account (the anti-Sybil constraint). */
  worldIdNullifier: text("world_id_nullifier").unique(),
  /** When the World ID nullifier was bound to this account (null = unverified). */
  worldIdVerifiedAt: timestamp("world_id_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const deviceTokens = pgTable(
  "device_tokens",
  {
    token: text("token").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("device_tokens_account_idx").on(t.accountId)],
)

export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    advertiserAccountId: text("advertiser_account_id")
      .notNull()
      .references(() => accounts.id),
    advertiser: text("advertiser").notNull(),
    text: text("text").notNull(),
    url: text("url").notNull(),
    /** Bid in USDC base units per 1,000 impressions (one "block"). */
    bidBaseUnits: numeric("bid_base_units").notNull(),
    /** Original funded budget (additive col — lets /campaigns report spend). */
    budgetBaseUnits: numeric("budget_base_units").notNull().default("0"),
    /** Spendable budget left; decremented per impression. */
    budgetRemainingBaseUnits: numeric("budget_remaining_base_units").notNull().default("0"),
    /** 'draft' (created, not funded) | 'active' (served) | 'exhausted' (budget 0). */
    status: text("status").notNull().default("draft"),
    /** Advertiser's on-chain payment tx (real mode). Unique → guards against reuse. */
    paymentTxHash: text("payment_tx_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("campaigns_status_idx").on(t.status)],
)

export const impressions = pgTable(
  "impressions",
  {
    id: text("id").primaryKey(),
    devAccountId: text("dev_account_id")
      .notNull()
      .references(() => accounts.id),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    count: integer("count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("impressions_dev_created_idx").on(t.devAccountId, t.createdAt)],
)

export const earnings = pgTable("earnings", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id),
  balanceBaseUnits: numeric("balance_base_units").notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const settlements = pgTable("settlements", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  amountBaseUnits: numeric("amount_base_units").notNull(),
  txRef: text("tx_ref"),
  /** 'fund' (advertiser deposit) | 'withdraw' (developer payout). */
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const schema = { accounts, deviceTokens, campaigns, impressions, earnings, settlements }
