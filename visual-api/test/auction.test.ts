import { describe, expect, test } from "bun:test"
import { selectRotating, type AuctionCandidate } from "../src/auction"

function candidate(over: Partial<AuctionCandidate>): AuctionCandidate {
  return {
    id: "c1",
    advertiser: "Acme",
    text: "Buy widgets",
    url: "https://acme.test",
    bidBaseUnits: 1_000_000n,
    budgetRemaining: 5_000_000n,
    status: "active",
    createdAt: 1000,
    ...over,
  }
}

describe("selectRotating", () => {
  test("no candidates → null", () => {
    expect(selectRotating([], 0)).toBeNull()
  })

  test("ignores draft and budget-exhausted campaigns", () => {
    expect(selectRotating([candidate({ status: "draft" })], 0)).toBeNull()
    expect(selectRotating([candidate({ budgetRemaining: 0n })], 0)).toBeNull()
    expect(selectRotating([candidate({ bidBaseUnits: 0n })], 0)).toBeNull()
  })

  test("serves the single eligible campaign on every call", () => {
    const ad = selectRotating([candidate({ id: "only" })], 0)
    expect(ad).toEqual({ id: "only", advertiser: "Acme", text: "Buy widgets", url: "https://acme.test" })
    // Only one candidate → the cursor never changes the result.
    expect(selectRotating([candidate({ id: "only" })], 7)?.id).toBe("only")
  })

  test("the strictly-highest bid wins every call (no rotation away from it)", () => {
    const cs = [
      candidate({ id: "low", bidBaseUnits: 1_000_000n }),
      candidate({ id: "high", bidBaseUnits: 3_000_000n }),
      candidate({ id: "mid", bidBaseUnits: 2_000_000n }),
    ]
    expect(selectRotating(cs, 0)?.id).toBe("high")
    expect(selectRotating(cs, 1)?.id).toBe("high")
    expect(selectRotating(cs, 2)?.id).toBe("high")
  })

  test("round-robins through tied top-bids across calls (earliest-created order)", () => {
    // All three tie at the top bid → the cursor cycles them deterministically.
    const tied = [
      candidate({ id: "later", createdAt: 5000 }),
      candidate({ id: "earliest", createdAt: 1000 }),
      candidate({ id: "middle", createdAt: 3000 }),
    ]
    const order = [0, 1, 2, 3, 4, 5].map((cursor) => selectRotating(tied, cursor)?.id)
    expect(order).toEqual(["earliest", "middle", "later", "earliest", "middle", "later"])
  })

  test("rotates only among the tied top-bids, never the lower bid", () => {
    const cs = [
      candidate({ id: "topA", bidBaseUnits: 3_000_000n, createdAt: 1000 }),
      candidate({ id: "topB", bidBaseUnits: 3_000_000n, createdAt: 2000 }),
      candidate({ id: "loser", bidBaseUnits: 1_000_000n, createdAt: 500 }),
    ]
    const served = [0, 1, 2, 3].map((cursor) => selectRotating(cs, cursor)?.id)
    expect(served).toEqual(["topA", "topB", "topA", "topB"])
  })
})
