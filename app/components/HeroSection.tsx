'use client'

import { useState } from 'react'
import { Button } from '@heroui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { useRouter } from 'next/navigation'
import { useAppKitAccount, useAppKit } from '@reown/appkit/react'

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
      <div className="max-w-[768px] w-full px-6">
        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-[36px] font-semibold leading-[40px] text-center text-[var(--landing-text-primary)]">
            Analyze Political Speeches
          </h1>
        </div>

        {/* Subheading */}
        <div className="mb-8">
          <p className="text-[18px] leading-[28px] text-center text-[var(--landing-text-secondary)]">
            Get instant insights into what politicians say about key topics. Search by name and topic to explore their positions.
          </p>
        </div>

        {/* Search Input */}
        <div className="bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-2xl shadow-[0px_10px_15px_0px_rgba(0,0,0,0.1),0px_4px_6px_0px_rgba(0,0,0,0.1)] h-16 flex items-center px-6 gap-4 mb-4">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="w-5 h-5 text-[var(--landing-text-secondary)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about a politician..."
            className="flex-1 bg-transparent text-[16px] text-[var(--landing-text-secondary)] placeholder:text-[var(--landing-text-muted)] outline-none"
          />
          <Button
            onPress={handleSearch}
            className="bg-[var(--landing-primary)] text-[var(--landing-bg-white)] font-medium h-12 rounded-xl px-6"
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
              className="h-8 px-4 rounded-full border border-[var(--landing-border)] text-[14px] font-medium text-[var(--landing-primary)] bg-[var(--landing-bg-white)]"
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
