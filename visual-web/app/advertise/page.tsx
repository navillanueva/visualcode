"use client"

import { useCallback, useEffect, useState } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { isEthereumWallet } from "@dynamic-labs/ethereum"
import { createPublicClient, erc20Abi, http } from "viem"
import {
  createCampaign,
  fundCampaign,
  getTreasury,
  listCampaigns,
  type Campaign,
  type Treasury,
} from "@/lib/api"
import { ARC_RPC_URL, arcTestnet } from "@/lib/arc"
import { fromBaseUnits, toBaseUnits } from "@/lib/money"
import { useMe } from "@/lib/useMe"
import { Spinner } from "@/components/Spinner"
import { ArrowRight, Shield } from "@/components/Icons"

// The stat row and bid queue are SAMPLE data (advertiser names are PLACEHOLDERS).
// TODO(human): real launch partners + real delivery metrics.
const BID_QUEUE = [
  { bid: "$7.00", copy: "Linear — plan, build, ship faster", tag: "live", imps: "41,208", live: true },
  { bid: "$5.00", copy: "Warp: the terminal, reimagined", tag: "live", imps: "92,415", live: true },
  { bid: "$5.00", copy: "Neon — serverless Postgres in 1 command", tag: "live", imps: "33,902", live: true },
  { bid: "$4.20", copy: "Resend — email for developers", tag: "live", imps: "21,540", live: true },
  { bid: "$3.50", copy: "Sentry — code breaks. catch it first.", tag: "live", imps: "18,277", live: true },
  { bid: "$2.10", copy: "Fly.io — deploy app servers close to users", tag: "queued", imps: "—", live: false },
  { bid: "$1.00", copy: "Turso — SQLite for the edge", tag: "queued", imps: "—", live: false },
]

const DEFAULTS = {
  advertiser: "Acme Dev Tools",
  text: "ship faster with Acme — free for OSS",
  url: "https://acme.dev/blurb",
  bid: "5.00",
  budget: "500",
}

