// Kickback AI — backend wiring singleton (Plan 1, Tasks 3 + 4).
//
// One process-wide place that owns the resolved backend client and connects it to
// the ad surfaces:
//   - swaps the ad source (serveAd → adStore.setAd) on init (Task 3),
//   - batches + reports impressions (reportImpressions) (Task 4).
//
// GRACEFUL DEGRADATION: when no backend is configured `resolveKickbackClient`
// returns undefined, so `init()` leaves SAMPLE_AD in place and `reportImpression`
// is a no-op. Behavior with nothing configured is byte-for-byte the old local mock.
// Nothing here throws into the TUI — backend calls already return typed results.

import type { KickbackClient } from "@kickback-ai/providers"
import { adStore, adFromServed } from "./ad-store"
import { resolveKickbackClient } from "./config"

/** How many impressions to buffer before flushing a batch to the backend. */
const BATCH_FLUSH_SIZE = 5
/** Max time an impression waits before being flushed (ms). */
const BATCH_FLUSH_MS = 30_000

let client: KickbackClient | undefined
let initialized = false
let initializing: Promise<void> | undefined

// Pending impression counts keyed by ad id, plus a debounce timer.
const pending = new Map<string, number>()
let flushTimer: ReturnType<typeof setTimeout> | undefined

function totalPending(): number {
  let total = 0
  for (const count of pending.values()) total += count
  return total
}

/** Flush all buffered impressions to the backend. No-op when unconfigured/empty. */
async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = undefined
  }
  if (!client || pending.size === 0) return
  // Drain the buffer first so concurrent ticks accumulate into the next batch.
  const batch = [...pending.entries()]
  pending.clear()
  for (const [adId, count] of batch) {
    if (count <= 0) continue
    const result = await client.reportImpressions({ adId, count })
    // On failure, re-buffer so the count isn't lost; the next flush retries.
    if (!result.ok) pending.set(adId, (pending.get(adId) ?? 0) + count)
  }
}

/**
 * Resolve the client once and, if configured, swap the ad source to the
 * backend-served ad. Safe to call repeatedly — only the first call does work.
 * Leaves SAMPLE_AD untouched when unconfigured or when serveAd is unavailable.
 */
export async function init(resolve = resolveKickbackClient): Promise<void> {
  if (initialized) return
  if (initializing) return initializing
  initializing = (async () => {
    client = await resolve()
    initialized = true
    if (!client) return
    const result = await client.serveAd()
    // A successful non-null ad swaps the slot; null/unavailable keeps SAMPLE_AD so the
    // status line is never empty just because the auction had no winner yet.
    if (result.ok && result.ad) adStore.setAd(adFromServed(result.ad))
  })()
  await initializing
}

/**
 * Record one counted impression for an ad. Buffers and reports in batches when a
 * backend is configured; a no-op otherwise. Wired into view-tracking's onImpression.
 */
export function reportImpression(adId: string): void {
  if (!client) return
  pending.set(adId, (pending.get(adId) ?? 0) + 1)
  if (totalPending() >= BATCH_FLUSH_SIZE) {
    void flush()
    return
  }
  if (!flushTimer) flushTimer = setTimeout(() => void flush(), BATCH_FLUSH_MS)
}

/**
 * Re-resolve the client and re-run the ad swap. Called after `/wallet` saves a new
 * credential so the change takes effect without a restart.
 */
export async function reconnect(resolve = resolveKickbackClient): Promise<void> {
  initialized = false
  initializing = undefined
  client = undefined
  await init(resolve)
}

/** True once a backend client is resolved and configured. */
export function isConfigured(): boolean {
  return client !== undefined
}

/** The resolved client (or undefined when unconfigured). Read by `/me`. */
export function getClient(): KickbackClient | undefined {
  return client
}

/** Flush + reset (used by tests). */
export async function __flushForTest(): Promise<void> {
  await flush()
}

export function __resetForTest(): void {
  client = undefined
  initialized = false
  initializing = undefined
  pending.clear()
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = undefined
  }
}
