import { onMount } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { useToast } from "../ui/toast"
import { useTheme } from "../context/theme"
import { DialogPrompt } from "../ui/dialog-prompt"
import * as KickbackBackend from "../kickback/backend"
import { VISUALCODE_PROVIDER_ID } from "../kickback/config"

// Kickback AI — Visual Code wallet connect (`/wallet`, Plan 1 Task 2).
//
// Mirrors OpenCode's own provider-connect flow (dialog-provider.tsx `ApiMethod`):
// collect the credential with <DialogPrompt>, then persist it with the SAME
// `sdk.client.auth.set(...)` mechanism (auth.json, mode 0600) — we DON'T invent
// storage. The Visual Code connection is stored under the `visualcode` auth key as
// an "api" credential whose `key` is the device token and whose `metadata` carries
// the backend `apiUrl` and an optional power-user `privateKey`.
//
// Sequential prompts (Railway URL → device token → optional private key) reuse
// DialogPrompt.show, exactly like the custom-provider flow's promptCustomProviderID.

const URL_RE = /^https?:\/\/.+/i

export function DialogWallet() {
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const { theme } = useTheme()

  async function promptApiUrl(): Promise<string | undefined> {
    const value = await DialogPrompt.show(dialog, "Connect Visual Code — backend URL", {
      placeholder: "https://your-app.up.railway.app",
      description: () => (
        <box gap={1}>
          <text fg={theme.textMuted}>
            Paste the Visual Code backend URL and the device token from the web app's wallet page.
          </text>
          <text fg={theme.text}>Step 1 of 2 — backend URL</text>
        </box>
      ),
    })
    if (value === null) return
    const trimmed = value.trim()
    if (URL_RE.test(trimmed)) return trimmed.replace(/\/+$/, "")
    toast.show({ variant: "error", message: "Enter a full http(s) URL, e.g. https://your-app.up.railway.app" })
    return promptApiUrl()
  }

  async function promptToken(): Promise<string | undefined> {
    const value = await DialogPrompt.show(dialog, "Connect Visual Code — device token", {
      placeholder: "Device token",
      description: () => (
        <box gap={1}>
          <text fg={theme.textMuted}>The device token issued in the Visual Code web app links this TUI to your account.</text>
          <text fg={theme.text}>Step 2 of 2 — device token</text>
        </box>
      ),
    })
    if (value === null) return
    const trimmed = value.trim()
    if (trimmed) return trimmed
    toast.show({ variant: "error", message: "A device token is required to connect." })
    return promptToken()
  }

  async function run() {
    const apiUrl = await promptApiUrl()
    if (!apiUrl) return dialog.clear()
    const token = await promptToken()
    if (!token) return dialog.clear()

    // Persist via OpenCode's own credential mechanism (auth.json). The device token
    // is the credential `key`; the backend URL rides in `metadata` (Record<string,
    // string>). A raw private key is intentionally NOT prompted here for the MVP — the
    // metadata field is reserved for the power-user path.
    const result = await sdk.client.auth.set({
      providerID: VISUALCODE_PROVIDER_ID,
      auth: {
        type: "api",
        key: token,
        metadata: { apiUrl },
      },
    })
    if (result.error) {
      toast.show({ variant: "error", message: "Failed to save Visual Code credential." })
      dialog.clear()
      return
    }

    // Re-resolve the client and swap the ad source to the backend-served ad.
    await KickbackBackend.reconnect()
    toast.show({
      variant: KickbackBackend.isConfigured() ? "success" : "info",
      message: KickbackBackend.isConfigured()
        ? "Visual Code connected — serving live ads."
        : "Saved Visual Code credential.",
    })
    dialog.clear()
  }

  onMount(() => {
    void run()
  })

  return <box />
}
