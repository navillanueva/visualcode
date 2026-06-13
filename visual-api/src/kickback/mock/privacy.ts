import type { BaseUnits, Token } from "../money"
import type { PrivacyBalance, PrivacyProvider, PrivacyTransfer, PrivacyWithdraw } from "../privacy"

export interface MockPrivacyOptions {
  /** Base units credited per `requestFaucet` call (default 1 USDC = 1_000_000). */
  faucetAmount?: BaseUnits
}

/**
 * In-memory PrivacyProvider. Balances live in a Map keyed by token address;
 * `transfer`/`withdraw` debit the local account (recipients are off-instance and
 * not modelled). Throws on unregistered use or insufficient balance — we never
 * silently succeed. Both transfers and withdrawals are logged for inspection.
 */
export class MockPrivacyProvider implements PrivacyProvider {
  private registered = false
  private readonly balances = new Map<string, { token: Token; amount: BaseUnits }>()
  private readonly faucetAmount: BaseUnits
  readonly transfers: PrivacyTransfer[] = []
  readonly withdrawals: PrivacyWithdraw[] = []

  constructor(opts: MockPrivacyOptions = {}) {
    this.faucetAmount = opts.faucetAmount ?? 1_000_000n
  }

  async ensureRegistered(): Promise<void> {
    this.registered = true
  }

  async getBalances(): Promise<PrivacyBalance[]> {
    return [...this.balances.values()].map((b) => ({ token: b.token, amount: b.amount }))
  }

  async requestFaucet(token: Token): Promise<void> {
    this.assertRegistered("requestFaucet")
    this.credit(token, this.faucetAmount)
  }

  async transfer(params: PrivacyTransfer): Promise<void> {
    this.assertRegistered("transfer")
    this.debit(params.token, params.amount)
    this.transfers.push({ ...params })
  }

  async withdraw(params: PrivacyWithdraw): Promise<void> {
    this.assertRegistered("withdraw")
    this.debit(params.token, params.amount)
    this.withdrawals.push({ ...params })
  }

  private assertRegistered(op: string): void {
    if (!this.registered) {
      throw new Error(`MockPrivacyProvider: call ensureRegistered() before ${op}()`)
    }
  }

  private credit(token: Token, amount: BaseUnits): void {
    if (amount <= 0n) throw new Error(`credit amount must be positive: ${amount}`)
    const existing = this.balances.get(token.address)
    this.balances.set(token.address, { token, amount: (existing?.amount ?? 0n) + amount })
  }

  private debit(token: Token, amount: BaseUnits): void {
    if (amount <= 0n) throw new Error(`debit amount must be positive: ${amount}`)
    const existing = this.balances.get(token.address)
    const current = existing?.amount ?? 0n
    if (current < amount) {
      throw new Error(`insufficient private balance for ${token.symbol}: have ${current}, need ${amount}`)
    }
    this.balances.set(token.address, { token, amount: current - amount })
  }
}

export function createMockPrivacyProvider(opts?: MockPrivacyOptions): MockPrivacyProvider {
  return new MockPrivacyProvider(opts)
}
