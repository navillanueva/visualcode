// Test harness: a fully in-process app — PGlite Postgres + mock settlement + a
// Dynamic verifier backed by a locally generated RS256 keypair. No network, no
// external Postgres, deterministic. Drive it via `app.request(...)`.

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
// drizzle-orm/pglite accepts a client via the config object form.
import { generateKeyPair, SignJWT, type KeyLike } from "jose"
import { createApp, type AppDeps, type TreasuryInfo } from "../src/app"
import { createDynamicVerifier } from "../src/auth/dynamic"
import type { Database } from "../src/db/index"
import { applySchema } from "../src/db/migrate"
import { createMockSettlementService } from "../src/settlement/mock"
import type { SettlementService } from "../src/settlement/service"

export interface TestHarness {
  app: ReturnType<typeof createApp>
  db: Database
  /** Sign a Dynamic-style JWT the app's verifier will accept. */
  signDynamicJwt(params: { sub: string; address: string; email?: string }): Promise<string>
  /** Sign a JWT with a DIFFERENT key (for negative verification tests). */
  signWithForeignKey(params: { sub: string; address: string }): Promise<string>
}

export const TEST_SECRET = "test-token-signing-secret-0123456789"

export async function makeHarness(
  opts: {
    now?: () => number
    settlement?: SettlementService
    treasury?: TreasuryInfo | null
    /** Inject a (stub) World ID verifier to exercise the personhood gate. */
    worldId?: AppDeps["worldId"]
  } = {},
): Promise<TestHarness> {
  const client = new PGlite()
  const db = drizzle({ client }) as unknown as Database
  await applySchema(db)

  const { publicKey, privateKey } = await generateKeyPair("RS256")
  const foreign = await generateKeyPair("RS256")
  const dynamicVerifier = createDynamicVerifier({ key: publicKey as KeyLike })

  const app = createApp({
    db,
    settlement: opts.settlement ?? createMockSettlementService(),
    dynamicVerifier,
    tokenSigningSecret: TEST_SECRET,
    secureCookies: false,
    corsOrigins: null,
    worldId: opts.worldId,
    treasury: opts.treasury ?? null,
    now: opts.now,
  })

  async function sign(key: KeyLike, params: { sub: string; address: string; email?: string }): Promise<string> {
    return new SignJWT({
      verified_credentials: [{ address: params.address, format: "blockchain", chain: "eip155" }],
      ...(params.email ? { email: params.email } : {}),
    })
      .setProtectedHeader({ alg: "RS256" })
      .setSubject(params.sub)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key)
  }

  return {
    app,
    db,
    signDynamicJwt: (params) => sign(privateKey as KeyLike, params),
    signWithForeignKey: (params) => sign(foreign.privateKey as KeyLike, params),
  }
}

/** Extract the `vc_session=...` pair from a response's Set-Cookie for reuse. */
export function sessionCookie(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? ""
  const m = /vc_session=[^;]+/.exec(raw)
  if (!m) throw new Error("no vc_session cookie in response")
  return m[0]
}

/** JSON helper for app.request. */
export function jsonInit(method: string, body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }
}
