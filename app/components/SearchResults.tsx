'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'
import { Button } from '@heroui/react'
import NavBar from './NavBar'
import Footer from './Footer'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar, faFileLines, faCalendarDays, faUpRightFromSquare, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'

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

// (Custom inline icons have been removed in favor of FontAwesome)

export default function SearchResults() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''
  const { isConnected, status } = useAppKitAccount()
  const router = useRouter()

  useEffect(() => {
    // Only redirect if we are certain they're not connected and not currently connecting
    if (status !== 'reconnecting' && status !== 'connecting' && !isConnected) {
      router.push('/')
    }
  }, [isConnected, status, router])

  if (!isConnected) {
    return null // avoid flash of unauthorized content
  }

  return (
    <div className="min-h-screen bg-[var(--landing-bg)] flex flex-col">
      {/* NavBar */}
      <NavBar showWallet showFreeTier />

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
        {/* Search Input */}
        <div className="relative mb-6">
          <div className="bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-xl shadow-sm h-14 flex items-center px-4 gap-3">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="w-5 h-5 text-[var(--landing-text-secondary)]" />
            <input
              type="text"
              defaultValue={query}
              placeholder="Search political speeches..."
              className="flex-1 bg-transparent text-[16px] text-[var(--landing-text-primary)] placeholder:text-[var(--landing-text-secondary)] outline-none"
            />
            <Button
              className="h-10 bg-[var(--landing-primary)] text-[var(--landing-bg-white)] font-medium rounded-xl px-6"
            >
              Search
            </Button>
          </div>
        </div>

        {/* AI Summary Card */}
        <div className="relative mb-8 p-6 rounded-2xl border border-[var(--landing-primary-light)] shadow-sm overflow-hidden"
          style={{
            background: 'linear-gradient(167.8deg, var(--landing-primary-subtle) 0%, rgba(3, 105, 209, 0.05) 100%)'
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--landing-primary)] to-[var(--landing-primary-dark)] flex items-center justify-center shrink-0">
              <FontAwesomeIcon icon={faStar} className="w-4 h-4 text-[var(--landing-bg-white)]" />
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
                      <FontAwesomeIcon icon={faFileLines} className="w-3.5 h-3.5 text-[var(--landing-text-secondary)]" />
                      <span className="text-[14px] text-[var(--landing-text-secondary)]">{quote.source}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faCalendarDays} className="w-3.5 h-3.5 text-[var(--landing-text-secondary)]" />
                      <span className="text-[14px] text-[var(--landing-text-secondary)]">{quote.date}</span>
                    </div>
                  </div>
                </div>

                <Button
                  className="bg-[var(--landing-primary)] text-[var(--landing-bg-white)] font-medium h-11 rounded-xl px-5 flex items-center justify-center gap-2 cursor-pointer"
                >
                  Read Original Document
                  <FontAwesomeIcon icon={faUpRightFromSquare} className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}
