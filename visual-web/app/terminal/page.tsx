import { Terminal, TermStep, StatusLine } from "@/components/Terminal"
import { Footer } from "@/components/Footer"

// Marketing/docs screen explaining the in-terminal blurb. Advertiser is a
// PLACEHOLDER. TODO(human): real launch partners.

const PRINCIPLES = [
  { title: "Never covers your work", body: "The blurb lives only in the spinner line. Output, diffs, and prompts are always untouched." },
  { title: "One line, one ad", body: "A single sponsor at a time, capped to the auction winner. No carousels, no stacking." },
  {
    title: "Mutes on demand",
    body: (
      <>
        <span className="mono" style={{ fontSize: 12, background: "var(--g-200)", padding: "1px 6px", borderRadius: 4 }}>
          blurb --quiet
        </span>{" "}
        hides it entirely — you just stop earning.
      </>
    ),
  },
]

export default function TerminalPage() {
  return (
    <>
      <main className="shell shell--1080" style={{ padding: "56px 28px 100px" }}>
        <div style={{ textAlign: "center", maxWidth: 620, margin: "0 auto 40px" }}>
          <div className="eyebrow eyebrow--gold" style={{ marginBottom: 12 }}>
            the surface that matters
          </div>
          <h1 className="display" style={{ fontSize: 36, letterSpacing: "-0.025em", margin: "0 0 12px" }}>
            One blurb, in the status line.
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--g-700)", margin: 0 }}>
            The whole product is a single tasteful line next to the spinner. It never covers the agent's work, never
            interrupts, and never becomes a banner.
          </p>
        </div>

        <div style={{ marginBottom: 24 }}>
          <Terminal path="~/acme-api — blurbcode v1.2.0" meta="claude-sonnet · 24k ctx" size="lg" shadow="lg">
            <div>
              <span className="term-caret">›</span> add idempotency keys to the payments service
            </div>
            <TermStep>
              read <span className="term-bright">services/payments/charge.ts</span>
            </TermStep>
            <TermStep>
              added <span className="term-bright">idempotency_keys</span> table + migration
            </TermStep>
            <TermStep>
              wrapped charge handler, updated <span className="term-bright">6 call sites</span>
            </TermStep>
            <TermStep>
              ran <span className="term-bright">pnpm test</span> — <span className="term-check">38 passing</span>
            </TermStep>
            <div style={{ height: 18 }} />
            <StatusLine size="lg" word="writing tests for edge cases…" advertiser={{ letter: "L", name: "Linear", copy: "plan, build, ship faster" }} />
            <div style={{ marginTop: 14, color: "var(--term-dim)", fontSize: 12, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <span>esc to stop · ⏎ to reply</span>
              <span>
                you earned <span className="term-check">$0.0021</span> · <span className="term-caret">›</span> tap blurb to
                learn more
              </span>
            </div>
          </Terminal>
        </div>

        <div className="grid-collapse" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="card card--14" style={{ padding: 22 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 7 }}>{p.title}</div>
              <p style={{ fontSize: 13.5, color: "var(--g-700)", lineHeight: 1.5, margin: 0 }}>{p.body}</p>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  )
}