export default function AdvertisePage() {
  const { me, isLoggedIn } = useMe()
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const authed = isLoggedIn || me !== null

  const [form, setForm] = useState(DEFAULTS)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [fundingId, setFundingId] = useState<string | null>(null)

  // Treasury is authoritative for token + decimals — never hardcode them. Until
  // loaded, fall back to 6dp; the real backend returns 18 for the arc-testnet pool token.
  const [treasury, setTreasury] = useState<Treasury | null>(null)
  const decimals = treasury?.decimals ?? 6

  const loadCampaigns = useCallback(async () => {
    try {
      setListError(null)
      setCampaigns(await listCampaigns())
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    getTreasury()
      .then(setTreasury)
      .catch(() => setTreasury(null))
  }, [])

  useEffect(() => {
    if (authed) void loadCampaigns()
  }, [authed, loadCampaigns])

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setNotice(null)

    if (!authed) {
      setShowAuthFlow(true)
      setNotice("Sign in to place your campaign in the auction.")
      return
    }

    let bidBaseUnits: string
    let budgetBaseUnits: string
    try {
      // money.ts throws on malformed / over-precise amounts — fail before we POST.
      bidBaseUnits = toBaseUnits(form.bid, decimals).toString()
      budgetBaseUnits = toBaseUnits(form.budget, decimals).toString()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
      return
    }
    if (toBaseUnits(form.budget, decimals) <= 0n) {
      setFormError("Budget must be greater than 0.")
      return
    }

    setSubmitting(true)
    try {
      const { campaign } = await createCampaign({
        advertiser: form.advertiser.trim(),
        text: form.text.trim(),
        url: form.url.trim(),
        bidBaseUnits,
        budgetBaseUnits,
      })
      setNotice(`Campaign created (${campaign.id}). Fund it below to enter the auction.`)
      await loadCampaigns()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFund(c: Campaign) {
    setFundingId(c.id)
    setNotice(null)
    setListError(null)
    try {
      if (!treasury) throw new Error("Payment configuration unavailable — is the backend reachable?")
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
        throw new Error("Connect an EVM (Dynamic) wallet to pay the campaign budget on-chain.")
      }
      const amount = BigInt(c.budgetBaseUnits ?? "0")
      if (amount <= 0n) throw new Error("This campaign has no budget to fund.")

      const token = treasury.token as `0x${string}`
      const to = treasury.address as `0x${string}`
      const walletClient = await primaryWallet.getWalletClient(String(treasury.chainId))
      const sender = walletClient.account.address
      const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC_URL) })

      // Pre-checks: enough token balance + some native gas (Arc gas = native USDC).
      const [bal, gas] = await Promise.all([
        publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [sender] }),
        publicClient.getBalance({ address: sender }),
      ])
      if (bal < amount) {
        throw new Error(
          `Insufficient balance: need ${fromBaseUnits(amount, decimals)} but the wallet holds ${fromBaseUnits(bal, decimals)}.`,
        )
      }
      if (gas === 0n) throw new Error("Wallet has no native gas on Arc. Top up from faucet.circle.com.")

      // 1) Public transfer of the budget to the treasury EOA (advertiser signs).
      setNotice("Confirm the USDC transfer to the treasury in your wallet…")
      const hash = await walletClient.writeContract({
        address: token,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, amount],
      })
      setNotice("Payment sent — waiting for on-chain confirmation…")
      await publicClient.waitForTransactionReceipt({ hash })

      // 2) Backend verifies that transfer, then privately deposits the budget into the pool.
      setNotice("Confirmed — shielding the budget into the private pool…")
      await fundCampaign(c.id, hash)

      setNotice(
        "Funded. Your transfer to the treasury is public on-chain; the deposit into the private pool — " +
          "and which developers your budget ends up paying — stays hidden via Unlink.",
      )
      await loadCampaigns()
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err))
    } finally {
      setFundingId(null)
    }
  }

  // Campaigns/Serving reflect real data when authed; the rest is sample (flagged).
  const serving = campaigns.filter((c) => c.status === "active" || c.status === "serving").length
  const stats = [
    { k: "campaigns", v: authed ? String(campaigns.length) : "3", s: "total" },
    { k: "serving", v: authed ? String(serving) : "2", s: "currently active" },
    { k: "views", v: "184,302", s: "delivered" },
    { k: "spend", v: "$642.10", s: "lifetime" },
    { k: "rank", v: "#1", s: "in auction" },
  ]

  return (
    <main className="shell" style={{ padding: "40px 28px 100px" }}>
      {/* header card */}
      <div className="card card--18" style={{ padding: 38, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 28, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 560 }}>
          <div className="eyebrow eyebrow--indigo" style={{ marginBottom: 14 }}>
            campaign portal
          </div>
          <h1 className="display" style={{ fontSize: 38, letterSpacing: "-0.025em", margin: "0 0 12px" }}>
            Your campaigns, delivery, and spend.
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--g-700)", margin: 0 }}>
            Place a campaign in the same ascending auction as everyone else, watch live delivery, and edit or pause
            anytime. Billed to your signed-in account.
          </p>
        </div>
        <button className="btn btn--outline btn--support">Contact support</button>
      </div>

      {/* stat row */}
      <div className="grid-collapse" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14, marginBottom: 20 }}>
        {stats.map((st) => (
          <div key={st.k} className="stat-card stat-card--indigo">
            <div className="stat-card__label">{st.k}</div>
            <div className="stat-card__value">{st.v}</div>
            <div className="stat-card__sub">{st.s}</div>
          </div>
        ))}
      </div>

      {/* form + preview/queue */}
      <div className="grid-collapse" style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 20, alignItems: "start" }}>
        {/* form */}
        <div className="card card--18">
          <h2 className="display" style={{ fontSize: 20, letterSpacing: "-0.01em", margin: "0 0 4px" }}>
            Place a new campaign
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--g-650)", margin: "0 0 22px", lineHeight: 1.5 }}>
            Bid any amount from $1 / 1k impressions. Below-top bids queue behind the leaders.
          </p>

          <form onSubmit={handleCreate}>
            <div className="field">
              <label className="field__label" htmlFor="adv-name">
                Advertiser name
              </label>
              <input id="adv-name" className="input" value={form.advertiser} onChange={(e) => set("advertiser", e.target.value)} />
            </div>
            <div className="field">
              <label className="field__label field__label--row" htmlFor="adv-copy">
                <span>Blurb copy</span>
                <span className="field__hint">one line · keep it tasteful</span>
              </label>
              <input id="adv-copy" className="input" value={form.text} onChange={(e) => set("text", e.target.value)} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="adv-url">
                Click-through URL
              </label>
              <input id="adv-url" className="input input--mono" value={form.url} onChange={(e) => set("url", e.target.value)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
              <div>
                <label className="field__label" htmlFor="adv-bid">
                  Bid / 1k impressions
                </label>
                <div className="input-money">
                  <span className="input-money__prefix">$</span>
                  <input id="adv-bid" inputMode="decimal" className="input-money__input" value={form.bid} onChange={(e) => set("bid", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="field__label" htmlFor="adv-budget">
                  Daily budget
                </label>
                <div className="input-money">
                  <span className="input-money__prefix">$</span>
                  <input id="adv-budget" inputMode="decimal" className="input-money__input" value={form.budget} onChange={(e) => set("budget", e.target.value)} />
                </div>
              </div>
            </div>

            {formError ? <div className="banner banner--error" style={{ marginBottom: 14 }}>{formError}</div> : null}

            <button type="submit" className="btn btn--ink btn--block btn--48" disabled={submitting}>
              {submitting ? "Placing…" : "Place campaign in auction"}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 12, color: "var(--g-650)", lineHeight: 1.5 }}>
              <span style={{ color: "var(--gold-dark)", display: "inline-flex", flexShrink: 0 }}>
                <Shield />
              </span>
              Every impression is fraud-reviewed before it bills.
            </div>
          </form>
        </div>

        {/* preview + bid queue */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* live preview */}
          <div style={{ background: "var(--term-body)", border: "1px solid var(--term-border)", borderRadius: 18, padding: 26 }}>
            <div className="eyebrow eyebrow--faint" style={{ color: "var(--term-dim-3)", marginBottom: 18 }}>
              Live preview · in a developer's terminal
            </div>
            <div className="mono" style={{ fontSize: 13.5, lineHeight: 1.85, color: "var(--term-text)" }}>
              <div className="term-dim">
                {"  "}
                <span className="term-check">✓</span> generating types…
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="status-line status-line--flush">
                  <Spinner className="status-line__spin" />
                  <span className="status-line__word">compiling…</span>
                  <span className="status-line__blurb">
                    <span className="adv-tile">A</span>
                    <span className="status-line__name">{form.advertiser || "Advertiser"}</span>
                    <span className="status-line__copy">— {form.text || "your blurb copy"}</span>
                    <span className="ad-tag">ad</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* bid queue */}
          <div className="list-card">
            <div className="list-card__head">
              <span className="eyebrow eyebrow--indigo" style={{ fontWeight: 600 }}>
                bid queue
              </span>
              <span style={{ fontSize: 12, color: "var(--g-600)" }}>7 live · updated just now</span>
            </div>
            {BID_QUEUE.map((row, i) => (
              <div key={row.copy} className={`bid-row${i === 0 ? " bid-row--top" : ""}`}>
                <span className="bid-row__bid">{row.bid}</span>
                <span className="bid-row__copy">{row.copy}</span>
                <span className={`bid-row__tag${row.live ? " bid-row__tag--live" : ""}`}>
                  {row.tag} · {row.imps}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* real campaigns + funding (preserves the on-chain fund flow) */}
      {authed ? (
        <section style={{ marginTop: 20 }}>
          {notice ? <div className="banner banner--ok" style={{ marginBottom: 14 }}>{notice}</div> : null}
          {listError ? <div className="banner banner--error" style={{ marginBottom: 14 }}>{listError}</div> : null}
          {campaigns.length > 0 ? (
            <div className="list-card">
              <div className="list-card__head">
                <div>
                  <h2 className="display" style={{ fontSize: 19, margin: "0 0 2px" }}>
                    Your campaigns
                  </h2>
                  <span style={{ fontSize: 13, color: "var(--g-650)" }}>Created campaigns — fund one to enter the auction.</span>
                </div>
                <span className="mono" style={{ fontSize: 12, color: "var(--earn-text)" }}>
                  {campaigns.length} total
                </span>
              </div>
              {campaigns.map((c) => (
                <CampaignRow key={c.id} campaign={c} decimals={decimals} funding={fundingId === c.id} onFund={() => handleFund(c)} />
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 14, color: "var(--g-650)" }}>No campaigns yet — place one above to get started.</p>
          )}
        </section>
      ) : notice ? (
        <div className="banner banner--ok" style={{ marginTop: 20 }}>{notice}</div>
      ) : null}
    </main>
  )
}

function CampaignRow({
  campaign,
  decimals,
  funding,
  onFund,
}: {
  campaign: Campaign
  decimals: number
  funding: boolean
  onFund: () => void
}) {
  const remaining = campaign.budgetRemainingBaseUnits
  const spent = campaign.spendBaseUnits
  const fundable = !campaign.status || campaign.status === "pending" || campaign.status === "draft"

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center", padding: "16px 20px", borderTop: "1px solid var(--g-300)" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <b style={{ fontSize: 14, fontWeight: 600 }}>{campaign.advertiser || "Untitled"}</b>
          {campaign.status ? (
            <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--g-650)", border: "1px solid var(--g-300)", borderRadius: 999, padding: "2px 8px" }}>
              {campaign.status}
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 13, color: "var(--g-700)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
          {campaign.text}
        </div>
        <div className="mono" style={{ fontSize: 12, color: "var(--g-600)", marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span>bid {fromBaseUnits(BigInt(campaign.bidBaseUnits), decimals)}/1k</span>
          {remaining !== undefined ? <span>remaining {fromBaseUnits(BigInt(remaining), decimals)}</span> : null}
          {spent !== undefined ? <span>spent {fromBaseUnits(BigInt(spent), decimals)}</span> : null}
        </div>
      </div>
      {/* Disabled once funded — re-paying an active campaign would transfer again. */}
      <button className="btn btn--outline btn--copy" onClick={onFund} disabled={funding || !fundable}>
        {funding ? "Funding…" : fundable ? "Fund" : "Funded"}
      </button>
    </div>
  )
}
