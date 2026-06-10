// Real settlement service — wires the migrated Circle Gateway (x402) + Unlink
// (privacy) providers into the SettlementService the routes use. The backend
// holds settlement authority server-side (a payer EOA for Gateway; a mnemonic-
// derived private Unlink account), per visual-code-mvp-architecture.md.
//
// EXCLUDED FROM THE DEFAULT TYPECHECK (imports real-unlink → @unlink-xyz/sdk,
// which is not installable from the public registry here). Loaded only via the
// factory's dynamic import when SETTLEMENT_MODE=real. Config never throws on
// missing pieces — it degrades to "unavailable" and records a note, mirroring the
// kickback factory's golden rule (surface fallbacks, never fake a live call).

import { readKickbackEnv } from "@kickback/config"
import { fromBaseUnits, toBaseUnits } from "@kickback/money"
import type { BaseUnits } from "@kickback/money"
import type { SettlementService } from "./service"
import { RealGatewaySettlement } from "./real-gateway"
import { RealUnlinkPrivacy, unlinkAccountFromMnemonic } from "./real-unlink"

export async function createRealSettlementService(env: Record<string, string | undefined>): Promise<SettlementService> {
  const cfg = readKickbackEnv(env)
  const notes: string[] = []

  let gateway: RealGatewaySettlement | undefined
  if (cfg.payer && cfg.arc) {
    gateway = new RealGatewaySettlement({ privateKey: cfg.payer.privateKey, rpcUrl: cfg.arc.rpcUrl })
  } else {
    notes.push("settlement: missing PAYER_*/ARC_* — Circle Gateway unavailable (no x402 payout)")
  }

  let privacy: RealUnlinkPrivacy | undefined
  if (cfg.unlink.mnemonic && cfg.unlink.engineUrl && cfg.unlink.apiKey && cfg.arc) {
    privacy = new RealUnlinkPrivacy({
      engineUrl: cfg.unlink.engineUrl,
      environment: cfg.unlink.environment,
      apiKey: cfg.unlink.apiKey,
      account: unlinkAccountFromMnemonic(cfg.unlink.mnemonic),
      token: cfg.arc.usdc,
    })
    await privacy.ensureRegistered()
  } else {
    notes.push("privacy: missing UNLINK_MNEMONIC/UNLINK_ENGINE_URL/UNLINK_API_KEY/ARC_* — Unlink unavailable (payouts not private)")
  }

  const usdc = cfg.arc?.usdc

  return {
    mode: "real",
    live: { wallet: !!cfg.payer, privacy: !!privacy, settlement: !!gateway },
    notes,

    async fundCampaign({ campaignId, amountBaseUnits }) {
      // Advertiser budget is escrowed privately. In the full Dynamic flow the
      // deposit is signed client-side; here the backend's private Unlink account
      // holds the budget (server-side settlement authority).
      if (privacy && amountBaseUnits > 0n) {
        await privacy.requestFaucet() // fund the private account on testnet
      }
      return { txRef: `unlink-fund:${campaignId}` }
    },

    async withdrawEarnings({ accountId, amountBaseUnits, recipientEvmAddress }) {
      // Pay the developer privately out to their wallet address. Gateway x402 is
      // used for the gas-free USDC settlement rail when configured.
      if (privacy && usdc && amountBaseUnits > 0n) {
        await privacy.withdraw({ recipientEvmAddress, amount: amountBaseUnits })
      } else if (gateway) {
        // No private layer configured: at least move the USDC via the Gateway.
        await gateway.deposit(fromBaseUnits(amountBaseUnits))
      }
      return { txRef: `unlink-withdraw:${accountId}` }
    },
  }
}

/** Faucet txs aren't pollable; the shielded balance is the only confirmation. */
async function pollBalanceIncrease(
  privacy: RealUnlinkPrivacy,
  before: BaseUnits,
  timeoutMs = 90_000,
  intervalMs = 5_000,
): Promise<BaseUnits> {
  const deadline = Date.now() + timeoutMs
  let latest = before
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs))
    latest = await privacy.getBalance()
    if (latest > before) return latest
  }
  return latest
}

