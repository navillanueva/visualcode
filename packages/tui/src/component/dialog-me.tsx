import { TextAttributes } from "@opentui/core"
import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import open from "open"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { adStore, type AdState } from "../kickback/ad-store"
import { buildRevenueView, fetchBackendEarnings } from "../kickback/revenue"
import { getClient, isConfigured } from "../kickback/backend"
import { resolveVisualcodeConnection } from "../kickback/config"
import type { Earnings } from "@kickback-ai/providers"

// Kickback AI — developer revenue view (`/me`, Task 5).
//
// A self-contained overlay dialog (mirrors DialogStatus) so it needs ZERO changes to
// TUI navigation/routing. Shows the developer's served ad, counted impressions, and
// the REAL accrued earnings read from the Visual Code backend (getEarnings). When no
// backend is configured it shows a clear "not connected" prompt — never a fabricated
// balance or ad. DISPLAY-ONLY: nothing here enters the LLM context.

export type DialogMeProps = {}

export function DialogMe() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const [state, setState] = createSignal<AdState>(adStore.getState())
  const [backendEarnings, setBackendEarnings] = createSignal<Earnings | undefined>(undefined)
  // The configured backend URL, used only to derive a verify link when the backend
  // didn't send one. Resolved best-effort in onMount; stays undefined when unconfigured.
  const [apiUrl, setApiUrl] = createSignal<string | undefined>(undefined)
  // Connection is resolved once at startup (backend.init) and again after /wallet
  // (backend.reconnect); the dialog is re-created each time it's opened, so reading it
  // here reflects the current state.
  const connected = isConfigured()

  onMount(() => {
    const unsubscribe = adStore.subscribe(setState)
    onCleanup(unsubscribe)
    // Earnings come from the backend when connected; best-effort — a failure leaves
    // the figures unloaded (rendered as "—") rather than faking a number.
    fetchBackendEarnings(getClient())
      .then(setBackendEarnings)
      .catch(() => {})
    // Resolve the backend URL for the verify-link fallback; best-effort, never throws.
    resolveVisualcodeConnection()
      .then((connection) => setApiUrl(connection?.apiUrl))
      .catch(() => {})
  })

  const view = createMemo(() => buildRevenueView(state(), connected, backendEarnings(), apiUrl()))
  // The personhood gate only fires once REAL earnings have loaded — never on the
  // unconfigured/mock path or before the fetch resolves — so the dialog behaves
  // exactly as today until the backend says the dev is connected-but-unverified.
  const gated = createMemo(() => view().hasEarnings && !view().worldIdVerified)

  function openAd(url: string) {
    adStore.recordClick()
    open(url).catch(() => {})
  }

  // Open the verify link without recording an ad click — it's a payout-gate action,
  // not an impression interaction.
  function openVerify(url: string) {
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

      <Show
        when={view().connected}
        fallback={
          <text fg={theme.textMuted} wrapMode="word">
            Not connected to Visual Code. Paste a device token with{" "}
            <span style={{ fg: theme.text }}>/wallet</span> to see your real earnings.
          </text>
        }
      >
        {/* Served ad */}
        <Show
          when={view().hasAd}
          fallback={<text fg={theme.textMuted}>No ad is currently served in your status line.</text>}
        >
          <box>
            <text fg={theme.text}>Your ad</text>
            <box flexDirection="row" gap={1}>
              <text flexShrink={0} fg="#6676b3">
                ›
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

        {/* Impressions */}
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.textMuted}>Impressions</text>
          <text fg={theme.text}>{view().hasEarnings ? view().impressions.toString() : "—"}</text>
        </box>

        {/* Money — gated behind World ID personhood (Plan 5). An unverified dev never
            sees a withdrawable number; impressions above stay visible so accrued value
            is still shown. The proof is produced on the web (no DOM here); the TUI only
            surfaces + enforces. */}
        <Show
          when={gated()}
          fallback={
            <box>
              <box flexDirection="row" justifyContent="space-between">
                <text fg={theme.textMuted}>Accrued earnings (50% share)</text>
                <Show when={view().hasEarnings} fallback={<text fg={theme.textMuted}>—</text>}>
                  <text fg={theme.success} attributes={TextAttributes.BOLD}>
                    {view().earningsUsdc} USDC
                  </text>
                </Show>
              </box>
              <Show when={view().walletAddress}>
                <box flexDirection="row" justifyContent="space-between">
                  <text fg={theme.textMuted}>Wallet</text>
                  <text fg={theme.text}>{view().walletAddress}</text>
                </box>
              </Show>
            </box>
          }
        >
          <box>
            <text fg={theme.warning} attributes={TextAttributes.BOLD} wrapMode="word">
              ⚠ Verify your humanity to receive payouts
            </text>
            <Show
              when={view().verifyUrl}
              fallback={
                <text fg={theme.textMuted} wrapMode="word">
                  Open the Visual Code web app → wallet page to verify.
                </text>
              }
            >
              <text fg={theme.textMuted} wrapMode="word" onMouseUp={() => openVerify(view().verifyUrl)}>
                Verify at {view().verifyUrl}
              </text>
            </Show>
          </box>
        </Show>

        {/* Consent + provenance */}
        <box flexDirection="row" gap={1}>
          <text flexShrink={0} style={{ fg: view().enabled ? theme.success : theme.textMuted }}>
            •
          </text>
          <text fg={theme.textMuted} wrapMode="word">
            {view().enabled ? "Ad slot enabled" : "Ad slot disabled"} · display-only · earnings from
            the Visual Code backend · settle privately via Unlink
          </text>
        </box>
      </Show>
    </box>
  )
}
