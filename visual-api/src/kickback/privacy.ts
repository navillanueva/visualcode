// PrivacyProvider — the private balance layer (Unlink on arc-testnet in prod).
//
// Developer ad earnings land here so the payout trail is unlinkable. Mirrors the
// Unlink client operations we use: ensureRegistered / getBalances / faucet /
// transfer / withdraw. All amounts are *base units* (see money.ts).

import type { BaseUnits, Token } from "./money"

/** A private balance held for one token. */
export interface PrivacyBalance {
  token: Token
  /** Balance in the token's base units. */
  amount: BaseUnits
}

/** A private transfer to another Unlink account. */
export interface PrivacyTransfer {
  /** Recipient's Unlink-side address. */
  recipientAddress: string
  token: Token
  /** Amount in base units. */
  amount: BaseUnits
}

/** A withdrawal from the private account out to a public EVM address. */
export interface PrivacyWithdraw {
  /** Destination plain EVM address. */
  recipientEvmAddress: string
  token: Token
  /** Amount in base units. */
  amount: BaseUnits
}

export interface PrivacyProvider {
  /** Idempotently register the private account (Unlink `ensureRegistered`). */
  ensureRegistered(): Promise<void>
  /** Current private balances, one entry per token held. */
  getBalances(): Promise<PrivacyBalance[]>
  /**
   * Request testnet tokens into the private account. Rate-/fund-limited on the
   * real provider — never loop this (see CLAUDE.md golden rule 5).
   */
  requestFaucet(token: Token): Promise<void>
  /** Privately transfer `amount` (base units) to another Unlink account. */
  transfer(params: PrivacyTransfer): Promise<void>
  /** Withdraw `amount` (base units) from the private account to a public EVM address. */
  withdraw(params: PrivacyWithdraw): Promise<void>
}
