// World ID proof verification for POST /api/me/verify-human (the personhood gate
// per plans/plan-5-world-id-personhood.md). The bounty requires the proof to be
// validated server-side; this module isolates that so the endpoint/version is a
// one-line, env-driven swap.
//
// The frontend runs the IDKit widget (the terminal has no DOM, so the proof is
// produced on the web) and posts the IDKit success payload. We forward it to the
// World cloud verify endpoint; a 200 means the zero-knowledge proof is valid for
// the (app, action). The constraint judges grade — nullifier-uniqueness — is then
// enforced in the DB (repo.bindWorldId). We never log the proof or merkle root.
//
// DEFAULT: classic v2 — POST `${verifyUrl}/api/v2/verify/${appId}` with a JSON
// body { nullifier_hash, merkle_root, proof, verification_level, action }.
// World ID 4.0 alternative is a one-line/env swap: set WORLD_ID_VERIFY_URL to
// `https://developer.world.org` and target `/api/v4/verify/{rp_id}` forwarding the
// payload as-is. The nullifier-uniqueness constraint is identical across versions.
//
// Verification is dependency-injected (`fetchImpl`) so tests can stub it with no
// network — mirrors how dynamic.ts injects its JWKS key.

export interface WorldIdVerifier {
  /** Verify the IDKit success payload; resolve to the bound nullifier hash, throw on failure. */
  verify(payload: unknown): Promise<{ nullifierHash: string }>
}

export interface WorldIdVerifierOptions {
  appId: string
  action: string
  /** Override the cloud verify base URL (the 4.0 ⟷ classic swap). */
  verifyUrl?: string
  /** Injected fetch — tests pass a stub; prod omits it (uses global fetch). */
  fetchImpl?: typeof fetch
}

const DEFAULT_VERIFY_BASE = "https://developer.worldcoin.org"

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined
}

/**
 * Build a verifier from options. `verify(payload)` forwards the IDKit success
 * payload to the World cloud verify endpoint; on HTTP 200 it returns the payload's
 * `nullifier_hash`, otherwise it throws an Error carrying the HTTP status (never
 * the proof). Pass `fetchImpl` in tests to avoid the network.
 */
export function createWorldIdVerifier(opts: WorldIdVerifierOptions): WorldIdVerifier {
  const base = opts.verifyUrl ?? DEFAULT_VERIFY_BASE
  const fetchImpl = opts.fetchImpl ?? fetch

  return {
    async verify(payload: unknown): Promise<{ nullifierHash: string }> {
      const p = (payload ?? {}) as Record<string, unknown>
      const nullifierHash = asString(p["nullifier_hash"])
      if (!nullifierHash) throw new Error("World ID payload is missing nullifier_hash")

      // Classic v2: forward the standard IDKit fields, with the action defaulting
      // to the server-configured one (one shared action ⇒ one account per human).
      const url = `${base}/api/v2/verify/${opts.appId}`
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nullifier_hash: nullifierHash,
          merkle_root: p["merkle_root"],
          proof: p["proof"],
          verification_level: p["verification_level"],
          action: asString(p["action"]) ?? opts.action,
        }),
      })
      // Surface the status only — never echo the proof or the response body, which
      // can contain proof material.
      if (res.status !== 200) throw new Error(`World ID verification failed (HTTP ${res.status})`)
      return { nullifierHash }
    },
  }
}
