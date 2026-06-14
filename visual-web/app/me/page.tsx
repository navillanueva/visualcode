"use client"

import { useState } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { withdraw } from "@/lib/api"
import { useMe } from "@/lib/useMe"
import { Coin, Eye, WarningTriangle } from "@/components/Icons"

// Chart / ledger figures are SAMPLE data (advertiser names are PLACEHOLDERS).
// TODO(human): real earnings, impressions, and ledger from the backend.
const DATA: Record<Win, number[]> = {
  "24h": [0.04, 0.02, 0.0, 0.0, 0.01, 0.06, 0.18, 0.31, 0.44, 0.52, 0.38, 0.41, 0.49, 0.55, 0.61, 0.47, 0.39, 0.42, 0.51, 0.36, 0.22, 0.14, 0.09, 0.05],
  "7d": [2.1, 3.42, 1.85, 4.1, 3.2, 5.05, 4.21],
  "30d": [1.2, 0.8, 1.6, 2.1, 1.9, 2.4, 3.0, 2.2, 1.7, 2.8, 3.3, 2.9, 3.6, 4.1, 3.2, 2.6, 3.0, 3.8, 4.4, 3.1, 2.7, 3.5, 4.0, 4.6, 3.9, 3.3, 4.2, 4.8, 4.1, 4.2],
}
type Win = "24h" | "7d" | "30d"
const WINDOWS: Win[] = ["24h", "7d", "30d"]

const STATS = [
  { k: "today", v: "$4.21", s: "credited today", green: true },
  { k: "this month", v: "$86.40", s: "month-to-date", green: false },
  { k: "lifetime", v: "$312.78", s: "all-time credit", green: false },
]

const LEDGER = [
  { adv: "Linear", mk: "L", copy: "plan, build, ship faster", imps: "412", credit: "+$0.86", t: "2m ago" },
  { adv: "Warp", mk: "W", copy: "the terminal, reimagined", imps: "318", credit: "+$0.64", t: "14m ago" },
  { adv: "Neon", mk: "N", copy: "serverless Postgres", imps: "902", credit: "+$1.80", t: "38m ago" },
  { adv: "Resend", mk: "R", copy: "email for developers", imps: "540", credit: "+$1.08", t: "1h ago" },
  { adv: "Sentry", mk: "S", copy: "code breaks, catch it", imps: "277", credit: "+$0.55", t: "2h ago" },
  { adv: "Fly.io", mk: "F", copy: "deploy close to users", imps: "150", credit: "+$0.30", t: "3h ago" },
]

const WITHDRAWABLE = "$312.78"

