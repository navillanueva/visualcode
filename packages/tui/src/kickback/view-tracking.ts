// Kickback AI — view tracking (Task 3).
//
// Counts 5-second impressions for the rendered ad. A counted impression = the ad slot
// stayed live for one full interval. The fixed interval IS the debounce: at most one
// impression per window, so we never over-count a busy render loop.
//
// The store's recordImpression() already no-ops when consent is off or the slot is
// empty, so the tracker stays dumb — it just ticks. Timers are injectable so the
// behavior is unit-testable without real wall-clock waits.
//
// TODO(human): for production fidelity, gate ticks on terminal focus/visibility (don't
// accrue while the terminal is backgrounded). MVP counts whenever the slot is mounted.

import type { AdStore } from "./ad-store"

/** Reference economic model: 1 impression = 5 seconds of exposure. */
export const IMPRESSION_INTERVAL_MS = 5000

type IntervalHandle = ReturnType<typeof setInterval>

/** Injectable timer surface (defaults to the global timers). */
export interface ViewTrackingTimers {
  setInterval(callback: () => void, ms: number): IntervalHandle
  clearInterval(handle: IntervalHandle): void
}

export interface ViewTrackingOptions {
  /** Milliseconds per counted impression. Defaults to IMPRESSION_INTERVAL_MS (5s). */
  intervalMs?: number
  /** Override the timers (tests inject a fake clock). */
  timers?: ViewTrackingTimers
  /**
   * Called after each counted impression, with the ad's id (so the wiring layer can
   * batch + report to the backend). No-op when omitted — the offline mock path never
   * sets this, so unconfigured behavior is unchanged. Errors thrown here are ignored
   * (display-only tracking must never break on a reporting failure).
   */
  onImpression?: (adId: string) => void
}

const defaultTimers: ViewTrackingTimers = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle),
}

/**
 * Start counting impressions into `store`. Returns a stop function that clears the
 * interval; calling it more than once is safe.
 *
 * When `onImpression` is supplied it fires once per *counted* impression with the
 * served ad's id — the store no-ops impressions when consent is off or the slot is
 * empty, so we only report when the count actually advanced.
 */
export function startViewTracking(
  store: Pick<AdStore, "recordImpression" | "getState">,
  options: ViewTrackingOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? IMPRESSION_INTERVAL_MS
  const timers = options.timers ?? defaultTimers
  const onImpression = options.onImpression

  function tick() {
    const before = store.getState().impressions
    store.recordImpression()
    if (!onImpression) return
    const after = store.getState()
    // Only report when an impression actually counted (count advanced + an ad is set).
    if (after.impressions <= before || !after.ad) return
    try {
      onImpression(after.ad.id)
    } catch {}
  }

  const handle = timers.setInterval(tick, intervalMs)

  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    timers.clearInterval(handle)
  }
}
