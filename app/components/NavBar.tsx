'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
// Import cleanly removed
import { useWalletSync } from '@/hooks/useWalletSync'
import ConnectButton from './ConnectButton'
import ClaimButton from './ClaimButton'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGlobe, faChevronDown } from '@fortawesome/free-solid-svg-icons'

// (Custom inline icons have been removed in favor of FontAwesome)

interface NavBarProps {
  showWallet?: boolean
  showFreeTier?: boolean
}

export default function NavBar({ showWallet = false, showFreeTier = false }: NavBarProps) {
  const pathname = usePathname()

  // Sync wallet state for extensions
  useWalletSync()

  const navLinks = [
    { href: '/', label: 'Search' },
    { href: '/about', label: 'About' },
    { href: '/pricing', label: 'Pricing' },
  ]

  return (
    <header className="bg-[var(--landing-bg-white)] border-b border-[var(--landing-border)] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-[72px] flex items-center justify-between">
        {/* Logo & Nav */}
        <div className="flex items-center gap-12">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--landing-primary)] to-[var(--landing-primary-dark)] flex items-center justify-center">
              <FontAwesomeIcon icon={faGlobe} className="w-5 h-5 text-[var(--landing-bg-white)]" />
            </div>
            <span className="text-[20px] font-semibold text-[var(--landing-text-primary)]">
              Indelible.
            </span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-[14px] font-medium transition-colors ${pathname === link.href
                  ? 'text-[var(--landing-primary)]'
                  : 'text-[var(--landing-text-secondary)] hover:text-[var(--landing-text-primary)]'
                  }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* User Area */}
        <div className="flex items-center gap-3">
          {/* Free Tier Badge */}
          {showFreeTier && (
            <div className="hidden sm:flex items-center gap-3 h-10 px-4 py-2 bg-[var(--landing-bg-light)] border border-[var(--landing-border)] rounded-full">
              <span className="w-2 h-2 bg-[var(--landing-success)] rounded-full" />
              <span className="text-[14px] font-medium text-[var(--landing-text-secondary)]">Free Tier:</span>
              <span className="text-[14px] font-semibold text-[var(--landing-text-primary)]">2/3 left</span>
              <FontAwesomeIcon icon={faChevronDown} className="w-3.5 h-3.5 text-[var(--landing-text-secondary)]" />
            </div>
          )}

          {/* Wallet Connect */}
          {showWallet && (
            <ConnectButton text="Sign in" />
          )}
        </div>
      </div>
    </header>
  )
}
