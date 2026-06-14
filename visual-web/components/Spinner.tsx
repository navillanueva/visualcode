"use client"

import { useEffect, useState } from "react"

// Braille spinner — frames cycled every 90ms, per the handoff. Reused anywhere
// the agent is "working" (terminal status lines, live preview). Color is set by
// the parent class (e.g. .status-line__spin → indigo).
const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"

export function Spinner({ className }: { className?: string }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 90)
    return () => clearInterval(t)
  }, [])
  return (
    <span className={className} aria-hidden>
      {FRAMES[i]}
    </span>
  )
}
