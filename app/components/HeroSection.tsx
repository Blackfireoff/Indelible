'use client'

import { useState } from 'react'
import { Button } from '@heroui/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const suggestions = [
  "Biden on climate change",
  "Trudeau healthcare policy",
  "Merkel economic views",
]

// Icon component
function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

function ChevronDownIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function GlobeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 10h16M10 2c-2.5 2.5-4 5.5-4 8s1.5 5.5 4 8c2.5-2.5 4-5.5 4-8s-1.5-5.5-4-8z" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function UserIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.333" r="3.333" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2.667 14c0-2.947 2.347-5.333 5.333-5.333s5.333 2.386 5.333 5.333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export default function HeroSection() {
  const [query, setQuery] = useState('')
  const router = useRouter()

  const handleSearch = () => {
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--landing-bg)]">
      {/* Header */}
      <header className="bg-[var(--landing-bg-white)] border-b border-[var(--landing-border)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-[72px] flex items-center justify-between">
          {/* Logo & Nav */}
          <div className="flex items-center gap-12">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--landing-primary)] to-[var(--landing-primary-dark)] flex items-center justify-center">
                <GlobeIcon className="w-5 h-5 text-[var(--landing-bg-white)]" />
              </div>
              <span className="text-[20px] font-semibold text-[var(--landing-text-primary)]">
                Political Speech Analyzer
              </span>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/" className="text-[14px] font-medium text-[var(--landing-primary)]">
                Search
              </Link>
              <a href="#" className="text-[14px] font-medium text-[var(--landing-text-secondary)] hover:text-[var(--landing-text-primary)] transition-colors">
                About
              </a>
              <a href="#" className="text-[14px] font-medium text-[var(--landing-text-secondary)] hover:text-[var(--landing-text-primary)] transition-colors">
                Pricing
              </a>
            </nav>
          </div>

          {/* User Area */}
          <div className="flex items-center gap-3">
            {/* Free Tier Badge */}
            <div className="hidden sm:flex items-center gap-3 h-10 px-4 py-2 bg-[var(--landing-bg-light)] border border-[var(--landing-border)] rounded-full">
              <span className="w-2 h-2 bg-[var(--landing-success)] rounded-full" />
              <span className="text-[14px] font-medium text-[var(--landing-text-secondary)]">Free Tier:</span>
              <span className="text-[14px] font-semibold text-[var(--landing-text-primary)]">2/3 left</span>
              <ChevronDownIcon className="w-4 h-4 text-[var(--landing-text-secondary)]" />
            </div>

            {/* Sign In */}
            <Button
              variant="outline"
              className="h-10 px-4 rounded-full border border-[var(--landing-border)] text-[14px] font-medium text-[var(--landing-text-primary)]"
            >
              <UserIcon className="w-4 h-4 mr-2" />
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Content */}
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
            <SearchIcon className="w-6 h-6 text-[var(--landing-text-secondary)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about a politician... e.g., What are Macron's thoughts on global affairs?"
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
    </div>
  )
}
