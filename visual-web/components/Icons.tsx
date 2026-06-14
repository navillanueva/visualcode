// Inline SVG icons matching the design handoff exactly (stroke = currentColor so
// the parent sets the color). Sizes/stroke-widths default to the prototype values.

type IconProps = { size?: number; strokeWidth?: number; className?: string }

const base = (size: number, viewBox = "0 0 24 24") =>
  ({ width: size, height: size, viewBox, fill: "none", "aria-hidden": true, focusable: false }) as const

export function ArrowRight({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ArrowDownRight({ size = 19, strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M7 7l10 10M17 17V9M17 17H9" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Check({ size = 17, strokeWidth = 2.2, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Coin({ size = 19, strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={strokeWidth} />
      <path
        d="M12 7.5v9M14.2 9.3c-.4-.8-1.2-1.2-2.2-1.2-1.3 0-2.2.7-2.2 1.7 0 1.1.9 1.5 2.4 1.9 1.6.4 2.5.9 2.5 2.1 0 1.1-1 1.8-2.5 1.8-1.1 0-2-.5-2.4-1.4"
        stroke="currentColor"
        strokeWidth={Math.max(1.4, strokeWidth - 0.4)}
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Lock({ size = 19, strokeWidth = 1.6, className }: IconProps) {
  return (
    <svg {...base(size, "0 0 20 20")} className={className}>
      <path
        d="M6 8.5V6a4 4 0 0 1 8 0v2.5M5.5 8.5h9c.9 0 1.5.6 1.5 1.5v5c0 .9-.6 1.5-1.5 1.5h-9c-.9 0-1.5-.6-1.5-1.5v-5c0-.9.6-1.5 1.5-1.5Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Shield({ size = 15, strokeWidth = 1.3, className }: IconProps) {
  return (
    <svg {...base(size, "0 0 16 16")} className={className}>
      <path
        d="M8.6 13.7C10 13.1 13.3 11.1 13.3 6.7V4.1C13.3 3.3 13.3 3 13.1 2.7C13 2.4 12.8 2.2 12.6 2.1C12.3 2 11.9 2 11.2 2H4.8C4 2 3.6 2 3.3 2.1C3.1 2.2 2.9 2.4 2.8 2.7C2.6 3 2.6 3.3 2.6 4.1V6.7C2.6 11.1 5.9 13.1 7.3 13.7C7.5 13.8 7.6 13.8 7.7 13.8C7.8 13.9 8.1 13.9 8.2 13.8C8.3 13.8 8.4 13.8 8.6 13.7Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Eye({ size = 16, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth={strokeWidth} />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  )
}

export function Copy({ size = 14, strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M9 9V6.2c0-.6.3-.9.9-.9H17c.6 0 .9.3.9.9V13c0 .6-.3.9-.9.9h-2M9 9H6.2c-.6 0-.9.3-.9.9V17c0 .6.3.9.9.9H13c.6 0 .9-.3.9-.9V15"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function WarningTriangle({ size = 15, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path
        d="M12 9v4m0 4h.01M10.3 3.9 2.4 17.4c-.5.9.1 2.1 1.2 2.1h16.8c1.1 0 1.7-1.2 1.2-2.1L13.7 3.9c-.5-1-1.9-1-2.4 0Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MenuIcon({ size = 18, strokeWidth = 2, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  )
}
