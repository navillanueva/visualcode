# Plan 1 — OpenCode TUI thin-client fixes

**Repo:** `/Users/nicolas.arnedo/visualcode/opencode` · **Read first:** `plans/CONTRACT.md`,
`visual-code-mvp-architecture.md`. **Bun is 1.3.14** (plain `bun`). This is the SMALL plan — the TUI
becomes a thin client of the backend. Keep OpenCode branding for the MVP.

## Goal
Turn the already-built local ad surfaces into a backend-driven client, while **degrading gracefully
to the existing mock** when there's no backend configured (so the harness still works offline).

## Already built (by the overnight loop — reuse, don't rebuild)
- Status-bar ad: `packages/tui/src/kickback/status-bar-ad.tsx` (renders `adStore.ad` while busy).
- Local state + tracking: `packages/tui/src/kickback/{ad-store.ts,view-tracking.ts,ad-slot.tsx}`.
- `/me` dialog: `packages/tui/src/component/dialog-me.tsx` (+ `kickback/revenue.ts`).
- Provider interfaces + mocks: `packages/kickback/src/` (KEEP interfaces + mocks here; the REAL
  on-chain impls move to the backend per Plan 3 — you may leave `src/real/*` in place for now, just
  don't depend on it from the TUI).

## Tasks (one commit each; do NOT run git — leave commits to the human)
1. **Backend client** — `packages/kickback/src/client.ts`: `createKickbackClient({ baseUrl, token })`
   exposing `serveAd()`, `reportImpressions({adId,count})`, `getEarnings()` per `CONTRACT.md`. Plain
   `fetch`; on any network/auth error return a typed "unavailable" result (never throw into the TUI).
2. **Connect UX** — mirror OpenCode's own provider-connect flow:
   - Pattern to copy: `/connect` command at `packages/tui/src/app.tsx:726-732` → `DialogProviderList`
     in `packages/tui/src/component/dialog-provider.tsx` (`ApiMethod`, ~365-418, uses `<DialogPrompt>`
     then `auth.set(...)`). Storage: `packages/opencode/src/auth/index.ts` → `auth.json`.
   - Add a **`/wallet`** command + a small dialog that stores, under a `visualcode` auth entry:
     `apiUrl` (the Railway URL), `token` (device token from the web app), and optionally a raw
     `privateKey` (power-user). Use the SAME `auth.set`/`auth.json` mechanism — don't invent storage.
3. **Swap the ad source** — `ad-store.ts`: on session start, if a client is configured, call
   `serveAd()` and `setAd(...)`; otherwise keep `SAMPLE_AD`. Poll/refresh is optional for MVP.
4. **Wire impressions** — `view-tracking.ts`: when an impression window closes, call
   `reportImpressions(...)` if configured (batch is fine). No-op when unconfigured.
5. **`/me` reads the backend** — `dialog-me.tsx`/`revenue.ts`: prefer `getEarnings()`; fall back to the
   mock-derived view when unconfigured.

## Constraints
- **Display-only / never enters the LLM context** (status-bar ad already satisfies this).
- **Graceful degradation** is mandatory (no backend → current mock behavior, no errors).
- Match existing SolidJS + OpenTUI conventions; rely on type inference; no `any`.

## Verify
- `cd /Users/nicolas.arnedo/visualcode/opencode && bun turbo typecheck --filter=@opencode-ai/tui` → success.
- `cd packages/kickback && bun test` → green (add a small test for `client.ts` parsing + the
  unavailable fallback).
- Do not launch the interactive TUI.

## Done = a developer can `/wallet` paste a Railway URL + token, see the served ad in the status bar,
have impressions reported, and see real earnings in `/me` — and everything still works with nothing
configured.
