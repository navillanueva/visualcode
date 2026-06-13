// Money primitives shared by every Kickback provider.
//
// Decimal discipline (see CLAUDE.md / sdk-and-env-reference.md):
//   - Unlink amounts are *base units* (integer, USDC = 6 dp -> 1_000_000n = 1 USDC).
//   - Circle Gateway deposits are *decimal* strings ("1.99").
//   - Arc native gas is 18 dp; ERC-20 USDC is 6 dp. Never mix the two.
// These helpers are the single conversion boundary so we never hand-roll the math.

/** Decimal places for USDC on Arc (ERC-20). */
export const USDC_DECIMALS = 6 as const

/** A token we can hold, transfer, or settle in. */
export interface Token {
  /** Human symbol, e.g. "USDC". */
  symbol: string
  /**
   * ERC-20 contract address on Arc testnet. Real providers load this from
   * `ARC_USDC_ADDRESS` in `.env`; never hardcode an unverified address here.
   */
  address: string
  /** Decimal places used for base-unit conversion (USDC = 6). */
  decimals: number
}

/**
 * Amount expressed in a token's base units (an integer, never fractional).
 * Modelled as a bigint so we never lose precision the way `number` would.
 */
export type BaseUnits = bigint

/**
 * Convert a decimal string ("1.99") into base units for the given decimals.
 * Throws on malformed input or on more fractional digits than the token allows
 * — we fail visibly rather than silently truncating someone's money.
 */
export function toBaseUnits(decimal: string, decimals: number = USDC_DECIMALS): BaseUnits {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`invalid decimals: ${decimals}`)
  }
  const trimmed = decimal.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`invalid decimal amount: ${JSON.stringify(decimal)}`)
  }
  const [whole = "0", fraction = ""] = trimmed.split(".")
  if (fraction.length > decimals) {
    throw new Error(`amount "${decimal}" has more than ${decimals} decimal places`)
  }
  const padded = fraction.padEnd(decimals, "0")
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0")
}

/**
 * Convert base units back into a normalized decimal string ("1.99"), dropping
 * trailing zeros. Throws on negative input — token balances are never negative.
 */
export function fromBaseUnits(base: BaseUnits, decimals: number = USDC_DECIMALS): string {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`invalid decimals: ${decimals}`)
  }
  if (base < 0n) {
    throw new Error(`base units must be non-negative: ${base}`)
  }
  if (decimals === 0) return base.toString()
  const divisor = 10n ** BigInt(decimals)
  const whole = base / divisor
  const fraction = base % divisor
  const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "")
  return fractionStr ? `${whole}.${fractionStr}` : whole.toString()
}