export default function EarningsPage() {
  const { me, isLoggedIn } = useMe()
  const { user } = useDynamicContext()
  const authed = isLoggedIn || me !== null
  const email = (user?.email as string | undefined) ?? "nicolas@avalabs.org"

  const [win, setWin] = useState<Win>("7d")
  const [balHidden, setBalHidden] = useState(false)

  const [withdrawing, setWithdrawing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const series = DATA[win]
  const maxV = Math.max(...series, 0.01)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <main className="shell" style={{ padding: "40px 28px 100px" }}>
      {/* header row */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow eyebrow--gold" style={{ marginBottom: 10 }}>
            developer earnings
          </div>
          <h1 className="display" style={{ fontSize: 34, letterSpacing: "-0.025em", margin: 0 }}>
            Earned while you code.
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn--toggle" onClick={() => setBalHidden((v) => !v)}>
            <Eye size={16} />
            {balHidden ? "Reveal" : "Hide"} balances
          </button>
          <span className="pill pill--account">
            <span className="dot-green" />
            {email}
          </span>
        </div>
      </div>

      {/* stat row */}
      <div className="grid-collapse" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr) 1.2fr", gap: 14, marginBottom: 20 }}>
        {STATS.map((st) => (
          <div key={st.k} className="stat-card stat-card--green">
            <div className="stat-card__label">{st.k}</div>
            <div className="stat-card__value" style={st.green ? { color: "var(--earn-text)" } : undefined}>
              {mask(st.v)}
            </div>
            <div className="stat-card__sub">{st.s}</div>
          </div>
        ))}
        <div className="stat-card" style={{ background: "var(--g-1000)", color: "var(--g-100)", border: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "20px 22px" }}>
          <div className="eyebrow eyebrow--green">withdrawable balance</div>
          <div className="mono" style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.01em", margin: "6px 0" }}>
            {mask(WITHDRAWABLE)}
          </div>
          <button className="btn btn--green btn--40 btn--block" onClick={handleWithdraw} disabled={withdrawing}>
            {withdrawing ? "Withdrawing…" : "Withdraw to wallet"}
          </button>
        </div>
      </div>

      {(msg || error) && (
        <div className={`banner ${error ? "banner--error" : "banner--ok"}`} style={{ marginBottom: 20 }}>
          {error ?? msg}
        </div>
      )}

      {/* chart + payouts */}
      <div className="grid-collapse" style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 20, marginBottom: 20, alignItems: "start" }}>
        {/* earnings activity */}
        <div className="card card--18" style={{ padding: 26 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <h2 className="display" style={{ fontSize: 19, margin: 0 }}>
              Earnings activity
            </h2>
            <div className="win-toggle">
              {WINDOWS.map((w) => (
                <button key={w} className={`win-toggle__btn${win === w ? " win-toggle__btn--active" : ""}`} onClick={() => setWin(w)}>
                  {w}
                </button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 13, color: "var(--g-650)", margin: "0 0 24px" }}>
            Credit grouped over the selected window. Earnings update per impression.
          </p>
          <div className="chart">
            {series.map((v, i) => (
              <div
                key={`${win}-${i}`}
                className={`chart__bar${i === series.length - 1 ? " chart__bar--last" : ""}`}
                style={{ height: `${Math.max(3, Math.round((v / maxV) * 100))}%` }}
              />
            ))}
          </div>
          <div className="mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 12, color: "var(--g-650)" }}>
            <span>$22.93 across 2,599 impressions</span>
            <span style={{ color: "var(--earn-text)" }}>▲ best day $5.05</span>
          </div>
        </div>

        {/* payouts */}
        <div className="card card--18" style={{ padding: 26 }}>
          <h2 className="display" style={{ fontSize: 19, margin: "0 0 6px" }}>
            Payouts
          </h2>
          <p style={{ fontSize: 13, color: "var(--g-650)", margin: "0 0 20px", lineHeight: 1.5 }}>
            Private USDC settlement on Arc. Withdraw anytime above $10.
          </p>
          <div style={{ background: "var(--earn-bg)", border: "1px solid var(--earn-border)", borderRadius: 14, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--earn)", color: "#1a2e07", display: "grid", placeItems: "center" }}>
                <Coin size={18} strokeWidth={2} />
              </span>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#3f5a13" }}>You're eligible to withdraw</div>
            </div>
            <p style={{ fontSize: 13, color: "#5a7320", lineHeight: 1.5, margin: "0 0 16px" }}>
              Balance <b>$312.78</b> is above the $10 threshold. Next batch settles in ~2h.
            </p>
            <button className="btn btn--ink btn--44 btn--block" onClick={handleWithdraw} disabled={withdrawing}>
              {withdrawing ? "Withdrawing…" : "Set up payouts"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 16, fontSize: 12, color: "var(--warn-text)", lineHeight: 1.5 }}>
            <span style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1, display: "inline-flex" }}>
              <WarningTriangle />
            </span>
            Every payout is manually reviewed for fraud. Click-farm and bot earnings are not paid — it keeps the split
            honest.
          </div>
        </div>
      </div>

      {/* activity ledger */}
      <div className="list-card">
        <div className="list-card__head" style={{ padding: "20px 24px" }}>
          <div>
            <h2 className="display" style={{ fontSize: 19, margin: "0 0 2px" }}>
              Activity ledger
            </h2>
            <span style={{ fontSize: 13, color: "var(--g-650)" }}>Credited impressions for this account.</span>
          </div>
          <span className="mono" style={{ fontSize: 12, color: "var(--earn-text)" }}>
            6 of 2,599 rows
          </span>
        </div>
        <div
          className="mono"
          style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 0.7fr 0.7fr 0.6fr", gap: 16, padding: "12px 24px", borderBottom: "1px solid var(--g-300)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--g-600)" }}
        >
          <span>advertiser</span>
          <span>blurb</span>
          <span style={{ textAlign: "right" }}>imps</span>
          <span style={{ textAlign: "right" }}>credit</span>
          <span style={{ textAlign: "right" }}>when</span>
        </div>
        {LEDGER.map((row) => (
          <div key={row.adv} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 0.7fr 0.7fr 0.6fr", gap: 16, padding: "14px 24px", borderTop: "1px solid var(--g-200)", alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span className="mark-tile">{row.mk}</span>
              <b style={{ fontSize: 14, fontWeight: 600 }}>{row.adv}</b>
            </span>
            <span style={{ fontSize: 13.5, color: "var(--g-700)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.copy}</span>
            <span className="mono" style={{ fontSize: 13, color: "var(--g-800)", textAlign: "right" }}>{row.imps}</span>
            <span className="mono" style={{ fontSize: 13, color: "var(--earn-text)", textAlign: "right", fontWeight: 500 }}>{mask(row.credit)}</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--g-600)", textAlign: "right" }}>{row.t}</span>
          </div>
        ))}
      </div>
    </main>
  )
}
