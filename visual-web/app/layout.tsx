import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import { Providers } from "./providers"
import { Header } from "@/components/Header"

// Bundled fonts from the design handoff. Inter (variable, 100–900) is the sans;
// mono.ttf ("BlurbMono") is the mono used for code, numbers, addresses, eyebrows.
const inter = localFont({
  src: "./fonts/Inter-VariableFont_opsz_wght.ttf",
  variable: "--font-sans",
  weight: "100 900",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "sans-serif"],
})

const mono = localFont({
  src: "./fonts/BlurbMono.ttf",
  variable: "--font-mono",
  weight: "100 800",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
})

export const metadata: Metadata = {
  title: "BlurbCode — your terminal agent, now an income stream",
  description:
    "BlurbCode codes alongside you in the terminal. While the agent works, it shows one tasteful sponsored blurb in the status line — and you keep half of every impression. Paid out privately in USDC on Arc.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  )
}
