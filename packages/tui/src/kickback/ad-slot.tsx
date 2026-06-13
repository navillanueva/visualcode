import { createSignal, onCleanup, onMount, Show } from "solid-js"
import open from "open"
import { useTheme } from "../context/theme"
import { adStore, type AdState } from "./ad-store"
import { startViewTracking } from "./view-tracking"
import { reportImpression } from "./backend"

// Kickback AI — status-line ad renderer (Task 3).
//
// Reads the ad-store singleton and renders the auction-winning ad (text + clickable
// link) into the status line. Display-only: this is TUI render output, never injected
// into the LLM context. View tracking runs while the slot is mounted; consent off or
// an empty slot renders nothing.
//
// The link is inlined (mirroring ui/link.tsx) rather than reusing <Link> because a
// click must do TWO things here: record the click for earnings AND open the browser.

export function AdSlot() {
  const { theme } = useTheme()
  const [state, setState] = createSignal<AdState>(adStore.getState())

  onMount(() => {
    const unsubscribe = adStore.subscribe(setState)
    const stop = startViewTracking(adStore, { onImpression: reportImpression })
    onCleanup(() => {
      unsubscribe()
      stop()
    })
  })

  // Only render when consent is on AND an ad is present.
  const ad = () => (state().enabled ? state().ad : null)

  function onClickAd(url: string) {
    adStore.recordClick()
    open(url).catch(() => {})
  }

  return (
    <Show when={ad()}>
      {(current) => (
        <box flexDirection="row" gap={1} flexShrink={0}>
          <text fg={theme.accent}>◆</text>
          <text fg={theme.textMuted}>{current().text}</text>
          <text fg={theme.accent} onMouseUp={() => onClickAd(current().url)}>
            ↗
          </text>
        </box>
      )}
    </Show>
  )
}
