// Typed client for the visual-api backend (Plan 3). This file is the ONLY place
// the frontend talks to the backend, and it implements exactly the web-facing
// surface of plans/CONTRACT.md — no business logic lives here.
//
// Web routes authenticate with a session cookie, so every request sends
// `credentials: "include"`. Non-2xx responses throw with the status + body text
// so failures surface loudly instead of being swallowed.

const BASE_URL = (process.env.NEXT_PUBLIC_VISUALCODE_API_URL ?? "http://localhost:8787").replace(/\/$/, "")

/** All money fields are USDC base units (6 dp) encoded as decimal strings. */
export interface Campaign {
  id: string
  advertiser: string
  text: string
  url: string
  bidBaseUnits: string
  budgetRemainingBaseUnits?: string
  /** Total spent so far, if the backend reports it. */
  spentBaseUnits?: string
  status?: string
  createdAt?: string
}

export interface Me {
  address: string
  balanceBaseUnits: string
  role?: string
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
export function withdraw(): Promise<{ ok: boolean; tx_ref?: string }> {
  return request<{ ok: boolean; tx_ref?: string }>("/api/withdraw", { method: "POST" })
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

/** Trigger the on-chain private deposit (Unlink on Arc) that funds the campaign. */
export function fundCampaign(id: string): Promise<{ campaign: Campaign }> {
  return request<{ campaign: Campaign }>(`/api/campaigns/${encodeURIComponent(id)}/fund`, {
    method: "POST",
  })
}

/** The logged-in advertiser's campaigns + spend. Tolerates either response shape. */
export async function listCampaigns(): Promise<Campaign[]> {
  const data = await request<Campaign[] | { campaigns: Campaign[] }>("/api/campaigns")
  return Array.isArray(data) ? data : (data?.campaigns ?? [])
}

export { BASE_URL as API_BASE_URL }
