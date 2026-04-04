'use client'

import { Button } from '@heroui/react'
import { AppKitButton } from '@reown/appkit/react'
import { useWalletSync } from '@/hooks/useWalletSync'

// Quote data from Figma
const quotes = [
  {
    text: "We must address climate change as the existential threat of our time. The science is clear, and we cannot afford to delay action any longer.",
    author: "Emmanuel Macron",
    initials: "EM",
    source: "UN Climate Summit Speech",
    date: "November 15, 2023",
  },
  {
    text: "International cooperation on environmental policy is not just a choice, it's a necessity for our planet's survival.",
    author: "Emmanuel Macron",
    initials: "EM",
    source: "European Parliament Address",
    date: "September 8, 2023",
  },
  {
    text: "France will continue to lead by example in implementing green technologies and sustainable practices across all sectors.",
    author: "Emmanuel Macron",
    initials: "EM",
    source: "Paris Economic Forum",
    date: "June 22, 2023",
  },
  {
    text: "Global affairs require multilateral solutions. No nation can tackle these challenges alone.",
    author: "Emmanuel Macron",
    initials: "EM",
    source: "G7 Summit Press Conference",
    date: "May 3, 2023",
  },
]

// Icon components
function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function StarIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path d="M8 1.333l1.84 3.727 4.16.6-3 2.92.72 4.153L8 9.778l-3.72 1.955.72-4.153-3-2.92 4.16-.6L8 1.333z" fill="currentColor" />
    </svg>
  )
}

function FileTextIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path d="M9 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V6L9 1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 1v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10h6M5 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1 7h14M5 1v4M11 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ChevronDownIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GlobeIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 10h16M10 2c-2.5 2.5-4 5.5-4 8s1.5 5.5 4 8c2.5-2.5 4-5.5 4-8s-1.5-5.5-4-8z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function UserIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.333" r="3.333" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.667 14c0-2.947 2.347-5.333 5.333-5.333s5.333 2.386 5.333 5.333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ExternalLinkIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path d="M12 9.333v2.667a1.333 1.333 0 01-1.333 1.333H3.333A1.333 1.333 0 012 12V5.333A1.333 1.333 0 013.333 4h2.667M9.333 2h4.667v4.667M14 2L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function LandingPage() {
  // Sync wallet state to localStorage for extension access
  useWalletSync()

  return (
    <div className="min-h-screen bg-[var(--landing-bg)]">
      {/* Header */}
      <header className="bg-[var(--landing-bg-white)] border-b border-[var(--landing-border)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-[72px] flex items-center justify-between">
          {/* Logo & Nav */}
          <div className="flex items-center gap-12">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--landing-primary)] to-[var(--landing-primary-dark)] flex items-center justify-center">
                <GlobeIcon className="w-5 h-5 text-[var(--landing-bg-white)]" />
              </div>
              <span className="text-[20px] font-semibold text-[var(--landing-text-primary)]">
                Political Speech Analyzer
              </span>
            </div>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <a href="#" className="text-[14px] font-medium text-[var(--landing-primary)]">
                Search
              </a>
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

            {/* Wallet Connect */}
            <AppKitButton
              balance="show"
              className="h-10 px-4 rounded-full border border-[#e4e4e7] text-[14px] font-medium bg-white"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {/* Hero Section */}
        <HeroSection />

        {/* AI Summary Card */}
        <div className="relative mb-8 p-6 rounded-2xl border border-[var(--landing-primary-light)] shadow-sm overflow-hidden"
          style={{
            background: 'linear-gradient(167.8deg, var(--landing-primary-subtle) 0%, rgba(3, 105, 209, 0.05) 100%)'
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--landing-primary)] to-[var(--landing-primary-dark)] flex items-center justify-center shrink-0">
              <StarIcon className="w-4 h-4 text-[var(--landing-bg-white)]" />
            </div>
            <div>
              <h3 className="text-[18px] font-semibold text-[var(--landing-text-primary)]">AI Summary</h3>
              <p className="text-[14px] text-[var(--landing-text-secondary)]">Generated from 4 verified sources</p>
            </div>
          </div>
          <p className="text-[16px] leading-[26px] text-[var(--landing-text-primary)] pl-11">
            Emmanuel Macron has consistently emphasized the importance of multilateral cooperation in addressing global challenges. His speeches highlight climate change as a critical priority, advocating for international collaboration on environmental policies. Macron positions France as a leader in sustainable development and green technology implementation, while stressing that global affairs require collective action rather than unilateral approaches.
          </p>
        </div>

        {/* Source Documents Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-[20px] font-semibold text-[var(--landing-text-primary)]">Source Documents</h2>
            <p className="text-[14px] text-[var(--landing-text-secondary)]">Found 4 relevant quotes</p>
          </div>
        </div>

        {/* Quote Cards */}
        <div className="flex flex-col gap-5">
          {quotes.map((quote, index) => (
            <div
              key={index}
              className="bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-xl shadow-sm p-6"
            >
              {/* Quote */}
              <div className="relative mb-4">
                <span className="absolute -left-1 -top-2 text-[36px] text-[var(--landing-quote-mark)] font-normal">"</span>
                <p className="text-[16px] leading-[26px] text-[var(--landing-text-primary)] pl-5">
                  {quote.text}
                </p>
              </div>

              {/* Author & Source */}
              <div className="flex items-start justify-between pt-4 border-t border-[var(--landing-border)]">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--landing-primary)] to-[var(--landing-primary-dark)] flex items-center justify-center">
                      <span className="text-[14px] font-semibold text-[var(--landing-bg-white)]">{quote.initials}</span>
                    </div>
                    <span className="text-[14px] font-semibold text-[var(--landing-text-primary)]">{quote.author}</span>
                  </div>
                  <div className="flex items-center gap-4 pl-10">
                    <div className="flex items-center gap-1.5">
                      <FileTextIcon className="w-3.5 h-3.5 text-[var(--landing-text-secondary)]" />
                      <span className="text-[14px] text-[var(--landing-text-secondary)]">{quote.source}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CalendarIcon className="w-3.5 h-3.5 text-[var(--landing-text-secondary)]" />
                      <span className="text-[14px] text-[var(--landing-text-secondary)]">{quote.date}</span>
                    </div>
                  </div>
                </div>

                <Button
                  className="bg-[var(--landing-primary)] text-[var(--landing-bg-white)] font-medium h-11 rounded-xl px-5 flex gap-2"
                >
                  Read Original Document
                  <ExternalLinkIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-[var(--landing-bg-white)] border-t border-[var(--landing-border)] py-4">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-center gap-8">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-[var(--landing-primary)] rounded-full" />
              <span className="text-[14px] text-[var(--landing-text-secondary)]">Powered by AI</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-[var(--landing-primary)] rounded-full" />
              <span className="text-[14px] text-[var(--landing-text-secondary)]">Real-time data</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-[var(--landing-primary)] rounded-full" />
              <span className="text-[14px] text-[var(--landing-text-secondary)]">Fact-checked</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
