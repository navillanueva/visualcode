import type { Token } from "../money"
import { USDC_DECIMALS } from "../money"

/**
 * A stand-in USDC token for offline mocks and tests. The address is an obvious
 * placeholder — the real Arc-testnet USDC address is loaded from
 * `ARC_USDC_ADDRESS` in `.env` by the real providers (Task 4), never hardcoded.
 */
export const MOCK_USDC: Token = {
  symbol: "USDC",
  address: "0xMOCKUSDC",
  decimals: USDC_DECIMALS,
}
