# Plan 5 — World ID personhood gate (Track B, $2,500)

**Repo:** `/Users/nicolas.arnedo/visualcode/opencode` (work on `main`).
**Read first:** `plans/CONTRACT.md`, `visual-code-mvp-architecture.md`, `dynamic-and-tui-scoping.md`.
**Surfaces (disjoint → built in parallel, like the original 3-agent build):** `visual-api` (backend),
`visual-web` (Next.js 16 / React 19), `packages/tui` + `packages/kickback` (TUI).

## The pitch — what breaks without proof of human
Visual Code pays developers 50% of ad revenue per impression, and impressions are **client-reported
from the TUI**. The architecture doc already names this as the weak point (*"impressions are
client-reported … real ad-fraud defense is hard"*). The concrete attack: **one person runs N
terminals, each with a different wallet → N payout accounts → farms N× the payout for the same
eyeballs.**

World ID 4.0 turns this into a **real constraint**: a person's `nullifier_hash` is unique per
(human, app, action). Bind it to the account and enforce DB-uniqueness → **one human = one account**.
That is exactly Track B ("uniqueness / fairness / rate-limits, breaks without proof of human"), and
proof validation happens in our **web backend** (`visual-api`) as the bounty requires.

Two enforcement framings (one widget, one verify endpoint, one shared `action`):
1. **Developer payout gate (PRIMARY)** — you can only *receive payment* from a World-ID-bound
   account. Kills the multi-terminal Sybil farm.
2. **Advertiser KYB** — proof-of-human required before a campaign can run, so randoms can't push
   abusive ad copy.

Using **one shared `action`** means a human can bind exactly one account total (advertiser and/or
developer = the same verified account, `role: "both"`), which is the strongest anti-Sybil story.

## Why the TUI can't run the widget — and what "enforce from the TUI" means
IDKit is a React/DOM widget; the terminal has no DOM (the same hard wall documented for the Dynamic
embedded wallet). So the **proof is produced on the web** (the wallet page where the dev already does
Dynamic login + mints the device token) and **validated in `visual-api`**. The **TUI enforces** by
reading a `worldIdVerified` flag and refusing to surface payout / showing a *"verify your humanity to
get paid → <url>"* banner until it flips. Accrual keeps flowing so the demo still shows numbers.

## World ID 4.0 specifics (verified from docs, 2026-06-14)
- Frontend `@worldcoin/idkit`: 4.0 `IDKitRequestWidget` (`app_id`, `action`, `rp_context`,
  `preset: orbLegacy({ signal })`, `handleVerify`, `onSuccess`); classic `IDKitWidget` is the stable
  fallback. Use whichever the installed package version exposes; prefer 4.0.
- Backend verify is isolated in ONE module (`src/auth/world-id.ts`) so the endpoint/version is a
  one-line, env-driven swap: 4.0 `POST https://developer.world.org/api/v4/verify/{rp_id}` (forward
  payload as-is) ⟷ classic `POST https://developer.worldcoin.org/api/v2/verify/{app_id}` with
  `{ nullifier_hash, merkle_root, proof, verification_level, action }`. The **constraint
  (nullifier-uniqueness) is identical across versions** — that is the part judges grade.
- `app_id` + `action` are created in the **World Developer Portal** (~5 min, user-side).

---

## Locked contract (the delta on `plans/CONTRACT.md`)
- `POST /api/me/verify-human` (session): body = IDKit payload → verify → bind nullifier.
  `200 {ok:true,worldIdVerified:true}` · `409 {ok:false,error:"already_linked"}` (nullifier on a
  different account — the anti-Sybil block) · `400 {ok:false,error:"verification_failed"}` ·
  `503 {ok:false,error:"worldid_not_configured"}` when no `WORLD_ID_APP_ID`.
- `GET /api/me` and `GET /api/me/earnings` → add `worldIdVerified: boolean`.
- `POST /api/withdraw` → `403 {ok:false,error:"personhood_required"}` unless verified.
- `POST /api/campaigns` → `403 {ok:false,error:"personhood_required"}` unless verified (KYB).
- Env: `WORLD_ID_APP_ID`, `WORLD_ID_ACTION`, optional `WORLD_ID_VERIFY_URL`;
  web `NEXT_PUBLIC_WORLD_ID_APP_ID`, `NEXT_PUBLIC_WORLD_ID_ACTION`.

## A. Backend — `visual-api`  [~30–40 min]
1. `src/db/schema.ts` (`accounts`): `worldIdNullifier text.unique()` + `worldIdVerifiedAt timestamp`.
   New `drizzle/0002_world_id.sql` (migrate.ts applies sorted `*.sql`).
2. `src/auth/world-id.ts` (NEW): `createWorldIdVerifier({appId,action,verifyUrl}).verify(payload)` →
   `{ nullifierHash }`; throws on non-200; never logs proof/secrets.
3. `src/env.ts`: `worldId: { appId?, action, verifyUrl? }`.
4. `src/db/repo.ts`: `bindWorldId(accountId, nullifier) -> "ok"|"conflict"` (idempotent for same
   account, conflict if nullifier on another), `isWorldIdVerified(accountId)`.
5. `src/app.ts`: new `POST /api/me/verify-human`; add `worldIdVerified` to `/api/me` (`:307`) +
   `/api/me/earnings` (`:401`); 403 gate on `/api/withdraw` (`:345`) + `POST /api/campaigns` (`:217`).
6. `src/index.ts` + app factory: inject the verifier into `AppDeps` (mirror `dynamicVerifier`).
7. Tests: nullifier conflict (409), withdraw 403→200, campaign 403→200. `cd visual-api && bun test`.

## B. Web — `visual-web` (Next.js 16 / React 19)  [~20 min + portal setup user-side]
1. `bun add @worldcoin/idkit` (self-contained app — its own package.json/lockfile).
2. `<VerifyHuman/>` component (IDKit widget → `handleVerify` POST `/api/me/verify-human`).
3. `lib/api.ts`: `verifyHuman(payload)`; surface `worldIdVerified` from `getMe()`.
4. `app/wallet/page.tsx`: ✓ Verified / "Verify to receive payouts" + 409 messaging.
5. `app/advertise/page.tsx`: gate create behind verification; handle 403.

## C. TUI — `packages/tui` + `packages/kickback`  [~15 min]
1. `packages/kickback/src/client.ts`: add `worldIdVerified` to `Earnings` + `parseEarnings`
   (default false, graceful).
2. `packages/tui/src/kickback/revenue.ts`: surface the flag in `buildRevenueView`.
3. `packages/tui/src/component/dialog-me.tsx`: if `connected && !worldIdVerified`, show
   "⚠ Verify your humanity to receive payouts → <web url>" in place of the payout block; keep
   accrued impressions visible.
4. `cd packages/kickback && bun test` + `bun turbo typecheck --filter=@opencode-ai/tui`.

## Feasibility
Core (A+C) is comfortably in the hour. Full E2E (A+B+C) is tight but doable in parallel; the only
external wildcard is the World Developer Portal app (`app_id` + `action`) + one live browser proof.

## Verify
- `cd visual-api && bun test` (409 + 403/200 gates).
- `bun turbo typecheck --filter=@opencode-ai/tui` + `cd packages/kickback && bun test`.
- Manual: web verify → TUI `/me` flips "verify to get paid" → earnings; a 2nd account with the same
  World ID → 409; unverified advertiser → blocked at campaign create.
