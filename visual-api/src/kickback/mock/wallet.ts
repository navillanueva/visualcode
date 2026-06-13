import type { WalletProvider, WalletSession } from "../wallet"

export interface MockWalletOptions {
  /** Deterministic user id (defaults to a fixed test value). */
  userId?: string
  /** Deterministic EOA address (defaults to a fixed test value). */
  address?: string
  /** Optional fake JWT to surface on the session. */
  jwt?: string
}

/**
 * In-memory WalletProvider. `signIn` is deterministic so tests and offline demos
 * never touch Dynamic. No real signing happens here.
 */
export class MockWalletProvider implements WalletProvider {
  private session: WalletSession | null = null
  private readonly seed: WalletSession

  constructor(opts: MockWalletOptions = {}) {
    this.seed = {
      userId: opts.userId ?? "mock-user-0001",
      address: opts.address ?? "0x000000000000000000000000000000000000dEaD",
      ...(opts.jwt !== undefined ? { jwt: opts.jwt } : {}),
    }
  }

  async signIn(): Promise<WalletSession> {
    this.session = { ...this.seed }
    return { ...this.session }
  }

  getSession(): WalletSession | null {
    return this.session ? { ...this.session } : null
  }

  async signOut(): Promise<void> {
    this.session = null
  }
}

export function createMockWalletProvider(opts?: MockWalletOptions): MockWalletProvider {
  return new MockWalletProvider(opts)
}
