'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
// Import cleanly removed
import { useWalletSync } from '@/hooks/useWalletSync'
import { Tooltip } from '@heroui/react'
import ConnectButton from './ConnectButton'
import { useAccount, useReadContract, useDisconnect } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons'

// (Custom inline icons have been removed in favor of FontAwesome)

// TODO: Replace with the actual deployed INDL token contract address
const INDL_TOKEN_ADDRESS = '0x230c1F84e14E355760c158f94D42d6Ef81a4D35f' as `0x${string}`


interface NavBarProps {
  showWallet?: boolean
}

export default function NavBar({ showWallet = false }: NavBarProps) {
  const pathname = usePathname()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
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
    { href: '/get-token', label: 'Get requests' },
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
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href === '/' && pathname === '/search')
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`group relative text-[14px] font-medium transition-colors pb-0.5 ${isActive
                    ? 'text-[var(--landing-primary)]'
                    : 'text-[var(--landing-text-secondary)] hover:text-[var(--landing-text-primary)]'
                    }`}
                >
                  {link.label}
                  <span
                    className={`absolute left-0 bottom-0 h-[3px] bg-[var(--accent-color)] transition-all duration-300 ease-out ${isActive ? 'w-full' : 'w-0 group-hover:w-full'
                      }`}
                  />
                </Link>
              )
            })}
          </nav>
        </div>

        {/* User Area */}
        <div className="flex items-center gap-3">
          {/* INDL Balance Badge */}
          {isConnected && (() => {
            const indlCount = balanceData !== undefined ? Math.floor(Number(formatUnits(balanceData, 18))) : 0;
            return (
              <div
                className="hidden sm:flex items-center gap-3 h-10 px-4 py-2 bg-[var(--landing-bg-light)] border border-[var(--landing-border)] rounded-full"
              >
                <span className={`w-2 h-2 rounded-full ${indlCount > 5 ? "bg-[var(--landing-success)]" : indlCount > 0 ? "bg-orange-500" : "bg-red-500"}`} />
                <span className="text-[14px] font-medium text-[var(--landing-text-primary)]">
                  {indlCount} Requests
                </span>
              </div>
            );
          })()}

          {/* Wallet Connect */}
          {showWallet && (
            <ConnectButton text="Sign in" />
          )}

          {/* Disconnect Button */}
          {isConnected && (
            <div className="relative flex items-center justify-center group/tooltip">
              <button
                onClick={() => disconnect()}
                className="h-10 w-10 flex items-center justify-center rounded-full border-[1.5px] border-[var(--landing-primary-darker)] hover:bg-[var(--landing-primary-dark)] hover:border-[var(--landing-primary-dark)] transition-all duration-200 cursor-pointer group relative"
                aria-label="Disconnect wallet"
              >
                <FontAwesomeIcon
                  icon={faRightFromBracket}
                  className="w-4 h-4 text-[var(--landing-primary-darker)] group-hover:text-white transition-colors duration-200"
                />
              </button>
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-[#1A1A1A] text-white text-[12px] font-medium rounded-lg opacity-0 invisible translate-y-1.5 scale-95 origin-top group-hover/tooltip:opacity-80 group-hover/tooltip:visible group-hover/tooltip:translate-y-0 group-hover/tooltip:scale-100 transition-all duration-300 ease-out whitespace-nowrap shadow-lg z-50 pointer-events-none">
                Disconnect
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
