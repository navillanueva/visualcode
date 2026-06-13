import type { BaseUnits } from "../money"
import { toBaseUnits } from "../money"
import type { SettlementProvider, SettlementReceipt } from "../settlement"

export interface MockSettlementOptions {
  /** Per-resource price in base units, keyed by resource URL. */
  prices?: Record<string, BaseUnits>
  /** Fallback price (base units) for resources not in `prices` (default 0.01 USDC = 10_000). */
  defaultPrice?: BaseUnits
}

/**
 * In-memory SettlementProvider simulating Circle Gateway batched x402 payments.
 * `deposit` takes a decimal USDC string (Gateway API shape) and converts to base
 * units; `pay` resolves the resource price, debits the deposit, and returns a
 * receipt with a deterministic reference. Throws on insufficient deposit.
 */
export class MockSettlementProvider implements SettlementProvider {
  private deposited: BaseUnits = 0n
  private payCount = 0
  private readonly prices: Record<string, BaseUnits>
  private readonly defaultPrice: BaseUnits
  readonly payments: SettlementReceipt[] = []

  constructor(opts: MockSettlementOptions = {}) {
    this.prices = opts.prices ?? {}
    this.defaultPrice = opts.defaultPrice ?? 10_000n
  }

  async deposit(decimalAmount: string): Promise<void> {
    const base = toBaseUnits(decimalAmount)
    if (base <= 0n) throw new Error(`deposit must be positive: ${decimalAmount}`)
    this.deposited += base
  }

  async getDepositedBalance(): Promise<BaseUnits> {
    return this.deposited
  }

  async pay(resourceUrl: string): Promise<SettlementReceipt> {
    const price = this.prices[resourceUrl] ?? this.defaultPrice
    if (this.deposited < price) {
      throw new Error(`insufficient Gateway deposit: have ${this.deposited}, need ${price} for ${resourceUrl}`)
    }
    this.deposited -= price
    const receipt: SettlementReceipt = {
      resourceUrl,
      amount: price,
      reference: `mock-x402-${++this.payCount}`,
    }
    this.payments.push(receipt)
    return { ...receipt }
  }
}

export function createMockSettlementProvider(opts?: MockSettlementOptions): MockSettlementProvider {
  return new MockSettlementProvider(opts)
}
