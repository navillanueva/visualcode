# ETH Global AI Plans

The planning, architecture, and AI-orchestration docs used to build **Visual Code** — a fork of
[OpenCode](https://github.com/anomalyco/opencode) (MIT) that turns the harness's wait-state status
line into a privacy-preserving, crypto-native ad marketplace (advertisers pay, developers earn 50%,
settled on **Arc** as Circle Gateway x402 nanopayments, kept private via **Unlink**, wallets via
**Dynamic**).

Included per ETHGlobal's *"add your plan files to the repo"* rule — this is exactly how the project
was planned and built with AI.

## How AI was used
- **Overnight autonomous build (the "Ralph loop"):** `ralph.sh` + `ralph-prompt.md` + `CLAUDE.md` ran
  a fresh Claude Code instance per task (orient → build ONE task → verify build/tests → commit →
  update progress → exit), so context stayed small and work was checkpointed. Progress in `PROGRESS.md`.
- **3-agent parallel build:** the TUI, the Next.js frontend, and the Hono/Postgres backend were built
  in separate git worktrees by three Claude Code agents against a single shared API contract
  (`plans/CONTRACT.md`).
- **No fabrication:** chain IDs, contract addresses, and SDK signatures were verified before use (see
  `sdk-and-env-reference.md`); unknowns were left as explicit `TODO(human)`.

## Contents
- `kickback-ai-build-plan.md` — original product thesis, prize strategy, and the 6-step build plan.
- `sdk-and-env-reference.md` — verified SDK + environment reference (Unlink, Dynamic, Circle Gateway, Arc).
- `CLAUDE.md` — the overnight-loop build instructions (scope + golden rules).
- `ralph.sh` / `ralph-prompt.md` — the autonomous loop runner + the per-iteration prompt.
- `PROGRESS.md` — the task-by-task build log the loop maintained.
- `dynamic-and-tui-scoping.md` — why an embedded wallet can't be pure-TUI, and the MCP workaround.
- `visual-code-mvp-architecture.md` — the "backend is the hub" MVP architecture.
- `plans/` — `CONTRACT.md` (the shared API contract) + per-component plans (TUI / frontend / backend),
  and `plan-4-private-custodial-settlement.md` (v0.4: make payments private via Unlink — custodial
  pooled model, real deposit + withdraw legs, ledger does the 50/50 split),
  and `plan-5-world-id-personhood.md` (Track B: World ID 4.0 as a real constraint — one human = one
  payout account, killing the multi-terminal Sybil farm; advertiser KYB on the same widget).
