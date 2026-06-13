# Visual Code — MVP Architecture & Build Plan

*Inflection-point planning doc, 2026-06-13. Supersedes the Railway-only note in
`dynamic-and-tui-scoping.md` with the agreed web-wallet model.*

## The one idea that makes everything click

**The backend (in `visual-web`) is the hub. The TUI and the website NEVER talk to each other —
they both talk to the backend, and the backend is the only thing that moves money.** The TUI is a
thin client: it shows an ad and reports impressions. Everything hard (auction, budgets, wallets,
settlement, privacy) lives in the backend. That's why most of the remaining work is in `visual-web`,
not in `opencode`.

```
 ADVERTISER (browser)                      DEVELOPER (terminal)
 Visual Code Web                           opencode / Visual Code TUI
   social login → Dynamic wallet             paste device token (or key)
   fund campaign, set bid          ┌──────►  shows served ad in status bar
        │ pay USDC                 │         counts 5s impressions
        ▼                          │              │ POST impressions
   ┌─────────────────────────── BACKEND (visual-web) ───────────────────────────┐
   │  auth/tokens · auction · budgets · impression ingest · accounting (50/50)   │
   │  SETTLEMENT: Circle Gateway x402 on Arc + Unlink (private) → dev's wallet    │
   │  source of truth (DB). Holds settlement authority (Dynamic server wallet)    │
   └──────────────────────────────────────────────────────────────────────────┘
        ▲ reads earnings (/me)                    ▲ reads spend / earnings
   developer's Dynamic wallet              advertiser & developer dashboards
```

## The money + sync flow (the part that was unclear)

1. **Advertiser funds a campaign (web).** Social login → Dynamic embedded wallet → pays USDC. The
   backend takes the deposit **privately via Unlink on Arc** → campaign budget in the DB (backed by a
   real on-chain deposit).
2. **Auction (backend).** Highest bid wins the slot (trivial ascending auction for MVP).
3. **Serve (TUI → backend).** The TUI authenticates with a **device token** and calls
   `GET /api/ad/serve` → backend returns the winning ad → TUI renders it in the status bar.
4. **Impression (TUI → backend).** The TUI counts 5-second views and calls
   `POST /api/impressions { adId, count }` (bearer token). This is **how the website knows someone
   opened the TUI and saw an ad** — the TUI tells the backend.
5. **Accounting (backend).** Per impression: decrement the advertiser's budget, credit the
   developer's earnings (50%) in the DB.
6. **Settlement = how the money actually moves (backend, on-chain).** Periodically or on withdraw,
   the backend settles on **Arc via Circle Gateway x402** and routes the developer's earnings
   **privately through Unlink** to their **Dynamic wallet address**. The backend holds settlement
   authority server-side (a Dynamic **server wallet** or a payer EOA). **The TUI never moves money or
   holds settlement keys.**
7. **Sync.** The backend DB is the single source of truth. The advertiser dashboard, the developer
   dashboard, and the TUI `/me` all read it. On-chain settlement reconciles the wallet balances.
   There is no direct TUI↔web channel — the API + DB are the sync point.

**Trust note (MVP):** impressions are client-reported, so the backend must validate (token, rate
limits, dedup). Real ad-fraud defense is hard; for the hackathon, basic validation + the token is
enough — call it out, don't pretend it's airtight.

## Repo division — yes, do it now

One monorepo, two clearly-separated areas; deploy only the web app.

```
visualcode/opencode/                 (repo root — stays the bun monorepo)
  packages/
    opencode, tui, core, …           the fork (TUI) — INSTALLED, not hosted
    kickback/                        SHARED: provider INTERFACES + MOCKS + types
  visual-web/                        NEW: SolidStart app — landing + 2 pages + BACKEND API
    .env                             (Railway/Vercel env lives here)
```
- `visual-web/` is **self-contained** (own `package.json`, own deploy config). The Vercel/Railway
  project's **root directory = `visual-web/`**, so it builds just the web app, not the whole TUI
  monorepo.
