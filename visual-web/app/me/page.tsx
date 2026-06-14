"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { createDeviceToken, getTreasury, withdraw, type Treasury } from "@/lib/api"
import { fromBaseUnits } from "@/lib/money"
import { useMe } from "@/lib/useMe"
import { Logo } from "@/components/BlurbMark"
import { VerifyHuman } from "@/components/VerifyHuman"
import { ArrowRight, Check, Coin, Copy, Eye, Lock, Shield, WarningTriangle } from "@/components/Icons"

// Format a balance (token base-unit string) as a "$0.00" USD figure. Treasury is
// authoritative for decimals — never hardcode them. Unknown / not-yet-loaded
// balances read as "$0.00", never a fake placeholder.
function formatUsd(baseUnits: string | undefined, decimals: number): string {
  try {
    return `$${Number(fromBaseUnits(BigInt(baseUnits ?? "0"), decimals)).toFixed(2)}`
  } catch {
    return "$0.00"
  }
}

const METHODS = [
  { id: "email", label: "Email" },
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
] as const

const PRIVACY = [
  { icon: <Lock size={20} strokeWidth={1.5} />, title: "Balances stay hidden", body: "Your earnings and counterparties are private on Arc by default." },
  { icon: <Coin size={20} strokeWidth={1.6} />, title: "Gas-free USDC", body: "Micropayments settle instantly with no network fees eating your split." },
  { icon: <Copy size={20} strokeWidth={1.6} />, title: "One token per device", body: "Revoke it anytime. No code, repo, or telemetry leaves your machine." },
]

