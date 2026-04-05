'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import { parseUnits, encodeFunctionData, erc20Abi, createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'
import { Button } from '@heroui/react'

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http()
})
import NavBar from './NavBar'
import Footer from './Footer'
import SourcesModal, { type SourceDocument } from './SourcesModal'
import { faLink } from '@fortawesome/free-solid-svg-icons'
import SearchBar from './SearchBar'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faStar, faFileLines, faCalendarDays, faUpRightFromSquare, faMagnifyingGlass, faXmark, faQuoteLeft, faHandSparkles, faMagicWandSparkles, faSpinner, faChevronLeft } from '@fortawesome/free-solid-svg-icons'

interface Citation {
  chunkId: string
  attestationId: string
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
  const { isConnected, status, address } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider('eip155')
  const [selectedDocument, setSelectedDocument] = useState<SourceDocument | null>(null)
  const [searchQuery, setSearchQuery] = useState(query)
  const [result, setResult] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingDocument, setIsLoadingDocument] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastSearchedQuery = useRef<string | null>(null)
  const [sequenceMap, setSequenceMap] = useState<Record<string, number>>({})

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

  // Fetch 0G sequence numbers for all unique attestation IDs when results change
  useEffect(() => {
    if (!result?.output?.citations?.length) return
    const uniqueAttestations = [...new Set(result.output.citations.map(c => c.attestationId).filter(Boolean))]
    if (uniqueAttestations.length === 0) return

    let cancelled = false
    Promise.all(
      uniqueAttestations.map(async (attId) => {
        try {
          const res = await fetch(`/api/clean-article?attestationId=${encodeURIComponent(attId)}`)
          if (!res.ok) return null
          const data = await res.json()
          return { attId, sequence: data.article?.sequence as number | undefined }
        } catch {
          return null
        }
      })
    ).then((results) => {
      if (cancelled) return
      const map: Record<string, number> = {}
      for (const r of results) {
        if (r && r.sequence !== undefined) map[r.attId] = r.sequence
      }
      setSequenceMap(map)
    })

    return () => { cancelled = true }
  }, [result])

  const performSearch = async (q: string) => {
    if (!q.trim()) return
    if (!publicClient || !address || !walletProvider) {
      setError("Please connect your wallet to search.")
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      // 1. Check Balance
      const INDL_TOKEN_ADDRESS = '0x230c1F84e14E355760c158f94D42d6Ef81a4D35f' as `0x${string}`
      const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD' as `0x${string}`
      const INDL_REQUIRED = parseUnits('1', 18)

      const balance = (await publicClient.readContract({
        address: INDL_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      } as any)) as bigint

      if (balance < INDL_REQUIRED) {
        // Redirect if they don't have enough INDL
        router.push('/get-token')
        return
      }

      // 2. Consume 1 INDL Token
      const txData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [BURN_ADDRESS, INDL_REQUIRED]
      })

      setError("Please check your wallet to approve the 1 INDL request fee...")

      const txHashStr = await (walletProvider as any).request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: INDL_TOKEN_ADDRESS,
          data: txData
        }]
      })

      const txHash = txHashStr as string

      setError("Verifying transaction and searching...")

      // 3. Perform the Search
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, txHash }),
      })
      if (!res.ok) throw new Error('Query failed')
      const apiData: ApiResponse = await res.json()
      setResult(apiData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = () => {
    const trimmedQuery = searchQuery.trim()
    if (trimmedQuery) {
      lastSearchedQuery.current = trimmedQuery
      router.push(`/search?q=${encodeURIComponent(trimmedQuery)}`)
      performSearch(trimmedQuery)
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
    // Store attestationId for fetching clean article
    attestationId: cit.attestationId,
  })) || []

  // Fetch full clean article when user clicks "Read Original Document"
  const handleReadOriginalDocument = async (citation: SourceDocument) => {
    // If we already have the article loaded, just show it
    if (citation.paragraphs && citation.paragraphs.length > 0) {
      setSelectedDocument(citation)
      return
    }

    if (!citation.attestationId) {
      setSelectedDocument(citation)
      return
    }

    setIsLoadingDocument(true)
    try {
      const res = await fetch(`/api/clean-article?attestationId=${encodeURIComponent(citation.attestationId)}`)
      if (!res.ok) {
        console.error('Failed to fetch clean article')
        setSelectedDocument(citation)
        return
      }

      const data = await res.json()
      const article = data.article

      // Build fullText from paragraphs if available
      const fullArticleText = article.paragraphs
        ? article.paragraphs.map((p: any) => p.text).join('\n\n')
        : article.fullText || article.content || citation.fullArticle

      // Update the citation with the full article content
      setSelectedDocument({
        ...citation,
        articleTitle: article.title || citation.articleTitle,
        articleAuthor: article.authors?.join(', ') || citation.articleAuthor,
        source: article.publisher || article.sourceUrl || citation.source,
        date: article.publishedAt
          ? new Date(article.publishedAt).toLocaleDateString()
          : article.observedAt
            ? new Date(article.observedAt).toLocaleDateString()
            : citation.date,
        fullArticle: fullArticleText,
        paragraphs: article.paragraphs || undefined,
        sequence: article.sequence,
      })
    } catch (err) {
      console.error('Error fetching clean article:', err)
      setSelectedDocument(citation)
    } finally {
      setIsLoadingDocument(false)
    }
  }

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
        {/* Back to Home / New Request */}
        <div className="mb-4">
          <Link href="/" className="inline-flex items-center gap-2 text-[14px] font-medium text-[var(--landing-text-secondary)] hover:text-[var(--landing-primary)] transition-colors">
            <FontAwesomeIcon icon={faChevronLeft} className="w-3.5 h-3.5" />
            New request
          </Link>
        </div>

        {/* Search Input */}
        <div className="relative mb-6">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            onSearch={handleSearch}
            isLoading={isLoading}
            placeholder="Search political speeches..."
            size="md"
          />
        </div>

        {error && (
          <div className="mb-6 p-4 bg-[var(--landing-bg-light)] border border-[var(--landing-border)] rounded-xl text-[var(--landing-text-secondary)] text-sm">
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
                <div className="w-8 h-8 rounded-lg bg-[var(--accent-color-dark)] flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faMagicWandSparkles} className="w-4 h-4 text-[var(--landing-bg-white)]" />
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
                          {quote.attestationId && sequenceMap[quote.attestationId] !== undefined ? (
                            <a
                              href={`https://storagescan-galileo.0g.ai/submission/${sequenceMap[quote.attestationId]}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-[14px] text-[var(--landing-primary)] hover:text-[var(--landing-primary-dark)] transition-colors hover:underline"
                            >
                              <FontAwesomeIcon icon={faLink} className="w-3.5 h-3.5 shrink-0" />
                              <span>0G Submission #{sequenceMap[quote.attestationId]}</span>
                              <FontAwesomeIcon icon={faUpRightFromSquare} className="w-2.5 h-2.5 opacity-60" />
                            </a>
                          ) : (
                            <div className="flex items-center gap-1.5 relative group/file">
                              <FontAwesomeIcon icon={faFileLines} className="w-3.5 h-3.5 text-[var(--landing-text-secondary)] shrink-0" />
                              <span className="text-[14px] text-[var(--landing-text-secondary)] truncate max-w-[200px]">
                                {quote.source}
                              </span>
                              <div className="absolute top-full left-0 mt-2 px-3 py-1.5 bg-[#1A1A1A] text-white text-[12px] font-medium rounded-lg opacity-0 invisible translate-y-1.5 scale-95 origin-top-left group-hover/file:opacity-100 group-hover/file:visible group-hover/file:translate-y-0 group-hover/file:scale-100 transition-all duration-300 delay-200 ease-out whitespace-nowrap shadow-lg z-50 pointer-events-none">
                                {quote.source}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <FontAwesomeIcon icon={faCalendarDays} className="w-3.5 h-3.5 text-[var(--landing-text-secondary)]" />
                            <span className="text-[14px] text-[var(--landing-text-secondary)]">{quote.date}</span>
                          </div>
                        </div>
                      </div>

                      <Button
                        onPress={() => handleReadOriginalDocument(quote)}
                        isLoading={isLoadingDocument}
                        disabled={isLoadingDocument}
                        className="bg-[var(--landing-primary-darker)] hover:bg-[var(--landing-primary-dark)] text-[var(--landing-bg-white)] font-medium h-11 rounded-xl px-5 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
                      >
                        {!isLoadingDocument && (
                          <>
                            Read Original Document
                            <FontAwesomeIcon icon={faUpRightFromSquare} className="w-4 h-4" />
                          </>
                        )}
                        {isLoadingDocument && 'Loading...'}
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
