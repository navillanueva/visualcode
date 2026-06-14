import type { ReactNode } from "react"
import { Spinner } from "@/components/Spinner"

// Reusable dark terminal window (title bar + body). Used in the landing hero and
// the /terminal docs section. Body typography is driven by .terminal__body.
export function Terminal({
  path,
  meta,
  size = "sm",
  shadow = "none",
  children,
}: {
  path: string
  meta?: string
  size?: "sm" | "lg"
  shadow?: "hero" | "lg" | "none"
  children: ReactNode
}) {
  const cls = [
    "terminal",
    size === "lg" ? "terminal--lg" : "",
    shadow === "hero" ? "terminal--hero" : shadow === "lg" ? "terminal--shadow" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={cls}>
      <div className="terminal__bar">
        <span className="terminal__dot" />
        <span className="terminal__dot" />
        <span className="terminal__dot" />
        <span className="terminal__path">{path}</span>
        {meta ? <span className="terminal__meta">{meta}</span> : null}
      </div>
      <div className="terminal__body">{children}</div>
    </div>
  )
}

// A completed agent step line: green ✓ + dim text, with bright filenames.
export function TermStep({ children }: { children: ReactNode }) {
  return (
    <div className="term-dim">
      {"  "}
      <span className="term-check">✓</span> {children}
    </div>
  )
}

// The status-line blurb — the product surface. One spinner, one status word, and
// exactly one sponsored blurb (advertiser tile + name + dim copy + `ad` tag).
export function StatusLine({
  word,
  advertiser,
  size = "sm",
  flush = false,
}: {
  word: string
  advertiser: { letter: string; name: ReactNode; copy: ReactNode }
  size?: "sm" | "lg"
  flush?: boolean
}) {
  const cls = ["status-line", size === "lg" ? "status-line--lg" : "", flush ? "status-line--flush" : ""]
    .filter(Boolean)
    .join(" ")
  return (
    <div className={cls}>
      <Spinner className="status-line__spin" />
      <span className="status-line__word">{word}</span>
      <span className="status-line__blurb">
        <span className="adv-tile">{advertiser.letter}</span>
        <span className="status-line__name">{advertiser.name}</span>
        <span className="status-line__copy">— {advertiser.copy}</span>
        <span className="ad-tag">ad</span>
      </span>
    </div>
  )
}
