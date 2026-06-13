# Vendored from `packages/kickback`

These files are a **copy** of the shared `@kickback/*` source
(`packages/kickback/src/{money,config,wallet,privacy,settlement}.ts` and
`packages/kickback/src/mock/*`). The `@kickback/*` path aliases in
`visual-api/tsconfig.json` point here.

**Why:** Railway deploys `visual-api/` with Root Directory = `visual-api`, an
isolated build context that cannot reach the sibling `../packages/kickback`
directory. The service must therefore carry the shared interfaces + mocks +
money helpers it imports.

**Source of truth** is still `packages/kickback` (also used by the TUI). If you
change the shared types/mocks there, re-sync by re-copying those files here.
Only the mock/offline path is vendored — the real settlement providers
(`@unlink`/`@circle`) live in `visual-api/src/settlement/real*.ts`.
