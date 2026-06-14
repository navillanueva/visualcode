"use client"

import { useEffect, useState } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { isEthereumWallet } from "@dynamic-labs/ethereum"
import { createPublicClient, erc20Abi, http } from "viem"
import { ApiError, createCampaign, fundCampaign, getTreasury, type Campaign, type Treasury } from "@/lib/api"
import { ARC_RPC_URL, arcTestnet } from "@/lib/arc"
import { fromBaseUnits, toBaseUnits } from "@/lib/money"
import { useMe } from "@/lib/useMe"
import { Spinner } from "@/components/Spinner"
import { VerifyHuman } from "@/components/VerifyHuman"
import { Check, Lock } from "@/components/Icons"

// Pricing is FIXED platform-wide: $10 per 1,000 views. The advertiser never bids
// — the backend sets the bid server-side and ignores any client value (see
// visual-api POST /api/campaigns). We only echo the price as a static label and
// still send a matching bid so the typed createCampaign() contract is satisfied.
const FIXED_PRICE_USDC = "10"
const FIXED_PRICE_LABEL = "$10 per 1,000 views"

const EMPTY = { advertiser: "", text: "", url: "", budget: "" }

export default function AdvertisePage() {
  const { me, isLoggedIn, refresh } = useMe()
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const authed = isLoggedIn || me !== null
  // KYB personhood gate (Plan 5): an advertiser must be a verified human before
  // a campaign can run. Drives both the up-front gate and the 403 recovery path.
  const verified = me?.worldIdVerified ?? false

  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Set if POST /api/campaigns came back 403 personhood_required (e.g. `me` was
  // stale). Forces the verify gate even when the cached flag said otherwise.
  const [needsVerify, setNeedsVerify] = useState(false)

  // The single ad created this session. Once created it can't be re-created (that
  // would duplicate it on a payment retry), so we lock the form and only re-pay.
  const [created, setCreated] = useState<Campaign | null>(null)
  // Set once the on-chain payment is verified + shielded into the private pool.
  const [live, setLive] = useState<Campaign | null>(null)

  // Treasury is authoritative for token + decimals — never hardcode them. Until
  // loaded, fall back to 6dp; the real backend returns 18 for the arc-testnet pool token.
  const [treasury, setTreasury] = useState<Treasury | null>(null)
  const decimals = treasury?.decimals ?? 6

  useEffect(() => {
    getTreasury()
      .then(setTreasury)
      .catch(() => setTreasury(null))
  }, [])

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // Real on-chain pay → fund: public USDC transfer to the treasury (advertiser
  // signs), wait for the receipt, then the backend verifies it and privately
  // deposits the budget into the Unlink pool. Unchanged from the original flow.
  async function payAndFund(campaign: Campaign) {
    if (!treasury) throw new Error("Payment configuration unavailable — is the backend reachable?")
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      throw new Error("Connect an EVM (Dynamic) wallet to pay your ad budget on-chain.")
    }
    const amount = BigInt(campaign.budgetBaseUnits ?? "0")
    if (amount <= 0n) throw new Error("This ad has no budget to fund.")

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
    setStatus("Confirm the USDC transfer to the treasury in your wallet…")
    const hash = await walletClient.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, amount],
    })
    setStatus("Payment sent — waiting for on-chain confirmation…")
    await publicClient.waitForTransactionReceipt({ hash })

    // 2) Backend verifies that transfer, then privately deposits the budget into the pool.
    setStatus("Confirmed — shielding your budget into the private pool…")
    const { campaign: funded } = await fundCampaign(campaign.id, hash)
    return funded
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus(null)

    if (!authed) {
      setShowAuthFlow(true)
      setStatus("Sign in to create and fund your ad.")
      return
    }

    const advertiser = form.advertiser.trim()
    const text = form.text.trim()
    const url = form.url.trim()
    if (!advertiser || !text || !url) {
      setError("Brand name, ad text, and click-through URL are all required.")
      return
    }

    let budgetBaseUnits: string
    try {
      // money.ts throws on malformed / over-precise amounts — fail before we POST.
      budgetBaseUnits = toBaseUnits(form.budget, decimals).toString()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }
    if (BigInt(budgetBaseUnits) <= 0n) {
      setError("Budget must be greater than 0.")
      return
    }

    setBusy(true)
    try {
      // Create once; on a payment retry we re-fund the same ad instead of duplicating it.
      let campaign = created
      if (!campaign) {
        const res = await createCampaign({
          advertiser,
          text,
          url,
          // Ignored server-side (price is fixed); sent only to satisfy the typed contract.
          bidBaseUnits: toBaseUnits(FIXED_PRICE_USDC, decimals).toString(),
          budgetBaseUnits,
        })
        campaign = res.campaign
        setCreated(campaign)
      }
      const funded = await payAndFund(campaign)
      setStatus(null)
      setLive(funded)
    } catch (err) {
      // The backend gates campaign creation on personhood: a 403 means this
      // advertiser hasn't linked a World ID. Surface the verify widget instead
      // of a raw error so they can fix it inline.
      if (err instanceof ApiError && err.status === 403 && err.body.includes("personhood_required")) {
        setNeedsVerify(true)
        setError("Verify you're human to run ads.")
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setForm(EMPTY)
    setCreated(null)
    setLive(null)
    setStatus(null)
    setError(null)
  }

  // Once created, lock the fields: the ad is fixed server-side and any retry only re-pays.
  const locked = busy || created !== null
  const budgetDisplay = live ? fromBaseUnits(BigInt(live.budgetBaseUnits ?? "0"), decimals) : null

  return (
    <main className="shell" style={{ padding: "40px 28px 100px" }}>
      {/* header */}
      <div className="card card--18" style={{ padding: 38, marginBottom: 20 }}>
        <div className="eyebrow eyebrow--indigo" style={{ marginBottom: 14 }}>
          advertise
        </div>
        <h1 className="display" style={{ fontSize: 38, letterSpacing: "-0.025em", margin: "0 0 12px" }}>
          Put your ad in developers&apos; terminals.
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--g-700)", margin: 0, maxWidth: 620 }}>
          Create one ad, fund it on-chain, and it serves in developers&apos; terminals — they earn half, settled
          privately via Unlink.
        </p>
      </div>

      {/* form + live preview */}
      <div className="grid-collapse" style={{ display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 20, alignItems: "start" }}>
        {/* left column: verify gate OR create form OR live confirmation */}
        {live ? (
          <div className="card card--18">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ color: "var(--earn-text)", display: "inline-flex" }}>
                <Check />
              </span>
              <h2 className="display" style={{ fontSize: 20, letterSpacing: "-0.01em", margin: 0 }}>
                Your ad is live
              </h2>
            </div>
            <p style={{ fontSize: 13.5, color: "var(--g-650)", margin: "0 0 22px", lineHeight: 1.5 }}>
              It&apos;ll serve in developers&apos; terminals. You&apos;ll be billed {FIXED_PRICE_LABEL} as it&apos;s shown.
            </p>

            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 18px", fontSize: 14 }}>
              <dt style={{ color: "var(--g-600)" }}>Brand</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>{live.advertiser}</dd>
              <dt style={{ color: "var(--g-600)" }}>Ad text</dt>
              <dd style={{ margin: 0 }}>{live.text}</dd>
              <dt style={{ color: "var(--g-600)" }}>Link</dt>
              <dd className="mono" style={{ margin: 0, fontSize: 12.5, wordBreak: "break-all" }}>{live.url}</dd>
              <dt style={{ color: "var(--g-600)" }}>Budget</dt>
              <dd className="mono" style={{ margin: 0 }}>{budgetDisplay} USDC</dd>
            </dl>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22, fontSize: 12, color: "var(--g-650)", lineHeight: 1.5 }}>
              <span style={{ color: "var(--gold-dark)", display: "inline-flex", flexShrink: 0 }}>
                <Lock />
              </span>
              Your transfer to the treasury is public; the deposit into the pool — and which developers your
              budget pays — stays hidden via Unlink.
            </div>

            <button type="button" className="linkbtn" style={{ marginTop: 22 }} onClick={reset}>
              Create another ad →
            </button>
          </div>
        ) : authed && (!verified || needsVerify) ? (
          <VerifyHuman
            copy="Verify you're human to run ads."
            onVerified={() => {
              setNeedsVerify(false)
              setError(null)
              void refresh()
            }}
          />
        ) : (
          <div className="card card--18">
            <h2 className="display" style={{ fontSize: 20, letterSpacing: "-0.01em", margin: "0 0 4px" }}>
              Create your ad
            </h2>
            <p style={{ fontSize: 13.5, color: "var(--g-650)", margin: "0 0 18px", lineHeight: 1.5 }}>
              One ad, one budget. No bidding — pricing is fixed for everyone.
            </p>

            <div className="pill pill--arc pill--sm" style={{ marginBottom: 22 }}>
              {FIXED_PRICE_LABEL} · fixed
            </div>

            <form onSubmit={handleSubmit}>
              <div className="field">
                <label className="field__label" htmlFor="adv-name">
                  Brand name
                </label>
                <input
                  id="adv-name"
                  className="input"
                  placeholder="Acme Dev Tools"
                  value={form.advertiser}
                  onChange={(e) => set("advertiser", e.target.value)}
                  disabled={locked}
                />
              </div>
              <div className="field">
                <label className="field__label field__label--row" htmlFor="adv-copy">
                  <span>Ad text</span>
                  <span className="field__hint">one line · keep it tasteful</span>
                </label>
                <input
                  id="adv-copy"
                  className="input"
                  placeholder="ship faster with Acme — free for OSS"
                  value={form.text}
                  onChange={(e) => set("text", e.target.value)}
                  disabled={locked}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="adv-url">
                  Click-through URL
                </label>
                <input
                  id="adv-url"
                  className="input input--mono"
                  placeholder="https://acme.dev/blurb"
                  value={form.url}
                  onChange={(e) => set("url", e.target.value)}
                  disabled={locked}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="adv-budget">
                  Budget (USDC)
                </label>
                <div className="input-money">
                  <span className="input-money__prefix">$</span>
                  <input
                    id="adv-budget"
                    inputMode="decimal"
                    className="input-money__input"
                    placeholder="100"
                    value={form.budget}
                    onChange={(e) => set("budget", e.target.value)}
                    disabled={locked}
                  />
                </div>
                <div className="field__hint" style={{ marginTop: 6 }}>
                  Charged {FIXED_PRICE_LABEL} as it&apos;s shown, until the budget runs out.
                </div>
              </div>

              {error ? <div className="banner banner--error" style={{ margin: "14px 0" }}>{error}</div> : null}
              {status ? <div className="banner banner--ok" style={{ margin: "14px 0" }}>{status}</div> : null}

              <button type="submit" className="btn btn--ink btn--block btn--48" disabled={busy} style={{ marginTop: 10 }}>
                {busy ? (
                  <>
                    <Spinner /> Working…
                  </>
                ) : created ? (
                  "Retry payment"
                ) : (
                  "Create & fund ad"
                )}
              </button>

              {created ? (
                <button type="button" className="linkbtn" style={{ marginTop: 12 }} onClick={reset} disabled={busy}>
                  Discard and start over
                </button>
              ) : null}
            </form>
          </div>
        )}

        {/* right column: live preview of how the ad renders in a terminal */}
        <div style={{ background: "var(--term-body)", border: "1px solid var(--term-border)", borderRadius: 18, padding: 26 }}>
          <div className="eyebrow eyebrow--faint" style={{ color: "var(--term-dim-3)", marginBottom: 18 }}>
            Live preview · in a developer&apos;s terminal
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
                  <span className="adv-tile">{(form.advertiser || "A").charAt(0).toUpperCase()}</span>
                  <span className="status-line__name">{form.advertiser || "Your brand"}</span>
                  <span className="status-line__copy">— {form.text || "your ad text"}</span>
                  <span className="ad-tag">ad</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