// The personal-account page: one place for the device token, the wallet, World
// ID, and earnings. There is no separate /wallet route — signing in lands here.
export default function PersonalAccountPage() {
  const { me, isLoggedIn, refresh } = useMe()
  const { user, primaryWallet, setShowAuthFlow } = useDynamicContext()
  const connected = isLoggedIn || me !== null

  // Treasury is authoritative for the token's decimals (6 for USDC, 18 for the
  // arc-testnet pool token). Fall back to 6dp until it loads.
  const [treasury, setTreasury] = useState<Treasury | null>(null)
  const decimals = treasury?.decimals ?? 6
  useEffect(() => {
    getTreasury()
      .then(setTreasury)
      .catch(() => setTreasury(null))
  }, [])

  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("email")
  const [email, setEmail] = useState("")

  const address = me?.address ?? primaryWallet?.address ?? null
  const account =
    (user?.email as string | undefined) ?? (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null)

  return (
    <main className="shell shell--980" style={{ padding: "56px 28px 100px" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <span className="pill pill--arc pill--sm" style={{ marginBottom: 18 }}>
          <Lock size={13} strokeWidth={1.6} />
          non-custodial · your keys
        </span>
        <h1 className="display" style={{ fontSize: 36, letterSpacing: "-0.025em", margin: "0 0 12px" }}>
          {connected ? "Your personal account." : "Connect a wallet, get a device token."}
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--g-700)", margin: "0 auto", maxWidth: 520 }}>
          {connected
            ? "Your wallet, device token, and earnings — all in one place."
            : "Sign in with email or social — we create a non-custodial wallet, then issue a device token for your terminal."}
        </p>
      </div>

      {connected ? (
        <>
          <WalletAndToken
            address={address}
            balanceBaseUnits={me?.balanceBaseUnits}
            decimals={decimals}
            worldIdVerified={me?.worldIdVerified ?? false}
            onVerified={refresh}
          />
          <EarningsSection
            balanceBaseUnits={me?.balanceBaseUnits}
            decimals={decimals}
            account={account}
            authed={connected}
            onWithdrawn={refresh}
          />
        </>
      ) : (
        <div className="grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
          {/* sign-in method */}
          <div className="card card--18" style={{ padding: 30 }}>
            <div className="field__label" style={{ marginBottom: 10 }}>
              Sign in method
            </div>
            <div className="segmented" style={{ marginBottom: 20 }}>
              {METHODS.map((m) => (
                <button key={m.id} className={`seg-btn${method === m.id ? " seg-btn--active" : ""}`} onClick={() => setMethod(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label className="field__label" htmlFor="account-email">
                Email address
              </label>
              <input id="account-email" className="input input--44" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn btn--ink btn--block btn--48" onClick={() => setShowAuthFlow(true)}>
              Create wallet & continue <ArrowRight size={17} />
            </button>
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--g-600)", marginTop: 14 }}>
              Keys are generated on your device. We never see them.
            </div>
          </div>

          {/* why it's private */}
          <div className="card card--dark card--18" style={{ padding: 30 }}>
            <div className="eyebrow eyebrow--green" style={{ marginBottom: 18 }}>
              why it's private
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {PRIVACY.map((p) => (
                <div key={p.title} style={{ display: "flex", gap: 13 }}>
                  <span style={{ color: "var(--earn)", flexShrink: 0, marginTop: 1, display: "inline-flex" }}>{p.icon}</span>
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: 500, marginBottom: 3 }}>{p.title}</div>
                    <div style={{ fontSize: 13, color: "var(--g-600)", lineHeight: 1.5 }}>{p.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

// Wallet identity card + device-token command + World ID gate. Lifted from the
// former /wallet page; the "Go to earnings" link is gone since earnings now live
// directly below on this same page.
function WalletAndToken({
  address,
  balanceBaseUnits,
  decimals,
  worldIdVerified,
  onVerified,
}: {
  address: string | null
  balanceBaseUnits?: string
  decimals: number
  worldIdVerified: boolean
  onVerified: () => void
}) {
  const [token, setToken] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [copied, setCopied] = useState(false)
  const requested = useRef(false)

  // Issue one real device token on entering the connected state. If issuance
  // fails we surface an explicit error + retry — never a fake token, which the
  // TUI's bearer auth would silently reject after the dev pastes it.
  const issueToken = useCallback(() => {
    setTokenError(false)
    setToken(null)
    createDeviceToken()
      .then((res) => setToken(res.token))
      .catch(() => setTokenError(true))
  }, [])

  useEffect(() => {
    if (requested.current) return
    requested.current = true
    issueToken()
  }, [issueToken])

  const masked = token ? token.slice(0, 7) + "•".repeat(21) : ""
  const shortAddr = address ? `${address.slice(0, 6)} ···· ${address.slice(-4)}` : "—"
  // The full, paste-ready command. The backend URL is baked into the BlurbCode build,
  // so a bare `login --token` is all the user needs.
  const loginCmd = token ? `blurbcode login --token ${token}` : ""

  async function copy() {
    if (!loginCmd) return
    try {
      await navigator.clipboard.writeText(loginCmd)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard needs a secure context; the field is selectable as a fallback */
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 40 }}>
      {/* wallet card — a full-width banner above the token card, sized roughly to
          the height of the login-command box rather than a tall credit card */}
      <div
        style={{
          background: "linear-gradient(105deg,#141414 0%,#252525 55%,#4d5a8d 170%)",
          color: "var(--g-100)",
          borderRadius: 16,
          padding: "18px 26px",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          position: "relative",
          overflow: "hidden",
          boxShadow: "var(--shadow-wallet)",
        }}
      >
        {/* left: brand + address */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Logo wordSize={15} cursorW={8} cursorH={15} blink={false} />
            <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(253,253,253,0.6)" }}>
              non-custodial
            </span>
          </div>
          <div className="mono" style={{ fontSize: 16, letterSpacing: "0.06em", color: "var(--g-400)" }}>
            {shortAddr}
          </div>
        </div>

        {/* right: balance + network */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "rgba(253,253,253,0.6)" }}>balance</div>
            <div className="mono" style={{ fontSize: 20, marginTop: 2 }}>
              {formatUsd(balanceBaseUnits, decimals)}
            </div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 22, padding: "0 9px", borderRadius: 8, background: "rgba(155,224,85,0.16)", color: "var(--earn)", fontSize: 11, fontWeight: 500 }}>
            ● Arc
          </span>
        </div>
      </div>

      {/* token card */}
      <div className="card card--18">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ color: "var(--earn-text)", display: "inline-flex" }}>
            <Check size={18} strokeWidth={2.4} />
          </span>
          <h2 className="display" style={{ fontSize: 19, margin: 0 }}>
            Wallet connected — here's your device token
          </h2>
        </div>
        <p style={{ fontSize: 13.5, color: "var(--g-650)", margin: "0 0 22px", lineHeight: 1.5 }}>
          Run this one command in your terminal — it links this machine to your account, and nothing else.
        </p>

        {tokenError ? (
          <div className="banner banner--error" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ display: "inline-flex", flexShrink: 0 }}>
              <WarningTriangle size={16} />
            </span>
            <span style={{ flex: 1 }}>Couldn't issue a device token — retry.</span>
            <button className="btn btn--ink btn--copy" onClick={issueToken}>
              Retry
            </button>
          </div>
        ) : !token ? (
          <div className="banner" style={{ marginBottom: 20 }}>Issuing a device token…</div>
        ) : (
          <div className="mono" style={{ background: "var(--term-body)", border: "1px solid var(--term-border)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--g-100)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--indigo)" }}>$</span> blurbcode login --token{" "}
              <span className="term-check">{reveal ? token : masked}</span>
            </span>
            <button className="linkbtn" onClick={() => setReveal((v) => !v)}>
              {reveal ? "Hide" : "Reveal"}
            </button>
            <button className="btn btn--ink btn--copy" onClick={copy}>
              <Copy size={14} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}

        {/* Personhood gate (Plan 5): you can only receive payouts from a
            World-ID-bound account. Verified → badge; otherwise → the widget. */}
        <div style={{ borderTop: "1px solid var(--g-300)", marginTop: 22, paddingTop: 22 }}>
          {worldIdVerified ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 500, color: "var(--earn-text)" }}>
              <span style={{ display: "inline-flex" }}>
                <Shield size={16} strokeWidth={1.6} />
              </span>
              <Check size={15} strokeWidth={2.4} /> Verified human
            </div>
          ) : (
            <VerifyHuman copy="Verify you're human to receive payouts." onVerified={onVerified} />
          )}
        </div>
      </div>
    </div>
  )
}

// Accrued earnings + withdraw, formerly the standalone /me page. Reads the same
// real balance from GET /api/me that the wallet card shows above.
function EarningsSection({
  balanceBaseUnits,
  decimals,
  account,
  authed,
  onWithdrawn,
}: {
  balanceBaseUnits?: string
  decimals: number
  account: string | null
  authed: boolean
  onWithdrawn: () => Promise<void>
}) {
  const [balHidden, setBalHidden] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // For a fresh demo account the accrued balance IS today's earnings, so the same
  // real number drives both "earnings today" and the withdrawable balance.
  const balance = formatUsd(balanceBaseUnits, decimals)
  const mask = (v: string) => (balHidden ? "$•••••" : v)

  async function handleWithdraw() {
    setError(null)
    setMsg(null)
    if (!authed) {
      setError("Sign in to withdraw your earnings.")
      return
    }
    setWithdrawing(true)
    try {
      const res = await withdraw()
      setMsg(res.txRef ? `Withdrawal submitted (ref ${res.txRef}).` : "Withdrawal submitted.")
      // Earnings are now settled on the backend — re-fetch so the balance reflects the real 0.
      await onWithdrawn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <section>
      {/* header row */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow eyebrow--gold" style={{ marginBottom: 10 }}>
            developer earnings
          </div>
          <h2 className="display" style={{ fontSize: 28, letterSpacing: "-0.025em", margin: 0 }}>
            Earned while you code.
          </h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn--toggle" onClick={() => setBalHidden((v) => !v)}>
            <Eye size={16} />
            {balHidden ? "Reveal" : "Hide"} balances
          </button>
          {authed ? (
            <span className="pill pill--account">
              <span className="dot-green" />
              {account ?? "Signed in"}
            </span>
          ) : (
            <span className="pill pill--account">Not signed in</span>
          )}
        </div>
      </div>

      {/* balance row — same real accrued number as earnings today + withdrawable */}
      <div className="grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 14, marginBottom: 20 }}>
        <div className="stat-card stat-card--green">
          <div className="stat-card__label">earnings today</div>
          <div className="stat-card__value" style={{ color: "var(--earn-text)" }}>
            {mask(balance)}
          </div>
          <div className="stat-card__sub">credited as ads are viewed in your terminal</div>
        </div>
        <div className="stat-card" style={{ background: "var(--g-1000)", color: "var(--g-100)", border: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "20px 22px" }}>
          <div className="eyebrow eyebrow--green">withdrawable balance</div>
          <div className="mono" style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.01em", margin: "6px 0" }}>
            {mask(balance)}
          </div>
          <button className="btn btn--green btn--40 btn--block" onClick={handleWithdraw} disabled={withdrawing}>
            <Coin size={16} strokeWidth={2} />
            {withdrawing ? "Withdrawing…" : "Withdraw to wallet"}
          </button>
        </div>
      </div>

      {(msg || error) && (
        <div className={`banner ${error ? "banner--error" : "banner--ok"}`} style={{ marginBottom: 20 }}>
          {error ?? msg}
        </div>
      )}

      <p style={{ fontSize: 13, color: "var(--g-650)", margin: 0, lineHeight: 1.5, maxWidth: 560 }}>
        Earnings settle privately as USDC on Arc. Withdraw your full balance to your wallet anytime.
      </p>
    </section>
  )
}
