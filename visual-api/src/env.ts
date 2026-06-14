// Server configuration loaded from the environment. Only the prod entrypoint
// (src/index.ts) and the migrate CLI use this; tests construct deps directly.

export interface ServerConfig {
  port: number
  databaseUrl: string
  tokenSigningSecret: string
  /** Allowed browser origins for CORS; null = reflect the request origin (dev). */
  corsOrigins: string[] | null
  secureCookies: boolean
  settlementMode: "mock" | "real"
  dynamic: { environmentId?: string; serverApiKey?: string }
  /** World ID personhood gate. `appId` unset ⇒ the verify-human endpoint degrades
   *  to 503 and the gates are no-ops (mock/dev). `verifyUrl` overrides the cloud
   *  verify base (the 4.0 ⟷ classic endpoint swap is env-driven, see world-id.ts). */
  worldId: { appId?: string; action: string; verifyUrl?: string }
  /** Public web app base URL, surfaced in earnings so the TUI can link to verify. */
  webAppUrl?: string
}

function required(env: Record<string, string | undefined>, key: string): string {
  const v = env[key]?.trim()
  if (!v) throw new Error(`${key} is required`)
  return v
}

export function loadServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const corsRaw = (env.CORS_ORIGIN ?? "").trim()
  const corsOrigins = corsRaw
    ? corsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null
  const apiUrl = env.VISUALCODE_API_URL ?? ""
  return {
    port: Number(env.PORT ?? "8787") || 8787,
    databaseUrl: required(env, "DATABASE_URL"),
    tokenSigningSecret: required(env, "TOKEN_SIGNING_SECRET"),
    corsOrigins,
    secureCookies: env.NODE_ENV === "production" || /^https:/i.test(apiUrl),
    settlementMode: env.SETTLEMENT_MODE === "real" ? "real" : "mock",
    dynamic: {
      environmentId: env.DYNAMIC_ENVIRONMENT_ID?.trim() || undefined,
      serverApiKey: env.DYNAMIC_SERVER_API_KEY?.trim() || undefined,
    },
    worldId: {
      appId: env.WORLD_ID_APP_ID?.trim() || undefined,
      action: env.WORLD_ID_ACTION?.trim() || "visualcode-account",
      verifyUrl: env.WORLD_ID_VERIFY_URL?.trim() || undefined,
    },
    webAppUrl: env.WEB_APP_URL?.trim() || undefined,
  }
}
