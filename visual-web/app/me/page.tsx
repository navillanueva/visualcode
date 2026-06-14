"use client"

import { useEffect, useState } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { getTreasury, withdraw, type Treasury } from "@/lib/api"
import { useMe } from "@/lib/useMe"
import { fromBaseUnits } from "@/lib/money"
import { Coin, Eye } from "@/components/Icons"

export default function EarningsPage() {
  const { me, isLoggedIn, refresh } = useMe()
  const { user } = useDynamicContext()
  const authed = isLoggedIn || me !== null

  // Treasury is authoritative for the token's decimals — never hardcode them.
  // Until loaded, fall back to 6dp; the real backend returns 18 for the arc-testnet pool token.
  const [treasury, setTreasury] = useState<Treasury | null>(null)
  const decimals = treasury?.decimals ?? 6
  useEffect(() => {
    getTreasury()
      .then(setTreasury)
      .catch(() => setTreasury(null))
  }, [])

  const [balHidden, setBalHidden] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Real accrued earnings from GET /api/me (base-unit string → dollars). For a
  // fresh demo account the accrued balance IS today's earnings, so the same real
  // number drives both "earnings today" and the withdrawable balance.
  const balance = `$${Number(fromBaseUnits(BigInt(me?.balanceBaseUnits ?? "0"), decimals)).toFixed(2)}`
  const account =
    (user?.email as string | undefined) ?? (me?.address ? `${me.address.slice(0, 6)}…${me.address.slice(-4)}` : null)
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
      await refresh()
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
    </main>
  )
}
