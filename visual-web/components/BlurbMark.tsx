// The BlurbCode brand mark — a squircle app icon (rx≈26% on a 100×100 viewBox)
// with a stroked caret `›` (the shell prompt) pointing at an indigo blurb dot.
// Defined entirely in SVG per the handoff's Brand identity section.

type MarkVariant = "dark" | "light" | "mono" | "mono-on-ink"

export function BlurbMark({
  size = 28,
  variant = "dark",
  className,
}: {
  size?: number
  variant?: MarkVariant
  className?: string
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 100 100",
    className,
    "aria-hidden": true,
    focusable: false,
    style: { display: "block" } as const,
  }

  // Bare caret + dot, single ink color — favicons, CLI splash, one-color contexts.
  if (variant === "mono") {
    return (
      <svg {...common}>
        <path
          d="M33 34L49 50L33 66"
          stroke="#141414"
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx={67} cy={50} r={8} fill="#141414" />
      </svg>
    )
  }

  // White bare mark on an ink rounded ground.
  if (variant === "mono-on-ink") {
    return (
      <svg {...common} style={{ display: "block", background: "#141414", borderRadius: "10px" }}>
        <path
          d="M33 34L49 50L33 66"
          stroke="#fdfdfd"
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx={67} cy={50} r={8} fill="#fdfdfd" />
      </svg>
    )
  }

  // Squircle marks: dark-on-light (default) and light-on-dark.
  const ground = variant === "light" ? "#fdfdfd" : "#141414"
  const caret = variant === "light" ? "#141414" : "#fdfdfd"
  return (
    <svg {...common}>
      <rect width="100" height="100" rx="26" fill={ground} />
      <path
        d="M33 34L49 50L33 66"
        stroke={caret}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx={67} cy={50} r={7} fill="#6676b3" />
    </svg>
  )
}

// Lowercase wordmark: "blurb" (ink, 600) + "code" (g-650, 600). On dark surfaces
// "blurb" inherits the parent's light color automatically.
export function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <span className="wordmark__a">blurb</span>
      <span className="wordmark__b">code</span>
    </span>
  )
}

// Mark + wordmark lockup.
export function Logo({
  markSize = 28,
  wordSize = 17,
  variant = "dark",
  gap = 10,
}: {
  markSize?: number
  wordSize?: number
  variant?: MarkVariant
  gap?: number
}) {
  return (
    <span className="logo" style={{ gap }}>
      <BlurbMark size={markSize} variant={variant} />
      <Wordmark size={wordSize} />
    </span>
  )
}
