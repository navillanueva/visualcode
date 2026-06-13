import { TextAttributes } from "@opentui/core"
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import open from "open"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { adStore, type AdState } from "../kickback/ad-store"
import { buildRevenueView, withBackendEarnings, fetchBackendEarnings, getDemoPrivateBalance } from "../kickback/revenue"
import { getClient } from "../kickback/backend"
import type { Earnings } from "@kickback-ai/providers"

// Kickback AI — developer revenue view (`/me`, Task 5).
//
// A self-contained overlay dialog (mirrors DialogStatus) so it needs ZERO changes
// to TUI navigation/routing. Shows the developer's served ad, impressions, clicks,
// accrued earnings, and settled private balance, read from the ad-store + the mock
// providers via buildRevenueView(). DISPLAY-ONLY: never enters the LLM context, no
// live calls (the mock PrivacyProvider is in-memory).

export type DialogMeProps = {}

export function DialogMe() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const [state, setState] = createSignal<AdState>(adStore.getState())
  const [privateBalance, setPrivateBalance] = createSignal(0n)
  const [backendEarnings, setBackendEarnings] = createSignal<Earnings | undefined>(undefined)

  onMount(() => {
    const unsubscribe = adStore.subscribe(setState)
    onCleanup(unsubscribe)
    // Prefer the backend's earnings when a Visual Code connection is configured;
    // fall back to the mock-derived view (offline, no live call) otherwise. Both
    // paths are best-effort — a failure leaves the mock view in place.
    fetchBackendEarnings(getClient())
      .then(setBackendEarnings)
      .catch(() => {})
    getDemoPrivateBalance()
      .then(setPrivateBalance)
      .catch(() => {})
  })

  const view = createMemo(() => {
    const base = buildRevenueView(state(), privateBalance())
    const earnings = backendEarnings()
    return earnings ? withBackendEarnings(base, earnings) : base
  })

  function openAd(url: string) {
    adStore.recordClick()
    open(url).catch(() => {})
  }

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Kickback — Developer Revenue
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>

      {/* Served ad */}
      <Show
        when={view().hasAd}
        fallback={<text fg={theme.textMuted}>No ad is currently served in your status line.</text>}
      >
        <box>
          <text fg={theme.text}>Your ad</text>
          <box flexDirection="row" gap={1}>
            <text flexShrink={0} fg={theme.accent}>
              ◆
            </text>
            <text fg={theme.text} wrapMode="word">
              <b>{view().advertiser}</b> <span style={{ fg: theme.textMuted }}>{view().adText}</span>
            </text>
            <text flexShrink={0} fg={theme.accent} onMouseUp={() => openAd(view().adUrl)}>
              ↗
            </text>
          </box>
        </box>
      </Show>

      {/* Counters */}
      <box>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>Impressions</text>
          <text fg={theme.text}>{view().impressions.toString()}</text>
        </box>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>Clicks</text>
          <text fg={theme.text}>{view().clicks.toString()}</text>
        </box>
      </box>

      {/* Money */}
      <box>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>Accrued earnings (50% share)</text>
          <text fg={theme.success} attributes={TextAttributes.BOLD}>
            {view().earningsUsdc} USDC
          </text>
        </box>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>{view().source === "backend" ? "Settled balance" : "Private balance (Unlink)"}</text>
          <text fg={theme.text}>{view().privateBalanceUsdc} USDC</text>
        </box>
        <Show when={view().source === "backend" && view().walletAddress}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={theme.textMuted}>Wallet</text>
            <text fg={theme.text}>{view().walletAddress}</text>
          </box>
        </Show>
      </box>

      {/* Consent + provenance */}
      <box flexDirection="row" gap={1}>
        <text
          flexShrink={0}
          style={{ fg: view().enabled ? theme.success : theme.textMuted }}
        >
          •
        </text>
        <text fg={theme.textMuted} wrapMode="word">
          {view().enabled ? "Ad slot enabled" : "Ad slot disabled"} · display-only ·{" "}
          {view().source === "backend"
            ? "earnings from Visual Code backend · settle privately via Unlink"
            : "mock providers · earnings settle as private Unlink payouts"}
        </text>
      </box>
    </box>
  )
}
