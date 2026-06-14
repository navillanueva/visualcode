// Production entrypoint. Loads config, connects Postgres (Bun native), applies
// the (idempotent) schema, builds the settlement service + Dynamic verifier, and
// serves the Hono app with Bun.serve (via the default export).

import { createApp, type TreasuryInfo } from "./app"
import { createDynamicVerifier } from "./auth/dynamic"
import { createDatabase } from "./db/index"
import { applySchema } from "./db/migrate"
import { loadServerConfig } from "./env"
import { readKickbackEnv } from "@kickback/config"
import { createSettlementService } from "./settlement/factory"

const config = loadServerConfig()
const db = createDatabase(config.databaseUrl)
await applySchema(db)

const settlement = await createSettlementService({ mode: config.settlementMode })
const dynamicVerifier = createDynamicVerifier({
  environmentId: config.dynamic.environmentId,
  serverApiKey: config.dynamic.serverApiKey,
})

// Treasury info for GET /api/treasury (the EOA advertisers pay + token/chain/decimals).
const kb = readKickbackEnv()
const treasury: TreasuryInfo | null =
  kb.arc && kb.treasuryAddress
    ? { address: kb.treasuryAddress, token: kb.arc.usdc.address, chainId: kb.arc.chainId, decimals: kb.arc.usdc.decimals }
    : null

const app = createApp({
  db,
  settlement,
  dynamicVerifier,
  tokenSigningSecret: config.tokenSigningSecret,
  secureCookies: config.secureCookies,
  corsOrigins: config.corsOrigins,
  treasury,
  // Fixed-price bid uses the deployment's USDC decimals (ARC_USDC_DECIMALS); the
  // app defaults to USDC_DECIMALS when arc isn't configured (mock/dev).
  usdcDecimals: kb.arc?.usdc.decimals,
})

console.log(`visual-api listening on :${config.port} (settlement=${settlement.mode})`)
for (const note of settlement.notes) console.log(`  • ${note}`)

export default { port: config.port, fetch: app.fetch }
