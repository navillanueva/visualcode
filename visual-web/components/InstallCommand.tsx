"use client"

import { useState } from "react"

const INSTALL_CMD = "curl -fsSL https://blurbcode.xyz/install | bash"

export function InstallCommand({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  async function copy() {
    setFailed(false)
    try {
      await navigator.clipboard.writeText(INSTALL_CMD)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API needs a secure context (https/localhost). Don't pretend it worked.
      setFailed(true)
    }
  }

  return (
    <div
      className="mono"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--term-body)",
        border: "1px solid var(--term-border)",
        borderRadius: 10,
        padding: compact ? "11px 12px 11px 14px" : "13px 13px 13px 18px",
        fontSize: compact ? 12.5 : 14,
        color: "var(--g-100)",
        width: "100%",
        maxWidth: compact ? "none" : 540,
        margin: compact ? 0 : "0 auto",
        textAlign: "left",
        overflow: "hidden",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, flex: "1 1 auto" }}>
        <span style={{ color: "var(--indigo)", flexShrink: 0 }}>$</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          curl -fsSL <span style={{ color: "var(--earn-text)" }}>https://blurbcode.xyz/install</span> | bash
        </span>
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy install command"
        style={{
          flexShrink: 0,
          appearance: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.01em",
          color: copied ? "var(--earn-text)" : "var(--g-100)",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid var(--term-border)",
          borderRadius: 7,
          padding: "6px 11px",
          whiteSpace: "nowrap",
        }}
      >
        {failed ? "Select to copy" : copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}
