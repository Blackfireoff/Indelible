'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'
import { Button } from '@heroui/react'
import NavBar from './NavBar'
import Footer from './Footer'
import SourcesModal, { type SourceDocument } from './SourcesModal'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar, faFileLines, faCalendarDays, faUpRightFromSquare, faMagnifyingGlass, faXmark, faQuoteLeft } from '@fortawesome/free-solid-svg-icons'

interface Citation {
  chunkId: string
  quote: string
  sourceUrl: string
  observedAt: string
  storagePointer: string
}

interface QueryResult {
  mode: string
  corrected: boolean
  correctionReason: string
  output: {
    answer: string
    citations: Citation[]
    confidence: number
    evidence: string[]
    limitations: string
    contradictions: unknown[]
  }
  retrievalPassed: boolean
}

// API response type
interface ApiResponse {
  mode: string
  corrected: boolean
  correctionReason: string
  output: {
    answer: string
    citations: Citation[]
    confidence: number
    evidence: string[]
    limitations: string
    contradictions: unknown[]
  }
  retrievalPassed: boolean
}

export default function SearchResults() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const query = searchParams.get('q') || ''
  const { isConnected, status } = useAppKitAccount()
  const [selectedDocument, setSelectedDocument] = useState<SourceDocument | null>(null)
  const [searchQuery, setSearchQuery] = useState(query)
  const [result, setResult] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastSearchedQuery = useRef<string | null>(null)

  useEffect(() => {
    if (status !== 'reconnecting' && status !== 'connecting' && !isConnected) {
      router.push('/')
    }
  }, [isConnected, status, router])

  // Fetch results when query changes
  useEffect(() => {
    if (!query) return
    // Prevent duplicate searches (React StrictMode runs effects twice in dev)
    if (lastSearchedQuery.current === query) return
    lastSearchedQuery.current = query
    setSearchQuery(query)
    performSearch(query)
  }, [query])

  const performSearch = async (q: string) => {
    if (!q.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      if (!res.ok) throw new Error('Query failed')
      const data: ApiResponse = await res.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // Convert API citations to SourceDocument format
  const citations: SourceDocument[] = result?.output?.citations?.map((cit, i) => ({
    text: cit.quote,
    author: result.output.evidence[i] ? result.output.evidence[i].split('-chunk-')[0]?.replace('doc-', 'Document ').toUpperCase() || 'Unknown' : 'Unknown',
    initials: 'SC',
    source: cit.sourceUrl || cit.storagePointer,
    date: cit.observedAt ? new Date(cit.observedAt).toLocaleDateString() : '',
    articleTitle: 'Source Document',
    articleAuthor: 'Indelible RAG',
    fullArticle: cit.quote,
  })) || []

  // Human-readable message when no evidence is found
  const getSummaryMessage = () => {
    if (result?.output?.answer) return result.output.answer;
    if (result?.output?.limitations) {
      const limit = result.output.limitations;
      if (limit.includes('No chunks retrieved') || limit.includes('No relevant chunks') || limit.includes('Insufficient')) {
        return "I couldn't find any relevant content in the database that matches your question. This could mean the topic hasn't been documented yet, or the search terms don't match what's stored. Try different keywords or check back later.";
      }
      return limit;
    }
    return 'No response generated.';
  }

  if (!isConnected) {
    return null
  }

  return (
    <div className="min-h-screen bg-[var(--landing-bg)] flex flex-col">
      {/* NavBar */}
      <NavBar showWallet />

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full">
        {/* Search Input */}
        <div className="relative mb-6">
          <div className="bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-xl shadow-sm h-14 flex items-center px-4 gap-3">
            <button
              onClick={() => setSearchQuery('')}
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search political speeches..."
              className="flex-1 bg-transparent text-[16px] text-[var(--landing-text-primary)] placeholder:text-[var(--landing-text-secondary)] outline-none"
            />
            <Button
              onPress={handleSearch}
              isDisabled={isLoading || !searchQuery.trim()}
              className="h-10 bg-[var(--landing-primary-darker)] hover:bg-[var(--landing-primary-dark)] text-[var(--landing-bg-white)] font-medium rounded-xl px-6 cursor-pointer"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {result && (
          <>
            {/* AI Summary Card */}
            <div className="relative mb-8 p-6 rounded-2xl border border-[var(--landing-primary-light)] shadow-sm overflow-hidden"
              style={{
                background: 'linear-gradient(167.8deg, var(--landing-primary-subtle) 0%, rgba(3, 105, 209, 0.05) 100%)'
              }}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[var(--landing-primary-dark)] flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faStar} className="w-4 h-4 text-[var(--landing-bg-white)]" />
                </div>
                <div>
                  <h3 className="text-[18px] font-semibold text-[var(--landing-text-primary)]">AI Summary</h3>
                  <p className="text-[14px] text-[var(--landing-text-secondary)]">
                    {result.output.citations?.length || 0} sources retrieved
                    {result.retrievalPassed ? '' : ' • Retrieval limited'}
                  </p>
                </div>
              </div>
              <p className="text-[16px] leading-[26px] text-[var(--landing-text-primary)] pl-11">
                {getSummaryMessage()}
              </p>
            </div>

            {/* Source Documents Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-[20px] font-semibold text-[var(--landing-text-primary)]">Source Documents</h2>
                <p className="text-[14px] text-[var(--landing-text-secondary)]">
                  Found {result.output.citations?.length || 0} relevant quotes
                </p>
              </div>
              <div className="text-[12px] text-[var(--landing-text-muted)]">
                Mode: {result.mode}
              </div>
            </div>

            {/* Quote Cards */}
            {citations.length > 0 ? (
              <div className="flex flex-col gap-5">
                {citations.map((quote, index) => (
                  <div
                    key={index}
                    className="bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-xl shadow-sm p-6"
                  >
                    {/* Quote */}
                    <div className="mb-4 p-4 rounded-xl bg-[var(--landing-bg)] border-l-[3px] border-[var(--landing-primary)]">
                      <div className="flex gap-2 items-start">
                        <FontAwesomeIcon icon={faQuoteLeft} className="w-3.5 h-3.5 text-[var(--landing-primary)] mt-1 shrink-0 opacity-50" />
                        <p className="text-[14px] leading-[22px] text-[var(--landing-text-secondary)] italic">
                          {quote.text}
                        </p>
                      </div>
                    </div>

                    {/* Author & Source */}
                    <div className="flex items-start justify-between pt-4 border-t border-[var(--landing-border)]">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[var(--landing-primary-dark)] flex items-center justify-center">
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
                        onPress={() => setSelectedDocument(quote)}
                        className="bg-[var(--landing-primary-darker)] hover:bg-[var(--landing-primary-dark)] text-[var(--landing-bg-white)] font-medium h-11 rounded-xl px-5 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        Read Original Document
                        <FontAwesomeIcon icon={faUpRightFromSquare} className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-[var(--landing-text-secondary)]">
                No source documents found for this query.
              </div>
            )}
          </>
        )}

        {!result && !isLoading && !error && (
          <div className="text-center py-12 text-[var(--landing-text-secondary)]">
            Enter a query to search political speeches and statements.
          </div>
        )}
      </main>

      {/* Footer */}
      <Footer />

      {/* Document Modal */}
      <SourcesModal
        isOpen={selectedDocument !== null}
        onClose={() => setSelectedDocument(null)}
        document={selectedDocument}
      />
    </div>
  )
}
