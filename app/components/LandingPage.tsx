'use client'

import { Button } from '@heroui/react'
import NavBar from './NavBar'
import HeroSection from './HeroSection'
import Footer from './Footer'

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

function ExternalLinkIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path d="M12 9.333v2.667a1.333 1.333 0 01-1.333 1.333H3.333A1.333 1.333 0 012 12V5.333A1.333 1.333 0 013.333 4h2.667M9.333 2h4.667v4.667M14 2L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--landing-bg)] flex flex-col">
      {/* NavBar with wallet and free tier */}
      <NavBar showWallet showFreeTier />

      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <HeroSection />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}
