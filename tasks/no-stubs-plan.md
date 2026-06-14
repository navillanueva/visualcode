# No-Stubs MVP — parallel agent plan (2026-06-14)

**Goal:** zero mocks/stubs in the LIVE demo.
**Scope locked (per Nico):** fixed **$10 / 1,000 views** ($0.01/view, dev gets 50%), **no bid
queue** (leave the fixed sample), **no anti-fraud / dedup / focus-gate**, **impressions only**
(clicks hidden). The backend money loop is already REAL + audited — the remaining work is: (A) turn
it on in prod, (B) one read endpoint + pricing, (C) make TUI show real numbers, and fold the web
real-data wiring into the redesign agent.

Run **A / B / C / redesign all from T0**. They touch different surfaces → no collisions.

---

## Shared contracts (lock these at T0 so the web can build against them)
- `GET /api/me` → `{ address, balanceBaseUnits, role }`  *(exists)*
- `GET /api/me/earnings` → `{ balanceBaseUnits, impressions, walletAddress }`  *(exists; drop `clicks`)*
- `GET /api/me/impressions?limit=N` → `[{ campaignId, advertiser, text, count, creditedBaseUnits, createdAt }]`  **(NEW — Plan B)**
- `GET /api/treasury` → `{ address, token, chainId, decimals }`  *(exists; returns 200 once real mode is on)*
- Fixed bid = **$10 / 1,000 views**; chart + today/month/lifetime are derived **client-side** from
  the impressions list (no time-series endpoint needed).

---

## PLAN A — turn settlement REAL on Railway   ·   agent: ops/backend   ·   packaging step (NO external dep)
> Unlink-on-Arc + the SDK are already PROVEN (a real deposit→withdraw smoke passed). The SDK is
> already installed locally (bun store, symlinked). The ONLY reason real mode can't load on Railway:
> `@unlink-xyz/sdk@0.3.0-canary.552` isn't on public npm, so the Railway `bun install` can't fetch it.
1. ✅ DONE — vendored as `visual-api/vendor/unlink-xyz-sdk-0.3.0-canary.552.tgz`, referenced via
   `file:` in package.json + bun.lock. Verified on a clean machine (frozen install, no bun store):
   `dist` present, `@unlink-xyz/sdk/client` + `/admin` resolve, build passes, 51 tests green.
   (Tarball, not a dir `file:` dep — bun's dir install ran the pkg's `prepack` and wiped `dist`.)
   → just push the commit below; Railway will then install it. Real mode stays OFF until step 2.
2. Set Railway `visual-api` vars: `SETTLEMENT_MODE=real`, `ARC_TESTNET_RPC_URL`, `ARC_CHAIN_ID`,
   `ARC_USDC_ADDRESS`, `ARC_USDC_DECIMALS` (18 for the pool token), `PAYER_ADDRESS`,
   `PAYER_PRIVATE_KEY`, `UNLINK_MNEMONIC`, `UNLINK_ENGINE_URL`, `UNLINK_API_KEY`, `TREASURY_ADDRESS`.
3. Fund the treasury EOA with Arc USDC + a little native gas.
4. Deploy → verify `/health` reconciliation `healthy:true` + `/api/treasury` → 200.
5. Live smoke: `KICKBACK_SMOKE_CONFIRM=1 bun run smoke --unlink-deposit 0.10 --unlink-withdraw 0.05`.
**Done when:** `/api/treasury` 200 (unblocks `/advertise` funding) + one real fund→withdraw round-trip.
**Est:** 2–3h. No external dependency — the SDK is already on the machine; this is vendor-into-repo + env + smoke.

## PLAN B — backend real-data endpoint + pricing   ·   agent: backend   ·   no gate
1. Add `GET /api/me/impressions` (dev's recent impression rows, joined to campaign for
   advertiser/text + per-row `creditedBaseUnits` + `createdAt`). Reads the already-real ledger.
2. Set fixed bid default **$10/1,000** in create-campaign (default or server-enforced).
3. Remove the hardcoded `clicks: 0` from the earnings contract (or keep 0 and hide in UI).
4. Tests for the new endpoint; `bun test` green.
**Done when:** endpoint returns real DB rows; tests pass. **Est:** 1–2h.

## PLAN C — TUI real data   ·   agent: TUI (the existing one)   ·   no gate
1. `/me` (revenue.ts): drop `getDemoPrivateBalance` mock faucet → use real `getEarnings()` balance.
2. Confirm `serveAd` + `reportImpressions` hit the deployed API when a device token is configured
   (and SAMPLE_AD only shows with a clear "not connected" hint).
3. (optional brand) status-bar `◆` → indigo `›` caret.
**Done when:** `bun dev` `/me` shows real backend earnings with a pasted device token. **Est:** 1–2h.

## REDESIGN agent (already running) — ADD real-data wiring
Give it the contracts above so it wires real data instead of leaving `TODO(human)` placeholders
(it's already in these files — avoids a second agent + merge conflicts):
- `/wallet`: real balance from `GET /api/me`; **fix the `SAMPLE_TOKEN` fallback** → show an error
  state, never hand a fake token; drop the hardcoded default email.
- `/me`: real balance/earnings + `GET /api/me/impressions` for the ledger; bucket it client-side for
  the chart + today/month/lifetime; **hide clicks**.
- `/advertise`: real campaigns/serving/spend from `listCampaigns`; **leave the bid queue + views/rank
  fixed** (descoped).

---

## Timing (parallel)
```
T0 ─┬─ PLAN A (vendor SDK + env + smoke) ─ 2–3h
    ├─ PLAN B (impressions endpoint) ──── 1–2h ──┐
    ├─ PLAN C (TUI real balance) ──────── 1–2h    │
    └─ REDESIGN (web visuals + wiring) ── lands ~3–4h, consumes B's endpoint
```
**Wall-clock to a no-stubs demo: ~half a day (4–5h), all parallel.** No external blocker —
Unlink-on-Arc + the SDK are already proven; Plan A is vendoring the SDK into the repo + setting env.
