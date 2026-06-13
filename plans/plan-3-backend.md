# Plan 3 — Backend (the hub) + Postgres on Railway

**Read first:** `plans/CONTRACT.md` (you OWN it), `visual-code-mvp-architecture.md`. The backend is
the only thing that moves money and the single source of truth. Bun 1.3.14.

## Where it lives
Default: **API routes inside the `visual-web/` SolidStart app** (Plan 2) — one Railway web service +
one Railway Postgres. (Alternative: a separate Hono/Bun service if you prefer isolation — if so,
publish the base URL and keep `CONTRACT.md` exact.) Coordinate with Plan 2 so you don't both define
routes.

## Build order
1. **Postgres + schema** — create the tables in `CONTRACT.md` (use `drizzle-orm`, already in the repo
   catalog, or plain SQL). `DATABASE_URL` comes from Railway Postgres. Add migrations.
2. **Auth** — `POST /api/auth/import` (derive address from key via `viem`, store key ENCRYPTED, create
   account, set session). `POST /api/device-tokens` (issue/lookup a bearer token for the account).
   Middleware: session for web routes, bearer for `/api/{ad/serve,impressions,me/earnings}`.
3. **Marketplace (mock money first)** — campaigns CRUD, a trivial ascending auction (`/ad/serve`
   returns the highest-bid campaign with budget remaining), impression ingest (`/impressions`:
   validate token, dedup/rate-limit, decrement `budget_remaining`, credit dev `earnings` 50%),
   `/me/earnings`, `/me`, `/campaigns`.
4. **Real settlement (migrate from the TUI)** — lift the loop's real providers from
   `packages/kickback/src/real/*` into the backend:
   - **Unlink** (`@unlink-xyz/sdk` + `UNLINK_ENGINE_URL=https://arc-testnet-production-api.unlink.xyz`)
     — advertiser deposit on fund; private transfer to the dev on withdraw.
   - **Circle Gateway x402** (`@circle-fin/x402-batching`) — settle on Arc; payer = a backend-held
     EOA or **Dynamic server wallet** (`@dynamic-labs-wallet/node-evm`) — THIS is where Dynamic finally
     does real work (server-side signing), per the architecture doc.
   - `POST /api/campaigns/:id/fund` and `POST /api/withdraw` call these. Keep ONE gated live smoke;
     default to the mock providers for repeated/dev work (reuse `packages/kickback` mocks).
5. **Anti-abuse (MVP-level)** — bearer required, rate-limit impressions per token, dedup windows.
   Document that this is not full ad-fraud protection.

## Secrets (Railway env on the service)
`DATABASE_URL`, `ARC_TESTNET_RPC_URL`, `ARC_USDC_ADDRESS`, `UNLINK_ENVIRONMENT=arc-testnet`,
`UNLINK_API_KEY`, `UNLINK_ENGINE_URL`, `UNLINK_MNEMONIC` (or per-account keys), `DYNAMIC_*`,
a server-side `PAYER_PRIVATE_KEY` for settlement, and a `TOKEN_SIGNING_SECRET`. Mirror the existing
root `.env`/`.env.example` names.

## Verify
- Typecheck/build the backend; unit-test the auction + accounting (mock providers, deterministic).
- End-to-end against the mocks: import key → create+fund campaign → `POST /impressions` → earnings
  rise → `/withdraw` settles. ONE real Arc smoke at most.

## Done = the contract endpoints work against Postgres + mocks (and one real Arc settlement), so the
TUI (Plan 1) and web (Plan 2) both see consistent, synced data.
