'use client'

import { useState } from 'react'
import { Button } from '@heroui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons'
import { useRouter } from 'next/navigation'
import { useAppKitAccount, useAppKit } from '@reown/appkit/react'
import Image from 'next/image'
import SearchBar from './SearchBar'

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

        <div className="max-w-[800px] w-full mb-4">
          <SearchBar
            value={query}
            onChange={setQuery}
            onSearch={handleSearch}
            placeholder="Ask about a politician..."
            size="lg"
          />
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
