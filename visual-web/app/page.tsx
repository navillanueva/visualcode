import Link from "next/link"
import { Terminal, TermStep, StatusLine } from "@/components/Terminal"
import { Footer } from "@/components/Footer"
import { ArrowRight, ArrowDownRight, Check, Coin, Lock, Shield } from "@/components/Icons"

// Advertiser names (Linear/etc.) are PLACEHOLDERS — sample copy only.
// TODO(human): real launch partners.

const STEPS = [
  {
    n: "01",
    title: "Advertiser funds a campaign",
    body: "They write one short blurb, set a click-through URL, and bid per thousand impressions. An ascending auction ranks the queue.",
    icon: <Coin />,
  },
  {
    n: "02",
    title: "Developer earns while coding",
    body: "BlurbCode shows the winning blurb in the status line as the agent works. Each impression credits the developer 50% — live, in real time.",
    icon: <ArrowDownRight />,
  },
  {
    n: "03",
    title: "Private payout on Arc",
    body: "Earnings settle as gas-free USDC micropayments on Arc. Balances and counterparties stay private. Withdraw at $10.",
    icon: <Lock />,
  },
]

const DEV_POINTS = ["50% of every impression, no minimum bid", "Balances & counterparties hidden by default", "One blurb, ever — never a banner or popup"]
const ADV_POINTS = ["Transparent CPM auction, bid from $1", "Live delivery & spend, edit anytime", "Fraud-reviewed impressions only"]

export default function Landing() {
  return (
    <main>
      {/* hero */}
      <section
        className="shell grid-collapse"
        style={{ padding: "84px 28px 64px", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 56, alignItems: "center" }}
      >
        <div>
          <div className="oss-pill" style={{ marginBottom: 26 }}>
            <span className="oss-badge">OSS</span>
            Open-source coding agent · forked from OpenCode
          </div>
          <h1 className="display" style={{ fontSize: 53, lineHeight: 1.04, letterSpacing: "-0.03em", margin: "0 0 22px" }}>
            Your terminal agent,
            <br />
            now an <span style={{ color: "var(--indigo-dark)" }}>income stream.</span>
          </h1>
          <p style={{ fontSize: 19, lineHeight: 1.55, color: "var(--g-700)", margin: "0 0 34px", maxWidth: 498 }}>
            BlurbCode codes alongside you in the terminal. While the agent works, it shows{" "}
            <em style={{ fontStyle: "normal", color: "var(--g-1000)", fontWeight: 500 }}>one</em> tasteful sponsored blurb in
            the status line — and you keep half of every impression. Paid out privately in USDC on Arc.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Link href="/wallet" className="btn btn--ink btn--lg">
              Start earning <ArrowRight />
            </Link>
            <Link href="/advertise" className="btn btn--outline btn--lg">
              Advertise with us
            </Link>
          </div>
          <div className="mono" style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 34, fontSize: 13, color: "var(--g-650)", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span style={{ color: "var(--gold-dark)", display: "inline-flex" }}>
                <Shield />
              </span>
              50/50 split
            </span>
            <span>·</span>
            <span>balances hidden by default</span>
            <span>·</span>
            <span>never a banner</span>
          </div>
        </div>

        {/* terminal mock */}
        <Terminal path="~/acme-api — blurbcode" shadow="hero">
          <div className="t-faint">
            <span className="term-caret">›</span> implement the stripe webhook handler
          </div>
          <TermStep>
            read <span className="term-bright">routes/webhooks.ts</span>
          </TermStep>
          <TermStep>
            edited <span className="term-bright">3 files</span>, +84 −12
          </TermStep>
          <TermStep>
            ran <span className="term-bright">pnpm test</span> — 24 passing
          </TermStep>
          <div style={{ height: 14 }} />
          <StatusLine word="Working" advertiser={{ letter: "L", name: "Linear", copy: "plan, build, ship faster" }} />
          <div style={{ marginTop: 12, color: "var(--term-dim)", fontSize: 11.5 }}>
            ↑ one blurb · never covers your work · you earned <span className="term-check">$0.0021</span> from this view
          </div>
        </Terminal>
      </section>

      {/* trust strip */}
      <section style={{ borderTop: "1px solid var(--g-300)", borderBottom: "1px solid var(--g-300)", background: "var(--g-100)" }}>
        <div
          className="shell"
          style={{ padding: "22px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap", fontSize: 13, color: "var(--g-650)" }}
        >
          <span className="mono" style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 11, color: "var(--g-600)" }}>
            trusted plumbing
          </span>
          <span>
            Private USDC settlement on <b style={{ color: "var(--g-1000)", fontWeight: 600 }}>Arc</b>
          </span>
          <span style={{ color: "var(--g-400)" }}>/</span>
          <span>Non-custodial wallet, your keys</span>
          <span style={{ color: "var(--g-400)" }}>/</span>
          <span>
            Every payout <b style={{ color: "var(--g-1000)", fontWeight: 600 }}>reviewed for fraud</b>
          </span>
          <span style={{ color: "var(--g-400)" }}>/</span>
          <span>MIT-licensed core</span>
        </div>
      </section>

      {/* how it works */}
      <section className="shell" style={{ padding: "84px 28px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 44, gap: 24, flexWrap: "wrap" }}>
          <div>
            <div className="eyebrow eyebrow--gold" style={{ marginBottom: 12 }}>
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
        {/* developers — dark */}
        <div className="card card--dark card--18" style={{ padding: 38 }}>
          <div className="eyebrow eyebrow--green" style={{ marginBottom: 16 }}>
            for developers
          </div>
          <h3 className="display" style={{ fontSize: 27, letterSpacing: "-0.02em", margin: "0 0 12px" }}>
            Get paid to do what you already do.
          </h3>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--g-600)", margin: "0 0 24px", maxWidth: 420 }}>
            Install, code as normal, watch earnings accrue per impression. Withdraw privately whenever you cross $10. No
            spam, no telemetry on your code.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 28 }}>
            {DEV_POINTS.map((p) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--g-400)" }}>
                <span style={{ color: "var(--earn)", display: "inline-flex", flexShrink: 0 }}>
                  <Check />
                </span>
                {p}
              </div>
            ))}
          </div>
          <div className="mono" style={{ fontSize: 13, background: "var(--term-body)", border: "1px solid var(--term-border)", borderRadius: 10, padding: "14px 16px", color: "var(--g-650)", marginBottom: 22 }}>
            <span style={{ color: "var(--indigo)" }}>$</span> npm i -g blurbcode <span style={{ color: "var(--term-dim)" }}>&& blurb login</span>
          </div>
          <Link href="/me" className="btn" style={{ background: "var(--g-100)", color: "var(--g-1000)" }}>
            See an earnings dashboard <ArrowRight size={17} />
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
            Open the campaign portal <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  )
}
