// Trivial ascending auction (pure). The highest-bidding active campaign that still
// has budget wins the status-line slot. When several campaigns TIE at the top bid —
// the fixed-price case, where every campaign bids the same $10/1,000 — a round-robin
// `cursor` cycles through the tied ads so repeated /api/ad/serve calls rotate the
// branded inventory instead of always serving the earliest-created one. Returns the
// ad to serve or `null` when the slot has no eligible winner.

import type { BaseUnits } from "@kickback/money"

export interface AuctionCandidate {
  id: string
  advertiser: string
  text: string
  url: string
  bidBaseUnits: BaseUnits
  budgetRemaining: BaseUnits
  status: string
  /** Tie-breaker — earlier wins. Accepts a Date or epoch ms. */
  createdAt: Date | number
}

/** The CONTRACT shape returned by GET /api/ad/serve. */
export interface ServedAd {
  id: string
  advertiser: string
  text: string
  url: string
}

function ms(t: Date | number): number {
  return typeof t === "number" ? t : t.getTime()
}

function toServed(c: AuctionCandidate): ServedAd {
  return { id: c.id, advertiser: c.advertiser, text: c.text, url: c.url }
}

/**
 * Eligible campaigns (active, funded, still bidding) ordered by descending bid then
 * earliest-created. The first element is the auction winner; every element sharing
 * its bid is a top-bid tie.
 */
function eligibleSorted(candidates: AuctionCandidate[]): AuctionCandidate[] {
  return candidates
    .filter((c) => c.status === "active" && c.budgetRemaining > 0n && c.bidBaseUnits > 0n)
    .sort((a, b) => {
      if (a.bidBaseUnits !== b.bidBaseUnits) return a.bidBaseUnits > b.bidBaseUnits ? -1 : 1
      return ms(a.createdAt) - ms(b.createdAt)
    })
}

/**
 * Pick a rotating winner among the highest-bidding eligible campaigns. The top bid
 * still wins; when several campaigns share that bid (the fixed-price case — every
 * campaign bids the same $10/1,000), `cursor` round-robins through them in
 * earliest-created order so repeated calls cycle the tied ads instead of always
 * serving the same one. Returns the ad to serve, or `null` when none is eligible.
 */
export function selectRotating(candidates: AuctionCandidate[], cursor: number): ServedAd | null {
  const eligible = eligibleSorted(candidates)
  const top = eligible[0]
  if (!top) return null
  const ties = eligible.filter((c) => c.bidBaseUnits === top.bidBaseUnits)
  // Modulo with the length-correction handles any integer cursor (incl. negatives).
  const index = ((cursor % ties.length) + ties.length) % ties.length
  const winner = ties[index]
  return winner ? toServed(winner) : null
}
