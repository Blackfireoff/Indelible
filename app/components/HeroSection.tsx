'use client'

import { useState } from 'react'
import { Button } from '@heroui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useRouter } from 'next/navigation'
import { useAppKitAccount, useAppKit } from '@reown/appkit/react'
import Image from 'next/image'

const suggestions = [
  "Biden on climate change",
  "Trudeau healthcare policy",
  "Merkel economic views",
]

// Icon component
// (Custom inline icons have been removed in favor of FontAwesome)

export default function HeroSection() {
  const [query, setQuery] = useState('')
  const router = useRouter()

  const { isConnected } = useAppKitAccount()
  const { open } = useAppKit()

  const handleSearch = () => {
    if (!isConnected) {
      open()
      return
    }
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (!isConnected) {
        open()
        return
      }
      if (query.trim()) {
        router.push(`/search?q=${encodeURIComponent(query)}`)
      }
    }
  }

  return (
    <div className="bg-[var(--landing-bg)] flex flex-col items-center justify-center pb-[340px] pt-[260px]">
      <div className="w-full px-6 flex flex-col items-center">
        {/* Heading */}
        <div className="mb-8 flex justify-center">
          <Image
            src="/logo/med.svg"
            alt="Indelible Logo"
            width={300}
            height={60}
            className="h-28 w-auto object-contain"
            priority
          />
        </div>

        {/* Subheading */}
        <div className="mb-8 max-w-[700px] text-center">
          <p className="text-[18px] leading-[28px] text-center text-[var(--landing-text-secondary)]">
            Get instant insights into what politicians say about key topics. Search by name and topic to explore their positions.
          </p>
        </div>

        {/* Search Input */}
        <div className="max-w-[800px] w-full bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-2xl shadow-[0px_10px_15px_0px_rgba(0,0,0,0.1),0px_4px_6px_0px_rgba(0,0,0,0.1)] h-16 flex items-center px-6 gap-4 mb-4">
          <button
            onClick={() => setQuery('')}
            className="group relative w-10 h-10 flex items-center justify-center shrink-0 cursor-pointer"
            type="button"
            aria-label="Clear search"
          >
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="w-5 h-5 text-[var(--landing-text-secondary)] transition-all duration-200 group-hover:opacity-0 group-hover:rotate-90 group-hover:scale-75"
            />
            <FontAwesomeIcon
              icon={faXmark}
              className="w-5 h-5 text-[var(--landing-text-secondary)] absolute transition-all duration-200 opacity-0 -rotate-90 scale-75 group-hover:opacity-100 group-hover:rotate-0 group-hover:scale-100"
            />
          </button>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about a politician..."
            className="flex-1 bg-transparent text-[16px] text-[var(--landing-text-primary)] placeholder:text-[var(--landing-text-muted)] outline-none"
          />
          <Button
            onPress={handleSearch}
            className="bg-[var(--landing-primary-darker)] text-[var(--landing-bg-white)] hover:bg-[var(--landing-primary-dark)] font-medium h-12 rounded-xl px-6 cursor-pointer"
          >
            Search
          </Button>
        </div>

        {/* Suggestions */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <span className="text-[14px] text-[var(--landing-text-secondary)]">Try:</span>
          {suggestions.map((suggestion, index) => (
            <Button
              key={index}
              variant="outline"
              onPress={() => setQuery(suggestion)}
              className="h-8 px-4 rounded-full border hover:border-[var(--accent-color)] border-[var(--landing-border)] text-[14px] font-medium text-[var(--landing-primary)] bg-[var(--landing-bg-white)] cursor-pointer"
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
