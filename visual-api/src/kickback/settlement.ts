// SettlementProvider — the x402 nanopayment rail (Circle Gateway on Arc in prod).
//
// The payer (a plain EOA) deposits USDC into the Gateway, then pays per-request
// against an x402 resource URL; price discovery happens via the resource's 402
// challenge, so `pay` takes only the URL. Deposits are *decimal* USDC strings;
// the receipt amount is reported back in base units (see money.ts).

import type { BaseUnits } from "./money"

/** Proof that an x402 resource was paid. */
export interface SettlementReceipt {
  /** The x402 resource that was paid for. */
  resourceUrl: string
  /** Amount actually paid, in base units. */
  amount: BaseUnits
  /** Settlement / tx reference, when the rail exposes one. */
  reference?: string
}

export interface SettlementProvider {
  /**
   * Deposit USDC into the Gateway. Amount is a *decimal* USDC string ("1.99"),
   * matching the Gateway API — not base units.
   */
  deposit(decimalAmount: string): Promise<void>
  /** Deposited balance available to spend, in base units. */
  getDepositedBalance(): Promise<BaseUnits>
  /** Pay an x402 resource and return a receipt. Price comes from the 402 challenge. */
  pay(resourceUrl: string): Promise<SettlementReceipt>
}
