# World ID personhood gate — Track B ($2,500) plan (2026-06-14)

## The pitch (what breaks without it)
Visual Code pays developers 50% of ad revenue per impression, reported **client-side** from the
TUI. The architecture doc already admits this is the weak point: *"impressions are client-reported …
Real ad-fraud defense is hard."* The concrete attack the user named: **one person runs 5 terminals,
each with a different wallet → 5 payout accounts → farms 5× the payouts for the same eyeballs.**

World ID 4.0 closes this as a **real constraint**: a person's `nullifier_hash` is unique per
(human, app, action). Bind it to the earning account and enforce DB-uniqueness → **one human = one
payout account**. This is exactly Track B's "uniqueness / fairness / rate-limits, breaks without
proof of human." Proof validation happens in our **web backend** (`visual-api`), as required.

Two framings (same widget, same verify endpoint):
1. **Developer one-account gate (PRIMARY)** — you can only *receive payment* from one World-ID-bound
   account. Kills the multi-terminal Sybil farm.
2. **Advertiser KYB (secondary)** — proof-of-human before a campaign can run (anti-abuse on ad copy).

## Why the TUI can't run the widget (and what "enforce from the TUI" means)
IDKit is a React/DOM widget — the terminal has no DOM (same hard constraint as Dynamic embedded
wallet, see `dynamic-and-tui-scoping.md`). So:
- **Proof is produced on the web** (`visual-web` wallet page, where the dev already does Dynamic
  login + mints the device token) and **validated in the backend**.
- **The TUI enforces the gate**: it reads `worldIdVerified` from the backend and refuses to surface
  payout / shows a "verify your humanity to get paid → <url>" banner until verified.

## World ID 4.0 specifics (verified from docs today)
- Frontend: `@worldcoin/idkit` → `IDKitRequestWidget` (4.0) with `app_id`, `action`, `rp_context`,
  `preset: orbLegacy({ signal })`, `handleVerify`, `onSuccess`.
- Backend verify: `POST https://developer.world.org/api/v4/verify/{rp_id}` — forward the IDKit
  result payload as-is; 200 = verified, 400 = fail. (Classic fallback: `IDKitWidget` +
  `POST https://developer.worldcoin.org/api/v2/verify/{app_id}` / `verifyCloudProof` — simpler, same
  `nullifier_hash`. Verifier lives in ONE module so the endpoint is a one-line swap.)
- `action` ("e.g. verify-account-2026") + `app_id` are created in the **World Developer Portal**
  (≈5 min, user-side, can run in parallel).

---

## Build plan (3 disjoint surfaces — parallelizable, like the original 3-agent build)

### A. Backend — `visual-api` (the real constraint + proof validation)  [~30–40 min]
1. **Schema** `src/db/schema.ts:8-16` (`accounts`): add
   `worldIdNullifier text("world_id_nullifier").unique()` + `worldIdVerifiedAt timestamp`.
   New migration `drizzle/0002_world_id.sql` (migrate.ts already applies sorted *.sql).
2. **Verifier** new `src/auth/world-id.ts`: `verifyWorldIdProof(payload)` → POST to World verify
   endpoint with `{ appId, action }` from env; returns `{ ok, nullifierHash }`. Never logs secrets.
3. **Env** `src/env.ts`: add `worldId: { appId, action }` from `WORLD_ID_APP_ID` / `WORLD_ID_ACTION`.
4. **Route** `src/app.ts` new `POST /api/me/verify-human` (session auth): verify proof → bind
   nullifier to account via new `repo.bindWorldId(accountId, nullifier)`. **Uniqueness is the gate**:
   if the nullifier is already bound to a *different* account → `409 { error: "already linked to
   another account" }` (this is the anti-Sybil core).
5. **Surface status**: add `worldIdVerified: boolean` to `GET /api/me` (`app.ts:307`) and
   `GET /api/me/earnings` (`app.ts:401`).
6. **Money gate**: `POST /api/withdraw` (`app.ts:345`) → `403` unless verified. ("Only account that
   can *receive payment*.") Keep impression accrual flowing so the demo still shows numbers.
7. **repo.ts**: `bindWorldId()`, `isWorldIdVerified()`, `accountForNullifier()`.
8. Tests: nullifier-uniqueness conflict (409), withdraw-blocked-until-verified (403→200). `bun test`.

### B. Web — `visual-web` (produce the proof)  [~20 min + portal setup user-side]
1. `app/wallet/page.tsx`: add the IDKit widget — "Verify you're human to receive payouts." On
   success `POST /api/me/verify-human` with the proof; show ✓ Verified / error (incl. the 409
   "this human already linked another account").
2. (If "advertiser KYB" chosen) same widget gating campaign create on `app/advertise/page.tsx`.

### C. TUI — `packages/tui` + `packages/kickback` (enforce + surface)  [~15 min]
1. `packages/kickback/src/client.ts`: parse `worldIdVerified` into `Earnings`
   (`client.ts:38-44` + `parseEarnings`).
2. `dialog-me.tsx` (`:59-111`): if `connected && !worldIdVerified`, replace the earnings/payout block
   with "⚠ Verify your humanity to receive payouts → <apiUrl-derived web link>". Keep showing
   accrued impressions so the value is visible.
3. (Optional) gate any future withdraw command behind the same flag.

## Feasibility verdict
- **Core (A + C)** = solidly inside the hour — exact file:line targets, disjoint files, mockable.
- **Full E2E (A + B + C)** = tight but doable IF we run the three surfaces in parallel AND the World
  Developer Portal app (`app_id` + `action`) is created alongside. The portal + a live browser proof
  is the only external dependency / wildcard.

## Verify
- `cd visual-api && bun test` (uniqueness 409 + withdraw 403/200).
- `bun turbo typecheck --filter=@opencode-ai/tui` + `cd packages/kickback && bun test`.
- Manual: web verify → TUI `/me` flips from "verify to get paid" → earnings; second account with the
  same World ID → 409.