- The **real on-chain providers move OUT of the TUI into `visual-web`'s backend.** `packages/kickback`
  becomes the SHARED package: interfaces + mocks + types, imported by both. (Re-allocation, not waste
  — the loop's real Unlink/Gateway/Dynamic impls get lifted into the backend.)
- **Deploy target:** Railway is fine for a fast public URL; Vercel works too (SolidStart has presets
  for both). Pick one; Railway for speed now.

## What's LEFT inside `opencode/` (the TUI) — modest

Already built by the overnight loop: status-bar ad (currently the hardcoded `SAMPLE_AD`), local 5s
view-tracking, the `/me` dialog (mock), and the provider abstraction with real impls. Under the new
architecture the TUI becomes a thin client, so what remains is small:

1. **Connect UX** — mirror OpenCode's own `/connect` flow (see file map below) to add a "Visual Code"
   connection: paste a **device token** (default) or a **private key** (power-user). Store it exactly
   like an LLM key (`auth.json`).
2. **Backend client** — a thin module: `serveAd()`, `reportImpressions()`, `getEarnings()` — all
   bearer-token authenticated.
3. **Swap the ad source** — replace the hardcoded `SAMPLE_AD` in `adStore` with the backend-served ad
   (fetch on session start + poll).
4. **Wire impressions** — connect the existing `view-tracking` to `reportImpressions()`.
5. **`/me` reads the backend** earnings, not the mock.
6. **Branding** — OpenCode branding for the MVP (custom look later).
7. **Migrate** the real Unlink/Gateway/Dynamic provider impls OUT to the backend; keep interfaces +
   mocks in the shared `packages/kickback`.

## What goes in `visual-web/` — the bulk

1. **Landing page** (kickbacks.ai-style), OpenCode branding.
2. **Page 1 — Advertise:** Dynamic social login → wallet → create campaign (creative, bid, budget) →
   pay (wallet → Unlink private deposit) → see spend.
3. **Page 2 — Wallet / account:** Dynamic social login → embedded wallet → balance/earnings →
   withdraw. **Also where the developer generates the device token to paste into the TUI.**
4. **Backend (API routes):** token issue/verify, auction, budgets, `POST /impressions`,
   `GET /ad/serve`, `GET /me/earnings`, accounting (50/50), and **settlement orchestration** (the
   migrated real Unlink + Gateway + Dynamic-server-wallet code).
5. **DB:** users↔wallets, tokens, campaigns, budgets, impressions, earnings.

## OpenCode's API-key UX (open source — reuse it for the TUI connect)

MIT-licensed (`LICENSE`). The exact pattern to mirror for the wallet/token connect:
- `/connect` command: **`packages/tui/src/app.tsx:726-732`** → opens `DialogProviderList`.
- Provider picker + **API-key input**: **`packages/tui/src/component/dialog-provider.tsx`** —
  `ApiMethod()` (lines ~365-418) uses `<DialogPrompt placeholder="API key">` then
  `sdk.client.auth.set(providerID, { type: "api", key })`.
- **Storage:** **`packages/opencode/src/auth/index.ts`** → `auth.json` at
  `~/.local/share/opencode/auth.json` (mode `0600`), format
  `{ "<provider>": { "type": "api", "key": "…" } }`. (`Auth.set()` writes it; a modern SQLite path
  also exists in `packages/core/src/credential.ts`.)
- **Runtime read:** `packages/core/src/catalog.ts` (`project()` injects the key).

→ For the **TUI**, reuse this directly (add a `visualcode` "provider" whose "key" is the device
token). For **`visual-web`** (a web app), the *terminal* components don't port — build normal web auth
with Dynamic's web SDK; the "API-key UX" we copy is the TUI connect flow only.

## Build order (suggested)

1. **Repo division:** create `visual-web/` (SolidStart skeleton + `.env`), make `packages/kickback`
   the shared interfaces/mocks package. Deploy an empty `visual-web` to Railway for a live URL.
2. **visual-web backend skeleton:** the API contract above, backed by mocks first; DB; token issue.
3. **visual-web pages:** Advertise + Wallet (Dynamic social login). Pay path mocked, then real.
4. **TUI connect + client:** `/wallet` connect dialog (mirror `/connect`) + backend client; swap ad
   source; wire impressions; `/me` reads backend.
5. **Real settlement:** migrate Unlink/Gateway/Dynamic-server-wallet into the backend; one live
   end-to-end test (advertiser pays → impression → dev paid).
