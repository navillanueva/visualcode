"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { createDeviceToken } from "@/lib/api"
import { fromBaseUnits } from "@/lib/money"
import { useMe } from "@/lib/useMe"
import { BlurbMark } from "@/components/BlurbMark"
import { VerifyHuman } from "@/components/VerifyHuman"
import { ArrowRight, Check, Coin, Copy, Lock, Shield, WarningTriangle } from "@/components/Icons"

// Format a balance (token base-unit string) as a "$0.00" USD figure. Unknown or
// not-yet-loaded balances read as "$0.00" — never a fake placeholder.
function formatUsd(baseUnits: string | undefined): string {
  if (!baseUnits) return "$0.00"
  try {
    return `$${Number(fromBaseUnits(BigInt(baseUnits))).toFixed(2)}`
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

export default function WalletPage() {
  const { me, isLoggedIn, refresh } = useMe()
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const connected = isLoggedIn || me !== null

  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("email")
  const [email, setEmail] = useState("")

  return (
    <main className="shell shell--980" style={{ padding: "56px 28px 100px" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <span className="pill pill--arc pill--sm" style={{ marginBottom: 18 }}>
          <Lock size={13} strokeWidth={1.6} />
          non-custodial · your keys
        </span>
        <h1 className="display" style={{ fontSize: 36, letterSpacing: "-0.025em", margin: "0 0 12px" }}>
          Connect a wallet, get a device token.
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--g-700)", margin: "0 auto", maxWidth: 520 }}>
          Sign in with email or social — we create a non-custodial wallet, then issue a device token for your terminal.
        </p>
      </div>

      {connected ? (
        <ConnectedState
          address={me?.address ?? primaryWallet?.address ?? null}
          balanceBaseUnits={me?.balanceBaseUnits}
          worldIdVerified={me?.worldIdVerified ?? false}
          onVerified={refresh}
        />
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
              <label className="field__label" htmlFor="wallet-email">
                Email address
              </label>
              <input id="wallet-email" className="input input--44" value={email} onChange={(e) => setEmail(e.target.value)} />
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

function ConnectedState({
  address,
  balanceBaseUnits,
  worldIdVerified,
  onVerified,
}: {
  address: string | null
  balanceBaseUnits?: string
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
  const loginShort = token ? (token.length > 16 ? `${token.slice(0, 11)}…${token.slice(-4)}` : token) : ""
  const shortAddr = address ? `${address.slice(0, 6)} ···· ${address.slice(-4)}` : "—"

  async function copy() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard needs a secure context; the field is selectable as a fallback */
    }
  }

  return (
    <div className="grid-collapse" style={{ display: "grid", gridTemplateColumns: "0.85fr 1.15fr", gap: 20, alignItems: "start" }}>
      {/* wallet card */}
      <div
        style={{
          background: "linear-gradient(155deg,#141414 0%,#252525 60%,#4d5a8d 140%)",
          color: "var(--g-100)",
          borderRadius: 18,
          padding: 26,
          aspectRatio: "1.586 / 1",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
          boxShadow: "var(--shadow-wallet)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <BlurbMark size={34} variant="light" />
          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(253,253,253,0.6)" }}>
            non-custodial
          </span>
        </div>
        <div>
          <div className="mono" style={{ fontSize: 16, letterSpacing: "0.06em", color: "var(--g-400)" }}>
            {shortAddr}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(253,253,253,0.6)" }}>balance</div>
              <div className="mono" style={{ fontSize: 20, marginTop: 2 }}>
                {formatUsd(balanceBaseUnits)}
              </div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 22, padding: "0 9px", borderRadius: 8, background: "rgba(155,224,85,0.16)", color: "var(--earn)", fontSize: 11, fontWeight: 500 }}>
              ● Arc
            </span>
          </div>
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
          Paste this into your terminal once. It authorizes this machine to earn — and nothing else.
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
          <>
            <div style={{ background: "var(--g-200)", border: "1px solid var(--g-400)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <span className="mono" style={{ fontSize: 14, color: "var(--g-1000)", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                {reveal ? token : masked}
              </span>
              <button className="linkbtn" onClick={() => setReveal((v) => !v)}>
                {reveal ? "Hide" : "Reveal"}
              </button>
              <button className="btn btn--ink btn--copy" onClick={copy}>
                <Copy size={14} />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="mono" style={{ background: "var(--term-body)", border: "1px solid var(--term-border)", borderRadius: 12, padding: "14px 16px", fontSize: 13, color: "var(--g-650)", marginBottom: 20 }}>
              <span style={{ color: "var(--indigo)" }}>$</span> blurb login --token <span className="term-check">{loginShort}</span>
            </div>
          </>
        )}

        <Link href="/me" className="btn btn--outline btn--block">
          Go to my earnings <ArrowRight size={17} />
        </Link>

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
