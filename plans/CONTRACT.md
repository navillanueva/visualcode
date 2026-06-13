# Visual Code — Shared API Contract (single source of truth)

All three plans agree on THIS. The backend (Plan 3) implements it; the TUI (Plan 1) and the web
frontend (Plan 2) consume it. Base URL is configurable (`VISUALCODE_API_URL`); Railway gives the web
service a public URL.

## Identity & auth (MVP = Dynamic wallet creation; import-key is the fallback)
- A **web account** is created by **Dynamic social/email login → embedded wallet** (browser, via the
  Dynamic React SDK). The frontend sends the Dynamic **JWT** to the backend, which verifies it and
  links the account to the Dynamic **wallet address**. NON-custodial: the backend never holds the
  key — it sends earnings to the address; advertiser deposits are signed client-side via the Dynamic
  wallet (or a Dynamic server wallet later).
- **Fallback:** importing a raw private key (custodial; backend stores it encrypted to sign).
- A **device token** links the TUI to an account. Issued in the web app, pasted into the TUI.
- Web routes use a **session cookie**; TUI routes use **`Authorization: Bearer <device-token>`**.

## TUI ↔ backend (Bearer device token)
- `GET /api/ad/serve` → `{ ad: { id, advertiser, text, url } | null }` — the auction winner to show.
- `POST /api/impressions` `{ adId, count }` → `{ ok: true, creditedBaseUnits: string }` — record N
  5-second impressions; backend decrements advertiser budget + credits this dev 50%.
- `GET /api/me/earnings` → `{ balanceBaseUnits, impressions, clicks, walletAddress }`.

## Web ↔ backend (session)
- `POST /api/auth/dynamic` `{ dynamicJwt }` → `{ address, ok }` (verify the Dynamic JWT with
  `DYNAMIC_SERVER_API_KEY`, link the account to the Dynamic wallet address — MVP primary, non-custodial).
- `POST /api/auth/import` `{ privateKey }` → `{ address, ok }` (fallback; custodial, key stored encrypted).
- `POST /api/device-tokens` → `{ token }` (issue a TUI device token for the logged-in account).
- `POST /api/campaigns` `{ advertiser, text, url, bidBaseUnits, budgetBaseUnits }` → `{ campaign }`.
- `POST /api/campaigns/:id/fund` → triggers the on-chain private deposit (Unlink on Arc) from the
  advertiser's wallet; sets `budgetRemaining`.
- `GET /api/campaigns` → advertiser's campaigns + spend.
- `GET /api/me` → `{ address, balanceBaseUnits, role }`.
- `POST /api/withdraw` → settle earnings to the account's wallet (Gateway x402 + Unlink transfer).

## Amounts & chain
- All amounts are **USDC base units (6 dec) as strings** (`"1000000"` = 1 USDC). Reuse
  `packages/kickback`'s `toBaseUnits`/`fromBaseUnits`.
- Arc testnet: chain `5042002`, USDC ERC-20 `0x3600000000000000000000000000000000000000`, Unlink engine
  `https://arc-testnet-production-api.unlink.xyz`, Gateway via `@circle-fin/x402-batching`.

## Postgres schema (Plan 3 owns; minimal MVP)
- `accounts(id, address UNIQUE, enc_private_key, email NULL, created_at)`
- `device_tokens(token PK, account_id, created_at, revoked_at NULL)`
- `campaigns(id, advertiser_account_id, advertiser, text, url, bid_base_units, budget_remaining_base_units, status, created_at)`
- `impressions(id, dev_account_id, campaign_id, count, created_at)`
- `earnings(account_id PK, balance_base_units)` (or derive from impressions; a cached balance is fine)
- `settlements(id, account_id, amount_base_units, tx_ref, kind, created_at)`

## Graceful degradation (important for Plan 1)
If the TUI has **no `VISUALCODE_API_URL`/token**, it must fall back to the existing **local mock**
(`SAMPLE_AD` + mock providers) so the harness still works offline. Backend-served data is additive.
