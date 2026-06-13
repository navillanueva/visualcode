// Kickback AI — ad-layer local state store (Task 3).
//
// Holds the auction-winning ad, the developer's accrued impressions/clicks, and the
// developer's accrued earnings. This is the "local state store the marketplace and
// settlement code can read" from the build plan: the TUI status-line renderer
// subscribes to it for display, and later the settlement provider
// (@kickback-ai/providers) reads the same snapshot to settle the 50% payout.
//
// DISPLAY-ONLY DISCIPLINE: nothing here is ever injected into the LLM context. The
// ad text lives in the TUI display layer only (see CLAUDE.md golden rule #4).
//
// Framework-agnostic on purpose — no SolidJS, no fs — so both the TUI (ad-slot.tsx)
// and the future SolidStart marketplace can subscribe to the same instance.

/** A status-line ad served from the marketplace auction. */
export interface Ad {
  /** Stable campaign id. */
  id: string
  /** Advertiser display name. */
  advertiser: string
  /** Ad copy shown in the status line. Display-only — never sent to the model. */
  text: string
  /** Click target opened in the default browser. */
  url: string
  /**
   * Advertiser's winning bid for ONE block, in USDC base units (6 dp). One block =
   * IMPRESSIONS_PER_BLOCK impressions, so the per-impression value derives from this.
   * Modelled as bigint so we never lose precision the way a float would.
   */
  blockBidBaseUnits: bigint
}

/** Economic model (from the kickbacks.ai reference — values only, no code reused). */
export const IMPRESSIONS_PER_BLOCK = 1000n
/** A click is worth this many impressions. */
export const CLICK_MULTIPLIER = 50n
/** Developer revenue share: 50% (numerator / denominator). */
export const DEV_SHARE_NUMERATOR = 1n
export const DEV_SHARE_DENOMINATOR = 2n

/**
 * Developer's accrued share for the given counters, in USDC base units.
 *
 * Derived (not stored) so the counters stay the single source of truth and the math
 * is auditable: weight impressions + clicks into impression-equivalents, scale by the
 * block bid, then take the 50% developer share. Integer division floors visibly — we
 * never silently round someone's money up.
 */
export function developerEarnings(ad: Ad | null, impressions: number, clicks: number): bigint {
  if (!ad || impressions < 0 || clicks < 0) return 0n
  const weighted = BigInt(impressions) + BigInt(clicks) * CLICK_MULTIPLIER
  const gross = (weighted * ad.blockBidBaseUnits) / IMPRESSIONS_PER_BLOCK
  return (gross * DEV_SHARE_NUMERATOR) / DEV_SHARE_DENOMINATOR
}

/** Immutable snapshot returned by `getState()` and handed to subscribers. */
export interface AdState {
  /** Consent / kill-switch. When false, nothing renders and nothing accrues. */
  enabled: boolean
  /** The current auction-winning ad, or null when the slot is empty. */
  ad: Ad | null
  /** Count of counted 5-second impressions for the current developer. */
  impressions: number
  /** Count of ad clicks. */
  clicks: number
  /** Developer's accrued share in USDC base units (6 dp). Derived from the counters. */
  developerEarningsBaseUnits: bigint
}

export interface AdStore {
  getState(): AdState
  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(listener: (state: AdState) => void): () => void
  /** Set (or clear) the current ad. Resets nothing — counters persist across ads. */
  setAd(ad: Ad | null): void
  /** Toggle consent on/off. Returns the new value. */
  toggleEnabled(): boolean
  /** Set consent explicitly. */
  setEnabled(enabled: boolean): void
  /** Count one impression. No-ops when disabled or no ad is set. */
  recordImpression(): void
  /** Count one click. No-ops when disabled or no ad is set. */
  recordClick(): void
  /** Reset counters (used on logout / demo reset). Keeps the ad + consent. */
  resetCounters(): void
}

export function createAdStore(initial?: Partial<Pick<AdState, "enabled" | "ad">>): AdStore {
  let enabled = initial?.enabled ?? true
  let ad: Ad | null = initial?.ad ?? null
  let impressions = 0
  let clicks = 0
  const listeners = new Set<(state: AdState) => void>()

  function getState(): AdState {
    return {
      enabled,
      ad,
      impressions,
      clicks,
      developerEarningsBaseUnits: developerEarnings(ad, impressions, clicks),
    }
  }

  function notify() {
    const snapshot = getState()
    for (const listener of listeners) listener(snapshot)
  }

  return {
    getState,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setAd(next) {
      ad = next
      notify()
    },
    toggleEnabled() {
      enabled = !enabled
      notify()
      return enabled
    },
    setEnabled(next) {
      if (enabled === next) return
      enabled = next
      notify()
    },
    recordImpression() {
      if (!enabled || !ad) return
      impressions += 1
      notify()
    },
    recordClick() {
      if (!enabled || !ad) return
      clicks += 1
      notify()
    },
    resetCounters() {
      impressions = 0
      clicks = 0
      notify()
    },
  }
}

/**
 * Sample ad so the slot renders something offline. Clearly a placeholder — `example.com`
 * and a fictional advertiser — NOT a fabricated real campaign. The marketplace auction
 * (deferred) and settlement providers replace this via `adStore.setAd(...)`.
 */
export const SAMPLE_AD: Ad = {
  id: "sample-001",
  advertiser: "Acme DevTools",
  text: "Acme CI — ship green builds 2x faster",
  url: "https://example.com/acme-ci",
  blockBidBaseUnits: 1_000_000n, // 1.000000 USDC per 1,000 impressions
}

/**
 * Process-wide ad store singleton. The TUI status line subscribes here; later the
 * marketplace + settlement code read the same instance. Seeded with SAMPLE_AD so the
 * slot is non-empty offline.
 */
export const adStore: AdStore = createAdStore({ enabled: true, ad: SAMPLE_AD })

/**
 * Backend-served ad shape (subset of @kickback-ai/providers' `ServedAd`). The
 * backend owns the auction economics, so a served ad carries no local bid — earnings
 * come from the backend's `/me/earnings`, not the local `developerEarnings` math.
 */
export interface ServedAdInput {
  id: string
  advertiser: string
  text: string
  url: string
}

/**
 * Map a backend-served ad into the local `Ad` shape. `blockBidBaseUnits` is 0 because
 * the backend is the source of truth for earnings when configured — the local
 * derivation is only meaningful in the offline mock path (SAMPLE_AD has a real bid).
 */
export function adFromServed(served: ServedAdInput): Ad {
  return {
    id: served.id,
    advertiser: served.advertiser,
    text: served.text,
    url: served.url,
    blockBidBaseUnits: 0n,
  }
}
