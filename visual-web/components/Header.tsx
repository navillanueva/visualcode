"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { Logo } from "@/components/BlurbMark"
import { MenuIcon } from "@/components/Icons"

// Nav maps the prototype's in-page switcher onto real routes.
const NAV = [
  { href: "/", label: "Landing" },
  { href: "/brand", label: "Brand" },
  { href: "/advertise", label: "Advertise" },
  { href: "/wallet", label: "Wallet" },
  { href: "/me", label: "Earnings" },
  { href: "/terminal", label: "Terminal" },
] as const

export function Header() {
  const pathname = usePathname()
  const { setShowAuthFlow } = useDynamicContext()
  const [open, setOpen] = useState(false)

  // Close the mobile menu on route change.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="logo" aria-label="BlurbCode home">
          <Logo />
        </Link>

        <nav className="main-nav" data-open={open}>
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link${active ? " nav-link--active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="header-right">
          <span className="pill pill--arc">
            <span className="dot-green" />
            Arc · private
          </span>
          <button className="btn btn--ink btn--sign" onClick={() => setShowAuthFlow(true)}>
            Sign in
          </button>
          <button
            className="nav-toggle"
            aria-label="Toggle navigation"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <MenuIcon />
          </button>
        </div>
      </div>
    </header>
  )
}
