import Link from "next/link"
import { Footer } from "@/components/Footer"
import { Spinner } from "@/components/Spinner"
import { ArrowRight, ArrowDownRight, Check, Coin, Lock, Shield } from "@/components/Icons"
import { InstallCommand } from "@/components/InstallCommand"

// Advertiser names (Linear/Dynamic/etc.) are PLACEHOLDERS — sample copy only.
// TODO(human): real launch partners.

const STEPS = [
  {
    n: "01",
    title: "Advertiser buys an ad",
    body: "One blurb, one bid per 1k impressions. An auction ranks the queue.",
    icon: <Coin />,
  },
  {
    n: "02",
    title: "Developer earns while coding",
    body: "The winning blurb shows in the status line. Each view credits you 50%, live.",
    icon: <ArrowDownRight />,
  },
  {
    n: "03",
    title: "Private payout on Arc",
    body: "Gas-free USDC, balances private. Withdraw at $10.",
    icon: <Lock />,
  },
]

const DEV_POINTS = ["50% of every impression, no minimum bid", "Balances & counterparties hidden by default", "One blurb, ever — never a banner or popup"]
const ADV_POINTS = ["Transparent CPM auction, bid from $1", "Live delivery & spend, edit anytime", "Fraud-reviewed impressions only"]

export default function Landing() {
  return (
    <main>
      {/* hero — centered single column */}
      <section style={{ maxWidth: 880, margin: "0 auto", padding: "80px 28px 36px", textAlign: "center" }}>
        <div className="oss-pill" style={{ marginBottom: 26 }}>
          <span className="oss-badge">OSS</span>
          Open-source coding agent
        </div>
        <h1 className="display" style={{ fontSize: 53, lineHeight: 1.04, letterSpacing: "-0.03em", margin: "0 0 22px" }}>
          Your terminal agent,
          <br />
          now an <span style={{ color: "var(--indigo-dark)" }}>income stream.</span>
        </h1>
        <p style={{ fontSize: 19, lineHeight: 1.5, color: "var(--g-700)", margin: "0 auto 34px", maxWidth: 560 }}>
          One tasteful sponsored blurb while your agent works — you keep{" "}
          <em style={{ fontStyle: "normal", color: "var(--g-1000)", fontWeight: 600 }}>half</em> of every impression.
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
          <Link href="/wallet" className="btn btn--ink btn--lg">
            Start earning <ArrowRight />
          </Link>
          <Link href="/advertise" className="btn btn--outline btn--lg">
            Advertise with us
          </Link>
        </div>
        <div style={{ maxWidth: 540, margin: "30px auto 0" }}>
          <InstallCommand />
          <div className="mono" style={{ marginTop: 9, fontSize: 11.5, letterSpacing: "0.04em", color: "var(--g-600)", textAlign: "center" }}>
            macOS · one line · no fork, no clone
          </div>
        </div>
        <div className="mono" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, marginTop: 26, fontSize: 13, color: "var(--g-650)", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span style={{ color: "var(--earn-text)", display: "inline-flex" }}>
              <Shield />
            </span>
            50/50 split
          </span>
        </div>
      </section>

      {/* before / after comparison — replaces the v1 terminal mock (handoff §2/§9) */}
      <section style={{ maxWidth: 640, margin: "0 auto", padding: "4px 28px 76px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 12 }}>
          {/* stock */}
          <div>
            <div className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--g-650)", margin: "0 0 9px 4px" }}>
              Stock Claude
            </div>
            <div style={{ background: "#20283a", borderRadius: 14, padding: "18px 22px", display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap", overflow: "hidden", border: "1px solid #2e3954" }}>
              <span style={{ color: "#d99a72", fontSize: 18, display: "inline-flex", flexShrink: 0 }}>
                <Spinner />
              </span>
              <span className="mono" style={{ fontSize: 16, color: "#e6a884" }}>
                Reticulating
              </span>
              <span className="mono" style={{ marginLeft: "auto", fontSize: 12, color: "#7c879c", flexShrink: 0 }}>
                Glob · 1.2s
              </span>
            </div>
          </div>

          <div style={{ textAlign: "center", color: "#7bdc3a", fontSize: 18, lineHeight: 1 }}>↓</div>

          {/* with blurbcode */}
          <div>
            <div className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--earn-text)", margin: "0 0 9px 4px" }}>
              With BlurbCode
            </div>
            <div style={{ background: "#20283a", borderRadius: 14, padding: "18px 22px", display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap", overflow: "hidden", border: "1px solid rgba(155,255,60,0.32)", boxShadow: "0 0 0 1px rgba(155,255,60,0.12)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7, background: "#4b3df5", color: "#fff", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                D
              </span>
              <span className="mono" style={{ fontSize: 16, color: "#a9c7ff", flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                Dynamic · wallets in minutes
              </span>
              <span className="mono" style={{ marginLeft: "auto", paddingLeft: 10, fontSize: 12, color: "#7c879c", flexShrink: 0 }}>
                Grep · 3.8s
              </span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 24, fontSize: 15, color: "var(--g-700)" }}>
          Same status line. One tasteful blurb — and{" "}
          <b style={{ color: "var(--g-1000)", fontWeight: 600 }}>half the revenue is yours.</b>
        </div>
      </section>

      {/* trust strip */}
      <section style={{ borderTop: "1px solid var(--g-300)", borderBottom: "1px solid var(--g-300)", background: "var(--g-100)" }}>
        <div
          className="shell"
          style={{ padding: "22px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap", fontSize: 13, color: "var(--g-650)" }}
        >
          <span>
            Private USDC settlement on <b style={{ color: "var(--g-1000)", fontWeight: 600 }}>Arc</b>
          </span>
          <span style={{ color: "var(--g-400)" }}>/</span>
          <span>Non-custodial wallet, your keys</span>
          <span style={{ color: "var(--g-400)" }}>/</span>
          <span>MIT-licensed core</span>
        </div>
      </section>

      {/* how it works */}
      <section className="shell" style={{ padding: "84px 28px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 44, gap: 24, flexWrap: "wrap" }}>
          <div>
            <div className="eyebrow eyebrow--green" style={{ marginBottom: 12 }}>
              how it works
            </div>
            <h2 className="display" style={{ fontSize: 38, letterSpacing: "-0.02em" }}>
              Three steps, one quiet line.
            </h2>
          </div>
          <p style={{ fontSize: 15, color: "var(--g-700)", maxWidth: 360, margin: 0, lineHeight: 1.55 }}>
            An ascending auction sets the blurb. The developer earns while coding. Arc settles it privately. No dashboards
            to babysit.
          </p>
        </div>
        <div className="grid-collapse" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {STEPS.map((s) => (
            <div key={s.n} className="card" style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 230 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="mono" style={{ fontSize: 13, color: "var(--g-600)" }}>
                  {s.n}
                </span>
                <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--indigo-tile)", color: "var(--indigo-dark)", display: "grid", placeItems: "center" }}>
                  {s.icon}
                </span>
              </div>
              <h3 className="display" style={{ fontSize: 20, letterSpacing: "-0.01em", margin: "8px 0 0" }}>
                {s.title}
              </h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "var(--g-700)", margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* two audiences */}
      <section
        className="shell grid-collapse"
        style={{ padding: "0 28px 88px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
      >
        {/* developers — softer dark blue (handoff §9) */}
        <div className="card--18" style={{ background: "#2a3957", color: "var(--g-100)", padding: 38, position: "relative", overflow: "hidden" }}>
          <div className="eyebrow eyebrow--green" style={{ marginBottom: 16 }}>
            for developers
          </div>
          <h3 className="display" style={{ fontSize: 27, letterSpacing: "-0.02em", margin: "0 0 12px" }}>
            Get paid to do what you already do.
          </h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--g-400)", margin: "0 0 24px", maxWidth: 420 }}>
            Install, code as normal, watch earnings accrue per impression. Withdraw privately whenever you cross $10. No
            spam, no telemetry on your code.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 28 }}>
            {DEV_POINTS.map((p) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--indigo-light)" }}>
                <span style={{ color: "var(--earn)", display: "inline-flex", flexShrink: 0 }}>
                  <Check />
                </span>
                {p}
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 22 }}>
            <InstallCommand compact />
          </div>
          <Link href="/me" className="btn" style={{ background: "var(--g-100)", color: "var(--g-1000)" }}>
            See earnings <ArrowRight size={17} />
          </Link>
        </div>

        {/* advertisers — light */}
        <div className="card card--18" style={{ padding: 38 }}>
          <div className="eyebrow eyebrow--indigo" style={{ marginBottom: 16 }}>
            for advertisers
          </div>
          <h3 className="display" style={{ fontSize: 27, letterSpacing: "-0.02em", margin: "0 0 12px" }}>
            Reach developers inside the tool they live in.
          </h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--g-700)", margin: "0 0 24px", maxWidth: 420 }}>
            A credible, modern ad platform. Bid per thousand impressions in a simple ascending auction. Your blurb appears
            in the status line of real engineers, mid-flow.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 28 }}>
            {ADV_POINTS.map((p) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--g-800)" }}>
                <span style={{ color: "var(--indigo-dark)", display: "inline-flex", flexShrink: 0 }}>
                  <Check />
                </span>
                {p}
              </div>
            ))}
          </div>
          <div style={{ background: "var(--g-200)", border: "1px solid var(--g-300)", borderRadius: 10, padding: "14px 16px", marginBottom: 22, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 6, background: "var(--indigo-dark)", color: "#fff", fontSize: 12, fontWeight: 700 }}>
              L
            </span>
            <span style={{ fontSize: 13.5, color: "var(--g-800)", fontWeight: 500 }}>Linear</span>
            <span style={{ fontSize: 13.5, color: "var(--g-650)" }}>— plan, build, ship faster</span>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 12, color: "var(--earn-text)" }}>
              $7.00 / 1k
            </span>
          </div>
          <Link href="/advertise" className="btn btn--ink">
            Advertise <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  )
}