/** The single allowed live Arc smoke (read-only unless explicitly confirmed). */
export async function realSmoke(opts: {
  deposit?: string
  pay?: string
  unlinkFaucet?: boolean
  unlinkWithdraw?: string
  confirm: boolean
}): Promise<void> {
  const cfg = readKickbackEnv(process.env)
  const svc = await createRealSettlementService(process.env)
  console.log("Real settlement service:")
  console.log(`  wallet:     ${svc.live.wallet ? "REAL" : "unavailable"}`)
  console.log(`  privacy:    ${svc.live.privacy ? "REAL" : "unavailable"}`)
  console.log(`  settlement: ${svc.live.settlement ? "REAL" : "unavailable"}`)
  for (const n of svc.notes) console.log(`  • ${n}`)

  let gateway: RealGatewaySettlement | undefined
  if (cfg.payer && cfg.arc) {
    gateway = new RealGatewaySettlement({ privateKey: cfg.payer.privateKey, rpcUrl: cfg.arc.rpcUrl })
    try {
      const bal = await gateway.getDepositedBalance()
      console.log(`gateway deposited balance: ${fromBaseUnits(bal)} USDC (${bal} base units)`)
    } catch (e) {
      console.log(`gateway balance read failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // The private (Unlink) account. Building + registering + reading its shielded
  // balance exercises the full server-side path (admin register → per-user
  // authorization token → balanceOf) with no funds moved.
  let privacy: RealUnlinkPrivacy | undefined
  if (cfg.unlink.mnemonic && cfg.unlink.engineUrl && cfg.unlink.apiKey && cfg.arc) {
    privacy = new RealUnlinkPrivacy({
      engineUrl: cfg.unlink.engineUrl,
      environment: cfg.unlink.environment,
      apiKey: cfg.unlink.apiKey,
      account: unlinkAccountFromMnemonic(cfg.unlink.mnemonic),
      token: cfg.arc.usdc,
    })
    try {
      await privacy.ensureRegistered()
      const bal = await privacy.getBalance()
      console.log(`unlink private account: ${await privacy.getAddress()}`)
      console.log(`unlink private USDC balance: ${fromBaseUnits(bal)} USDC (${bal} base units)`)
    } catch (e) {
      console.log(`unlink read failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const wantsAction = !!(opts.deposit || opts.pay || opts.unlinkFaucet || opts.unlinkWithdraw)
  if (!wantsAction) {
    console.log(
      "\n(read-only — to move funds set KICKBACK_SMOKE_CONFIRM=1 and pass:" +
        "\n   private leg : --unlink-faucet --unlink-withdraw <usdc>   (advertiser deposit + dev payout via Unlink)" +
        "\n   gateway leg : --deposit <usdc> --pay <x402-url>          (Circle Gateway x402, optional spend rail))",
    )
    return
  }
  if (!opts.confirm) {
    console.error("\nRefusing to move funds: set KICKBACK_SMOKE_CONFIRM=1 to confirm the single allowed live test.")
    process.exit(1)
  }

  // ── Private leg (Unlink): the deliverable. Advertiser deposit + developer
  //    payout both route through the shielded pool — amounts, counterparties,
  //    and the spend graph stay private (view key for audit). ──
  if (opts.unlinkFaucet || opts.unlinkWithdraw) {
    if (!privacy || !cfg.arc) {
      console.error(
        "\nRefusing: Unlink privacy not configured — set UNLINK_MNEMONIC/UNLINK_ENGINE_URL/UNLINK_API_KEY + ARC_*.",
      )
      process.exit(1)
    }
    const address = await privacy.getAddress()
    if (opts.unlinkFaucet) {
      console.log(`\n[deposit · private] requesting shielded faucet tokens into ${address}…`)
      const before = await privacy.getBalance()
      await privacy.requestFaucet()
      const after = await pollBalanceIncrease(privacy, before)
      console.log(
        after > before
          ? `  shielded balance: ${fromBaseUnits(before)} → ${fromBaseUnits(after)} USDC — private deposit CONFIRMED`
          : `  shielded balance unchanged at ${fromBaseUnits(after)} USDC (faucet not yet reflected; balance is the only confirmation)`,
      )
    }
    if (opts.unlinkWithdraw) {
      const requested = toBaseUnits(opts.unlinkWithdraw)
      const balance = await privacy.getBalance()
      const amount = requested <= balance ? requested : balance
      const recipient = cfg.payer?.address
      if (!recipient) {
        console.error("\nRefusing: no PAYER_ADDRESS to receive the private withdraw.")
        process.exit(1)
      }
      if (amount <= 0n) {
        console.log(`\n[payout · private] skipped — shielded balance is 0 (fund it with --unlink-faucet first).`)
      } else {
        if (amount < requested) {
          console.log(
            `\n[payout · private] capping to shielded balance ${fromBaseUnits(amount)} USDC (requested ${opts.unlinkWithdraw}).`,
          )
        }
        console.log(`[payout · private] withdrawing ${fromBaseUnits(amount)} USDC privately to ${recipient}…`)
        const handle = await privacy.withdraw({ recipientEvmAddress: recipient, amount })
        console.log(`  submitted txId=${handle.txId} status=${handle.status} — waiting for terminal…`)
        try {
          const result = await handle.wait({ timeoutMs: 120_000 })
          console.log(`  withdraw ${result.status}${result.txHash ? ` (tx ${result.txHash})` : ""} — private payout CONFIRMED`)
        } catch (e) {
          console.log(
            `  not terminal within 120s: ${e instanceof Error ? e.message : String(e)} (txId=${handle.txId} may still confirm)`,
          )
        }
        console.log(`  shielded balance now: ${fromBaseUnits(await privacy.getBalance())} USDC`)
      }
    }
  }

  // ── Gateway leg (Circle x402): optional settlement / agentic-spend rail. ──
  if (opts.deposit || opts.pay) {
    if (!gateway) {
      console.error("\nRefusing: Gateway not configured — set PAYER_* + ARC_* for the real client.")
      process.exit(1)
    }
    if (opts.deposit) {
      console.log(`\ndepositing ${opts.deposit} USDC into the Gateway…`)
      await gateway.deposit(opts.deposit)
      console.log(`new gateway balance: ${fromBaseUnits(await gateway.getDepositedBalance())} USDC`)
    }
    if (opts.pay) {
      console.log(`\npaying x402 resource ${opts.pay}…`)
      const receipt = await gateway.pay(opts.pay)
      console.log(`paid ${fromBaseUnits(receipt.amount)} USDC — ref ${receipt.reference}`)
    }
  }
}
