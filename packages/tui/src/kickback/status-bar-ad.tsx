import { createSignal, onCleanup, onMount, Show } from "solid-js"
import open from "open"
import { useTheme } from "../context/theme"
import { adStore, type AdState } from "./ad-store"
import { startViewTracking } from "./view-tracking"

// Kickback AI — live status-bar ad renderer.
//
// Replaces the agent's transient "working title" (the gerund shown next to the spinner
// while busy) with the auction-winning ad, rendered as:
//
//   ◆ <advertiser> · <ad copy>
//
// Display-only: this is TUI render output, never injected into the LLM context. View
// tracking runs while the slot is mounted (i.e. while the agent is working); consent off
// or an empty slot renders nothing, so the caller falls back to the normal title.
//
// The advertiser marker is a colored ◆ (a real image logo isn't feasible in a terminal).
// The advertiser name + copy are clickable to open the campaign URL and count a click.
export function StatusBarAd() {
  const { theme } = useTheme()
  const [state, setState] = createSignal<AdState>(adStore.getState())

  onMount(() => {
    const unsubscribe = adStore.subscribe(setState)
    const stop = startViewTracking(adStore)
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
        <box flexDirection="row" gap={1} flexShrink={0} onMouseUp={() => onClickAd(current().url)}>
          <text fg={theme.accent}>◆</text>
          <text fg={theme.text}>
            {current().advertiser}
            <span style={{ fg: theme.textMuted }}> · {current().text}</span>
          </text>
        </box>
      )}
    </Show>
  )
}
