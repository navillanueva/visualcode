// Public surface of @kickback-ai/providers: the three provider interfaces, the
// shared money primitives, env config, and the real-or-mock factory. Mock
// implementations live under "./mock"; real (vendor-SDK) impls under "./real".

export * from "./money"
export type { WalletProvider, WalletSession } from "./wallet"
export type { PrivacyProvider, PrivacyBalance, PrivacyTransfer, PrivacyWithdraw } from "./privacy"
export type { SettlementProvider, SettlementReceipt } from "./settlement"

export { readKickbackEnv } from "./config"
export type {
  KickbackConfig,
  ArcConfig,
  PayerConfig,
  DynamicConfig,
  UnlinkConfig,
  Hex,
} from "./config"

export { createProviders } from "./factory"
export type { ProviderSet, ProvidersResult } from "./factory"

export { createKickbackClient, parseServedAd, parseEarnings } from "./client"
export type {
  KickbackClient,
  KickbackClientOptions,
  ServedAd,
  ServeAdResult,
  ReportImpressionsResult,
  Earnings,
  EarningsResult,
} from "./client"
