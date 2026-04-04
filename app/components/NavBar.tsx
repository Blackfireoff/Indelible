'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
// Import cleanly removed
import { useWalletSync } from '@/hooks/useWalletSync'
import ConnectButton from './ConnectButton'
import ClaimButton from './ClaimButton'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGlobe, faChevronDown } from '@fortawesome/free-solid-svg-icons'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'

// (Custom inline icons have been removed in favor of FontAwesome)

// TODO: Replace with the actual deployed INDL token contract address
const INDL_TOKEN_ADDRESS = '0x230c1F84e14E355760c158f94D42d6Ef81a4D35f' as `0x${string}`


interface NavBarProps {
  showWallet?: boolean
}

export default function NavBar({ showWallet = false }: NavBarProps) {
  const pathname = usePathname()
  const { address, isConnected } = useAccount()
  const { data: balanceData } = useReadContract({
    address: INDL_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
    }
  })

  // Sync wallet state for extensions
  useWalletSync()

  const navLinks = [
    { href: '/', label: 'Search' },
    { href: '/about', label: 'About' },
    { href: '/get-token', label: 'Get token' },
  ]

  return (
    <header className="bg-[var(--landing-bg-white)] border-b border-[var(--landing-border)] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-[72px] flex items-center justify-between">
        {/* Logo & Nav */}
        <div className="flex items-center gap-12">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <Image
              src="/logo/med.svg"
              alt="Indelible Logo"
              width={300}
              height={60}
              className="h-10 w-auto object-contain"
              priority
            />
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
          {/* INDL Balance Badge */}
          {isConnected && (() => {
            const indlCount = balanceData !== undefined ? Math.floor(Number(formatUnits(balanceData, 18))) : 0;
            return (
              <div className="hidden sm:flex items-center gap-3 h-10 px-4 py-2 bg-[var(--landing-bg-light)] border border-[var(--landing-border)] rounded-full">
                <span className={`w-2 h-2 rounded-full ${indlCount > 0 ? "bg-[var(--landing-success)]" : "bg-red-500"}`} />
                <span className="text-[14px] font-semibold text-[var(--landing-text-primary)]">
                  {indlCount} Requests
                </span>
              </div>
            );
          })()}

          {/* Wallet Connect */}
          {showWallet && (
            <ConnectButton text="Sign in" />
          )}
        </div>
      </div>
    </header>
  )
}
