import { Logo } from "@/components/BlurbMark"

// Marketing footer (landing / terminal / brand). Hairline top, ink+grey wordmark,
// mono domain + a small row of mono links.
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo markSize={24} wordSize={15} />
          <span className="mono" style={{ fontSize: 12, color: "var(--g-600)", marginLeft: 6 }}>
            blurbcode.xyz
          </span>
        </div>
        <div className="site-footer__links">
          <span>open source</span>
          <span>docs</span>
          <span>arc network</span>
          <span>privacy</span>
        </div>
      </div>
    </footer>
  )
}
