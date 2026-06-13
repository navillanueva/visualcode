# Plan 2 — Visual Code Web (frontend)

**Read first:** `plans/CONTRACT.md`, `visual-code-mvp-architecture.md`. Build a new self-contained
**SolidStart** app at **`/Users/nicolas.arnedo/visualcode/opencode/visual-web/`** (own `package.json`,
own `.env`, Railway root dir = this folder). Bun 1.3.14. OpenCode branding for the MVP.

## Why SolidStart
Matches the repo's web stack (`packages/console/app` is SolidStart) and runs on Railway. The backend
API routes (Plan 3) can live in this same SolidStart server, OR Plan 3 can be a separate service —
coordinate via `CONTRACT.md`. Default: **API routes live in this SolidStart app** (one Railway web
service + one Postgres) unless Plan 3 says otherwise.

## Wallet model (MVP) — IMPORT A KEY, no Dynamic creation
- Primary flow: **import a private key** (paste) → backend derives the address → that's your account.
  No Dynamic wallet creation in the MVP. (Optionally also "generate a new wallet".)
- **Dynamic social-login wallet = Phase 2** (a later layer; not required for the MVP). Leave a clean
  seam (an auth provider abstraction) so it can be added without rework.

## Pages (3)
1. **Landing** (`/`) — kickbacks.ai-style: what Visual Code is (ads in your coding harness; advertisers
   pay, developers earn, settled privately on Arc), a CTA to "Advertise" and "Connect wallet". Clean,
   OpenCode-branded. (You may reference `frontend-design` skill for quality.)
2. **Advertise** (`/advertise`) — create a campaign: advertiser name, ad text, URL, bid (USDC/1k
   impressions), budget. Fund it (calls `POST /api/campaigns/:id/fund`). Show live spend + remaining
   budget. Requires a connected wallet (imported key).
3. **Wallet / account** (`/wallet`) — import a private key (`POST /api/auth/import`); show address,
   balance, and accrued earnings; **generate a device token** (`POST /api/device-tokens`) with
   copy-to-clipboard + a one-liner telling the user to run `/wallet` in the OpenCode TUI and paste it.
   A "Withdraw" button (`POST /api/withdraw`).

## Data
- Everything via the backend per `CONTRACT.md` — no business logic in the frontend. Use the shared
  `toBaseUnits`/`fromBaseUnits` from `packages/kickback` (import as a workspace dep or copy the tiny
  `money.ts`).

## Deploy (Railway)
- Add `.env` (and `.env.example`) in `visual-web/`: `VISUALCODE_API_URL` (self for SSR), `DATABASE_URL`
  (from Railway Postgres), Arc/Unlink/Gateway settlement secrets IF this app also hosts the backend.
- Railway service root directory = `visual-web/`; build `bun run build`, start the SolidStart server.

## Verify
- `cd visual-web && bun run build` succeeds; pages render locally (`bun dev`); the three flows work
  against the backend (mock-backed first).

## Done = a public Railway URL where someone imports a key, creates+funds a campaign, and copies a
device token to paste into the TUI.
