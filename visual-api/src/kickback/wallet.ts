// WalletProvider — the developer's identity + signing wallet (Dynamic in prod).
//
// In the MVP money loop, sign-in yields a JWT whose `sub` is reused as the
// Unlink userId, plus a plain EOA address that funds Circle Gateway payments.
// Embedded-wallet onboarding and delegated signing are deferred (see CLAUDE.md).

/** An authenticated wallet session. */
export interface WalletSession {
  /**
   * Stable user id. In production this is the Dynamic JWT `sub`; it is reused
   * verbatim as the Unlink `userId` so the same identity owns both surfaces.
   */
  userId: string
  /** Plain EOA address this session controls (the payer for Gateway x402). */
  address: string
  /** Raw Dynamic JWT, when available — the backend verifies it before minting Unlink auth. */
  jwt?: string
}

export interface WalletProvider {
  /** Authenticate the user and return the active session. */
  signIn(): Promise<WalletSession>
  /** The current session, or `null` if no one is signed in. */
  getSession(): WalletSession | null
  /** Clear the active session. */
  signOut(): Promise<void>
}
