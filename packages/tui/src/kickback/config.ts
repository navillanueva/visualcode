// Kickback AI — TUI-side backend connection config (Plan 1, Task 2).
//
// Resolves the Visual Code backend connection from OpenCode's own credential store
// (auth.json) plus env, and builds a backend client from it. Returns `undefined`
// when nothing is configured — which is the graceful-degradation signal the ad
// surfaces use to keep the existing local-mock behavior (SAMPLE_AD + mock
// providers). Backend data is purely additive: NO config → exactly the old behavior.
//
// Storage mirrors OpenCode's `/connect` flow: the credential is written by the
// `/wallet` dialog via the SDK (`auth.set({ providerID: "visualcode", auth: { type:
// "api", key: <device-token>, metadata: { apiUrl, privateKey? } } })`) into the same
// `auth.json` (`~/.local/share/opencode/auth.json`, mode 0600). The SDK exposes no
// `auth.get`, so we read the file directly here — the same file the server writes.

import path from "path"
import fs from "fs/promises"
import { Global } from "@opencode-ai/core/global"
import { createKickbackClient, type KickbackClient } from "@kickback-ai/providers"

/** The auth.json key under which the Visual Code connection is stored. */
export const VISUALCODE_PROVIDER_ID = "visualcode"

/** Resolved connection: where the backend is + the device token to authenticate with. */
export interface VisualcodeConnection {
  apiUrl: string
  token: string
  /** Optional power-user raw private key (stored, not used by the TUI client). */
  privateKey?: string
}

function clean(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}

/**
 * Read the stored `visualcode` entry from auth.json. Returns the raw `{ key,
 * metadata }` Api-auth shape, or undefined when absent/unreadable. Never throws —
 * a missing or malformed file degrades to "not configured".
 */
async function readStoredEntry(): Promise<{ key?: string; metadata?: Record<string, string> } | undefined> {
  if (process.env.OPENCODE_AUTH_CONTENT) {
    try {
      const all = JSON.parse(process.env.OPENCODE_AUTH_CONTENT) as Record<string, unknown>
      const entry = all[VISUALCODE_PROVIDER_ID]
      if (entry && typeof entry === "object") return entry as { key?: string; metadata?: Record<string, string> }
    } catch {}
    return undefined
  }
  try {
    const file = path.join(Global.Path.data, "auth.json")
    const raw = await fs.readFile(file, "utf8")
    const all = JSON.parse(raw) as Record<string, unknown>
    const entry = all[VISUALCODE_PROVIDER_ID]
    if (entry && typeof entry === "object") return entry as { key?: string; metadata?: Record<string, string> }
  } catch {}
  return undefined
}

/**
 * Resolve the active Visual Code connection. Precedence:
 *   1. The stored `visualcode` auth.json entry (token = key, apiUrl = metadata).
 *   2. `VISUALCODE_API_URL` / `VISUALCODE_TOKEN` env (handy for CI/dev).
 * Both `apiUrl` and `token` must be present, else this returns `undefined` and the
 * TUI stays on the local mock. Never throws.
 */
export async function resolveVisualcodeConnection(env = process.env): Promise<VisualcodeConnection | undefined> {
  const entry = await readStoredEntry()
  const apiUrl = clean(entry?.metadata?.apiUrl) ?? clean(env.VISUALCODE_API_URL)
  const token = clean(entry?.key) ?? clean(env.VISUALCODE_TOKEN)
  if (!apiUrl || !token) return undefined
  const privateKey = clean(entry?.metadata?.privateKey)
  return privateKey ? { apiUrl, token, privateKey } : { apiUrl, token }
}

/**
 * Build a backend client if (and only if) a connection is configured; otherwise
 * `undefined` so callers fall back to the local mock. Never throws.
 */
export async function resolveKickbackClient(env = process.env): Promise<KickbackClient | undefined> {
  const connection = await resolveVisualcodeConnection(env)
  if (!connection) return undefined
  return createKickbackClient({ baseUrl: connection.apiUrl, token: connection.token })
}
