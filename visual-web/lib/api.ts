// Typed client for the visual-api backend (Plan 3). This file is the ONLY place
// the frontend talks to the backend, and it implements exactly the web-facing
// surface of plans/CONTRACT.md — no business logic lives here.
//
// Web routes authenticate with a session cookie, so every request sends
// `credentials: "include"`. Non-2xx responses throw with the status + body text
// so failures surface loudly instead of being swallowed.

const BASE_URL = (process.env.NEXT_PUBLIC_VISUALCODE_API_URL ?? "http://localhost:8787").replace(/\/$/, "")

/** All money fields are token base units encoded as decimal strings (see Treasury.decimals). */
export interface Campaign {
  id: string
  advertiser: string
  text: string
  url: string
  bidBaseUnits: string
  /** Original funded budget (what must be paid to fund). */
  budgetBaseUnits?: string
  budgetRemainingBaseUnits?: string
  /** Total spent so far, if the backend reports it. */
  spendBaseUnits?: string
  status?: string
  createdAt?: string
}

/** Where + how to pay the campaign budget on-chain (GET /api/treasury). */
export interface Treasury {
  /** EOA the advertiser sends the public USDC transfer to. */
  address: string
  /** ERC-20 token to send. */
  token: string
  chainId: number
  /** Decimals of `token` — drives every human↔base conversion + parseUnits. */
  decimals: number
}

export interface Me {
  address: string
  balanceBaseUnits: string
  role?: string
  /** True once the account has linked a World ID proof (Plan 5 personhood gate). */
  worldIdVerified?: boolean
}

export interface AuthResult {
  address: string
  ok: boolean
  /** Signed session token — sent back as `Authorization: Bearer` on later calls. */
  session?: string
}

// Web and API live on different hosts, so a cross-site session cookie can't be
// relied on (SameSite/3p-cookie blocking). The auth endpoints return a signed
// session token; we persist it and send it as a Bearer header on every request.
const SESSION_KEY = "vc_session"
let sessionToken: string | null = null

function loadSession(): string | null {
  if (sessionToken) return sessionToken
  if (typeof localStorage !== "undefined") sessionToken = localStorage.getItem(SESSION_KEY)
  return sessionToken
}

/** Persist (or clear) the session token used to authenticate web routes. */
export function setSession(token: string | null): void {
  sessionToken = token
  if (typeof localStorage === "undefined") return
  if (token) localStorage.setItem(SESSION_KEY, token)
  else localStorage.removeItem(SESSION_KEY)
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    const token = loadSession()
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch (cause) {
    // Network-level failure (backend down, CORS, DNS). Surface it plainly.
    throw new ApiError(0, String(cause), `Could not reach the backend at ${BASE_URL}${path}. Is visual-api running?`)
  }

  const raw = await res.text()
  if (!res.ok) {
    throw new ApiError(res.status, raw, `${init?.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText}`)
  }
  if (!raw) return undefined as T
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new ApiError(res.status, raw, `${path} returned a non-JSON body`)
  }
}

// --- Auth -----------------------------------------------------------------

/** Primary (non-custodial): verify the Dynamic JWT, link the account to its wallet. */
export async function authDynamic(dynamicJwt: string): Promise<AuthResult> {
  const res = await request<AuthResult>("/api/auth/dynamic", {
    method: "POST",
    body: JSON.stringify({ dynamicJwt }),
  })
  if (res.session) setSession(res.session)
  return res
}

/** Fallback (custodial): import a raw private key; the backend stores it encrypted. */
export async function authImport(privateKey: string): Promise<AuthResult> {
  const res = await request<AuthResult>("/api/auth/import", {
    method: "POST",
    body: JSON.stringify({ privateKey }),
  })
  if (res.session) setSession(res.session)
  return res
}

// --- Account / device token ----------------------------------------------

export function getMe(): Promise<Me> {
  return request<Me>("/api/me")
}

/** Issue a TUI device token for the logged-in account. */
export function createDeviceToken(): Promise<{ token: string }> {
  return request<{ token: string }>("/api/device-tokens", { method: "POST" })
}

/** Settle accrued earnings to the account's wallet (Gateway x402 + Unlink). */
export function withdraw(): Promise<{ ok: boolean; txRef?: string | null }> {
  return request<{ ok: boolean; txRef?: string | null }>("/api/withdraw", { method: "POST" })
}

// --- World ID personhood (Plan 5) -----------------------------------------

/**
 * The IDKit success payload, forwarded to the backend verbatim. Structurally
 * matches `ISuccessResult` from `@worldcoin/idkit` (classic widget), so the
 * component can hand the proof straight through without re-shaping it.
 */
export interface WorldIdProof {
  proof: string
  merkle_root: string
  nullifier_hash: string
  verification_level: string
}

/** Outcome of POST /api/me/verify-human. `error` is the backend's machine code. */
export interface VerifyHumanResult {
  ok: boolean
  /** e.g. "already_linked" (409), "verification_failed" (400), "worldid_not_configured" (503). */
  error?: string
}

/**
 * Link a World ID proof to the logged-in account (the anti-Sybil personhood
 * gate). Authenticates with the same Bearer session token as every other authed
 * call. The backend's error states (409 already_linked / 400 verification_failed
 * / 503 worldid_not_configured) arrive as non-2xx responses; we decode the
 * `{error}` body and return it so callers can show friendly messaging instead of
 * a raw throw. Non-API failures (network) still surface as a thrown ApiError.
 */
export async function verifyHuman(payload: WorldIdProof): Promise<VerifyHumanResult> {
  try {
    return await request<VerifyHumanResult>("/api/me/verify-human", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  } catch (e) {
    // The contract's failure responses carry a JSON `{ok:false,error}` body.
    if (e instanceof ApiError && e.status > 0 && e.body) {
      try {
        const parsed = JSON.parse(e.body) as VerifyHumanResult
        if (typeof parsed?.error === "string") return { ok: false, error: parsed.error }
      } catch {
        /* non-JSON body — fall through to rethrow so the failure stays visible */
      }
    }
    throw e
  }
}

// --- Campaigns ------------------------------------------------------------

export interface CreateCampaignInput {
  advertiser: string
  text: string
  url: string
  /** USDC base units (string). Use money.ts `toBaseUnits` to build these. */
  bidBaseUnits: string
  budgetBaseUnits: string
}

export function createCampaign(input: CreateCampaignInput): Promise<{ campaign: Campaign }> {
  return request<{ campaign: Campaign }>("/api/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

/** Where + how to pay the campaign budget on-chain. */
export function getTreasury(): Promise<Treasury> {
  return request<Treasury>("/api/treasury")
}

/**
 * Activate a campaign after paying its budget on-chain. `paymentTxHash` is the
 * advertiser's public USDC transfer to the treasury; the backend verifies it, then
 * does the private Unlink deposit into the pool.
 */
export function fundCampaign(id: string, paymentTxHash: string): Promise<{ campaign: Campaign; txRef: string | null }> {
  return request<{ campaign: Campaign; txRef: string | null }>(`/api/campaigns/${encodeURIComponent(id)}/fund`, {
    method: "POST",
    body: JSON.stringify({ paymentTxHash }),
  })
}

/** The logged-in advertiser's campaigns + spend. Tolerates either response shape. */
export async function listCampaigns(): Promise<Campaign[]> {
  const data = await request<Campaign[] | { campaigns: Campaign[] }>("/api/campaigns")
  return Array.isArray(data) ? data : (data?.campaigns ?? [])
}

export { BASE_URL as API_BASE_URL }
