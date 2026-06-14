import { BlurbMark, Logo } from "@/components/BlurbMark"
import { Footer } from "@/components/Footer"

// Internal brand reference / design-system docs — seeds the theme tokens. Not a
// user-facing route. Mirrors the handoff's Brand screen.

const NEUTRALS = [
  { n: "100", hex: "#fdfdfd", light: false },
  { n: "200", hex: "#f6f6f6", light: false },
  { n: "300", hex: "#ebebeb", light: false },
  { n: "400", hex: "#e1e1df", light: false },
  { n: "500", hex: "#cdcdcb", light: false },
  { n: "600", hex: "#b1b1b0", light: false },
  { n: "650", hex: "#8f8e8a", light: true },
  { n: "700", hex: "#6b6a66", light: true },
  { n: "800", hex: "#484846", light: true },
  { n: "900", hex: "#252525", light: true },
  { n: "1000", hex: "#141414", light: true },
]

const SCALES = [
  {
    name: "Indigo",
    tag: "signature",
    dot: "#6676b3",
    swatches: [
      { hex: "#c7d1de", label: "c7d1de", light: false },
      { hex: "#6676b3", label: "6676b3", light: true },
      { hex: "#4d5a8d", label: "4d5a8d", light: true },
    ],
  },
  {
    name: "Gold",
    tag: "accent · sparing",
    dot: "#ccb98c",
    swatches: [
      { hex: "#ebe1cd", label: "ebe1cd", light: false },
      { hex: "#ccb98c", label: "ccb98c", light: false },
      { hex: "#9c8760", label: "9c8760", light: true },
    ],
  },
  {
    name: "Semantic",
    tag: "earnings · state",
    dot: "#9be055",
    swatches: [
      { hex: "#9be055", label: "earn", light: false },
      { hex: "#fdc85d", label: "warn", light: false },
      { hex: "#f98277", label: "error", light: true },
    ],
  },
]

const sectionLabel = { fontFamily: "var(--mono)", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--g-650)" }

export default function BrandPage() {
  return (
    <>
      <main className="shell" style={{ padding: "64px 28px 100px" }}>
        <div style={{ marginBottom: 52, maxWidth: 640 }}>
          <div className="eyebrow eyebrow--gold" style={{ marginBottom: 12 }}>
            brand system
          </div>
          <h1 className="display" style={{ fontSize: 42, letterSpacing: "-0.025em", margin: "0 0 14px" }}>
            A mark that lives in two places.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: "var(--g-700)", margin: 0 }}>
            One identity for a clean fintech web app and a dark monospace terminal. They share the caret-and-blurb mark and
            a single indigo accent — the web is the polished surface.
          </p>
        </div>

        {/* logo lockups */}
        <div style={{ ...sectionLabel, marginBottom: 14 }}>Logo &amp; wordmark</div>
        <div className="grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="card" style={{ minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
            <Logo markSize={58} wordSize={34} gap={16} />
          </div>
          <div style={{ background: "var(--term-body)", border: "1px solid var(--term-border)", borderRadius: 16, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--g-100)" }}>
            <Logo markSize={58} wordSize={34} gap={16} variant="light" />
          </div>
        </div>

        {/* marks + glyph */}
        <div className="grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="card">
            <div style={{ ...sectionLabel, marginBottom: 20 }}>App icon &amp; marks</div>
            <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
              <BlurbMark size={72} />
              <BlurbMark size={52} />
              <BlurbMark size={34} />
              <div style={{ width: 1, height: 54, background: "var(--g-300)" }} />
              <BlurbMark size={40} variant="mono" />
              <BlurbMark size={40} variant="mono-on-ink" />
            </div>
            <p style={{ fontSize: 13, color: "var(--g-650)", lineHeight: 1.5, margin: "20px 0 0" }}>
              The squircle reads at every size. The bare caret-and-dot is the monochrome mark for one-color contexts —
              favicons, CLI splash, GitHub.
            </p>
          </div>

          <div style={{ background: "var(--term-body)", border: "1px solid var(--term-border)", borderRadius: 16, padding: 28, color: "var(--term-text)" }}>
            <div style={{ ...sectionLabel, color: "var(--term-dim-3)", marginBottom: 20 }}>Status-line glyph</div>
            <div className="mono" style={{ fontSize: 15, lineHeight: 2 }}>
              <div style={{ color: "var(--term-dim)" }}>
                before&nbsp;&nbsp;<span style={{ color: "var(--term-dim-2)" }}>◆ Linear — plan, build, ship faster</span>
              </div>
              <div style={{ color: "var(--earn)" }}>
                after&nbsp;&nbsp;&nbsp;<span style={{ color: "var(--indigo)", fontWeight: 700 }}>›</span>
                <span style={{ color: "var(--term-text-2)" }}> Linear — plan, build, ship faster</span>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "var(--term-dim-3)", lineHeight: 1.5, margin: "18px 0 0" }}>
              A single caret <span className="mono" style={{ color: "var(--indigo)" }}>›</span> — the same glyph as a shell
              prompt. One cell wide, monochrome, legible at 11px. It points at the blurb instead of decorating it.
            </p>
          </div>
        </div>

        {/* color · neutrals */}
        <div style={{ ...sectionLabel, margin: "44px 0 14px" }}>Color · neutrals</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(11,1fr)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--g-300)", marginBottom: 20 }}>
          {NEUTRALS.map((c) => (
            <div key={c.n} className="mono" style={{ background: c.hex, height: 88, display: "flex", alignItems: "flex-end", padding: 8, fontSize: 9, color: c.light ? "#fff" : "#141414" }}>
              {c.n}
            </div>
          ))}
        </div>

        {/* color · scales */}
        <div className="grid-collapse" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {SCALES.map((scale) => (
            <div key={scale.name} className="card card--14" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--g-300)", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 16, height: 16, borderRadius: "50%", background: scale.dot }} />
                <span style={{ fontSize: 14, fontWeight: 500 }}>{scale.name}</span>
                <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--g-650)", textTransform: "uppercase" }}>
                  {scale.tag}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)" }}>
                {scale.swatches.map((s) => (
                  <div key={s.label} className="mono" style={{ background: s.hex, height: 74, display: "flex", alignItems: "flex-end", padding: 8, fontSize: 10, color: s.light ? "#fff" : "#141414" }}>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* type */}
        <div style={{ ...sectionLabel, margin: "44px 0 14px" }}>Typography · Inter + BlurbMono</div>
        <div className="card" style={{ padding: "8px 28px" }}>
          <TypeRow label="Display / 600">
            <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em" }}>Income stream</span>
          </TypeRow>
          <TypeRow label="H2 / 500">
            <span style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em" }}>One tasteful blurb</span>
          </TypeRow>
          <TypeRow label="Body / 400">
            <span style={{ fontSize: 16, fontWeight: 400, color: "var(--g-800)", lineHeight: 1.5 }}>
              You keep half of every impression, paid privately in USDC.
            </span>
          </TypeRow>
          <TypeRow label="Mono / 400" last>
            <span className="mono" style={{ fontSize: 15, color: "var(--g-1000)" }}>
              $0.0021 · bc_dev_7Qx9R2mK · 41,208 imps
            </span>
          </TypeRow>
        </div>
      </main>
      <Footer />
    </>
  )
}

function TypeRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", alignItems: "baseline", padding: "18px 0", borderBottom: last ? "none" : "1px solid var(--g-300)" }}>
      <span className="mono" style={{ fontSize: 11, color: "var(--g-650)" }}>
        {label}
      </span>
      {children}
    </div>
  )
}
