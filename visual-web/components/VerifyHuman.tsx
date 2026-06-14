"use client"

import { useState } from "react"
import { IDKitWidget, type ISuccessResult } from "@worldcoin/idkit"
import { verifyHuman } from "@/lib/api"
import { Check, Shield, WarningTriangle } from "@/components/Icons"

// World ID app id + action come from the World Developer Portal
// (developer.worldcoin.org). Public values — they ship to the browser. The
// app_id is typed `app_${string}` by IDKit; the cast is safe because we only
// render the widget once a non-empty value is present (see `configured`).
const APP_ID = process.env.NEXT_PUBLIC_WORLD_ID_APP_ID ?? ""
// Must match the action registered in the World Developer Portal AND the backend's
// WORLD_ID_ACTION — the proof is bound to (app_id, action), so a mismatch fails verify.
const ACTION = process.env.NEXT_PUBLIC_WORLD_ID_ACTION ?? "blurbcode-account"

// Maps the backend's machine error codes to copy a human can act on. The 409
// "already_linked" is the anti-Sybil block (this World ID is bound elsewhere).
function messageFor(error: string | undefined): string {
  switch (error) {
    case "already_linked":
      return "This World ID is already linked to another account."
    case "worldid_not_configured":
      return "World ID isn't configured on the server yet. Try again later."
    case "verification_failed":
      return "We couldn't verify that proof. Please try again."
    default:
      return "Verification failed. Please try again."
  }
}

/**
 * Renders the World ID (IDKit) widget. On a successful proof its `handleVerify`
 * POSTs the payload to the backend (`verifyHuman`), which binds the nullifier to
 * the logged-in account. On success it calls `onVerified` so the parent can
 * refresh `me`; backend rejections (esp. 409 already_linked) surface as friendly
 * copy. If the app id is unset we render a disabled note rather than crash.
 *
 * @param copy   one-line prompt shown above the button (page-specific).
 * @param onVerified  called after the backend confirms the link (refresh `me`).
 */
export function VerifyHuman({ copy, onVerified }: { copy: string; onVerified: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const configured = APP_ID.length > 0

  if (!configured) {
    return (
      <div className="banner" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "inline-flex", flexShrink: 0, color: "var(--g-600)" }}>
          <WarningTriangle size={15} />
        </span>
        <span>Human verification is unavailable — World ID isn&apos;t configured for this site yet.</span>
      </div>
    )
  }

  // Runs after the World App returns a proof, before IDKit shows its success
  // screen. We forward the proof to the backend; throwing here makes IDKit show
  // an error instead of success, and we mirror the reason in our own banner.
  async function handleVerify(result: ISuccessResult) {
    setError(null)
    const res = await verifyHuman({
      proof: result.proof,
      merkle_root: result.merkle_root,
      nullifier_hash: result.nullifier_hash,
      verification_level: result.verification_level,
      // Forward the exact action the proof was generated for, so the backend verifies
      // against it instead of falling back to its own (which caused the 400).
      action: ACTION,
    })
    if (!res.ok) {
      const msg = messageFor(res.error)
      setError(msg)
      throw new Error(msg) // stop IDKit's success screen
    }
  }

  return (
    <div className="card card--18" style={{ padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ color: "var(--indigo)", display: "inline-flex" }}>
          <Shield size={18} strokeWidth={1.5} />
        </span>
        <h3 className="display" style={{ fontSize: 16, margin: 0 }}>
          Verify you&apos;re human
        </h3>
      </div>
      <p style={{ fontSize: 13.5, color: "var(--g-650)", margin: "0 0 16px", lineHeight: 1.5 }}>
        {copy} One human, one account — proven privately with World ID.
      </p>

      {error ? (
        <div className="banner banner--error" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ display: "inline-flex", flexShrink: 0 }}>
            <WarningTriangle size={15} />
          </span>
          <span>{error}</span>
        </div>
      ) : null}

      <IDKitWidget
        app_id={APP_ID as `app_${string}`}
        action={ACTION}
        handleVerify={handleVerify}
        onSuccess={onVerified}
        onError={(e) => setError(e?.code ? messageFor(undefined) : "Verification was cancelled or failed.")}
      >
        {({ open }) => (
          <button type="button" className="btn btn--ink btn--block btn--48" onClick={open}>
            <Check size={16} strokeWidth={2.4} /> Verify with World ID
          </button>
        )}
      </IDKitWidget>
    </div>
  )
}
