// Environment loader for the REAL providers.
//
// This is the single place that reads `process.env`; the real providers
// themselves take explicit config objects (so they stay pure + testable). Each
// section is optional — `createProviders` (factory.ts) decides real-vs-mock from
// what is present and records every fallback visibly. Secrets are never logged.

import type { Token } from "./money"
import { USDC_DECIMALS } from "./money"

/** A plain `0x`-prefixed value, validated by shape (not checksummed). */
export type Hex = `0x${string}`

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/

/** Arc testnet connection + the USDC token its providers settle in. */
export interface ArcConfig {
  rpcUrl: string
  chainId: number
  /** USDC ERC-20 on Arc, sourced from `ARC_USDC_ADDRESS` (never hardcoded). */
  usdc: Token
}

/** The plain payer EOA that funds Circle Gateway x402 payments. */
export interface PayerConfig {
  address: Hex
  privateKey: Hex
}

/** Dynamic identity. Interactive browser sign-in is deferred (see CLAUDE.md); */
/** for the headless MVP we carry whatever identity env provides. */
export interface DynamicConfig {
  environmentId?: string
  serverApiKey?: string
  /** Dynamic JWT `sub`, reused verbatim as the Unlink userId once browser sign-in lands. */
  userId?: string
}

/** Unlink (privacy) connection + the user-side private account credential. */
export interface UnlinkConfig {
  /** Named hosted environment, e.g. "arc-testnet". */
  environment: string
  /** Engine URL escape hatch — required when `environment` is not a built-in name. */
  engineUrl?: string
  /** Backend/admin API key (never used from the client). */
  apiKey?: string
  /**
   * BIP-39 mnemonic for the user's private Unlink account. Normally derived from
   * the Dynamic embedded wallet in the browser (deferred) — absent in the
   * headless loop, so privacy falls back to the mock.
   */
  mnemonic?: string
}

export interface KickbackConfig {
  arc?: ArcConfig
  payer?: PayerConfig
  dynamic: DynamicConfig
  unlink: UnlinkConfig
}

type Env = Record<string, string | undefined>

function clean(v: string | undefined): string | undefined {
  if (v === undefined) return undefined
  const t = v.trim()
  return t === "" ? undefined : t
}

/** Read structured Kickback config from an environment map (defaults to `process.env`). */
export function readKickbackEnv(env: Env = process.env): KickbackConfig {
  const rpcUrl = clean(env.ARC_TESTNET_RPC_URL)
  const chainIdRaw = clean(env.ARC_CHAIN_ID)
  const usdcAddress = clean(env.ARC_USDC_ADDRESS)
  const chainId = chainIdRaw !== undefined ? Number(chainIdRaw) : NaN

  let arc: ArcConfig | undefined
  if (rpcUrl && usdcAddress && ADDRESS_RE.test(usdcAddress) && Number.isInteger(chainId) && chainId > 0) {
    arc = {
      rpcUrl,
      chainId,
      usdc: { symbol: "USDC", address: usdcAddress, decimals: USDC_DECIMALS },
    }
  }

  const payerAddress = clean(env.PAYER_ADDRESS)
  const payerKey = clean(env.PAYER_PRIVATE_KEY)
  let payer: PayerConfig | undefined
  if (payerAddress && payerKey && ADDRESS_RE.test(payerAddress) && PRIVATE_KEY_RE.test(payerKey)) {
    payer = { address: payerAddress as Hex, privateKey: payerKey as Hex }
  }

  const dynamic: DynamicConfig = {
    environmentId: clean(env.DYNAMIC_ENVIRONMENT_ID),
    serverApiKey: clean(env.DYNAMIC_SERVER_API_KEY),
    userId: clean(env.DYNAMIC_USER_ID),
  }

  const unlink: UnlinkConfig = {
    environment: clean(env.UNLINK_ENVIRONMENT) ?? "arc-testnet",
    engineUrl: clean(env.UNLINK_ENGINE_URL),
    apiKey: clean(env.UNLINK_API_KEY),
    mnemonic: clean(env.UNLINK_MNEMONIC),
  }

  return { arc, payer, dynamic, unlink }
}
