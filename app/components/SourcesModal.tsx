'use client'

import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faXmark,
  faNewspaper,
  faUser,
  faCalendarDays,
  faBuildingColumns,
  faCopy,
  faCheck,
  faQuoteLeft,
  faAlignLeft,
  faTextHeight,
  faArrowDown,
} from '@fortawesome/free-solid-svg-icons'

export interface SourceDocument {
  text: string
  author: string
  initials: string
  source: string
  date: string
  articleAuthor?: string
  articleTitle?: string
  fullArticle: string
  attestationId?: string
  sequence?: number
  paragraphs?: Array<{
    paragraphId: string
    order: number
    text: string
    charStart: number
    charEnd: number
  }>
}

interface SourcesModalProps {
  isOpen: boolean
  onClose: () => void
  document: SourceDocument | null
}

interface Paragraph {
  index: number
  text: string
  isCitation: boolean
}

export default function SourcesModal({ isOpen, onClose, document }: SourcesModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const citationRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Reset state when document changes
  useEffect(() => {
    if (document) {
      setCopied(false)
    }
  }, [document])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document && (window.document.body.style.overflow = 'hidden')
    } else {
      window.document.body.style.overflow = ''
    }
    return () => { window.document.body.style.overflow = '' }
  }, [isOpen, document])

  const handleCopy = () => {
    if (!document) return
    navigator.clipboard.writeText(document.fullArticle)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const scrollToCitation = () => {
    if (citationRef.current) {
      citationRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  // Parse article into paragraphs
  const getParagraphs = (): Paragraph[] => {
    // If we have actual paragraph data from the clean article, use it
    if (document?.paragraphs && document.paragraphs.length > 0) {
      const citationText = document.text.toLowerCase()
      return document.paragraphs
        .sort((a, b) => a.order - b.order)
        .map((para) => ({
          index: para.order,
          text: para.text,
          isCitation: para.text.toLowerCase().includes(citationText) ||
            citationText.includes(para.text.slice(0, 30).toLowerCase())
        }))
    }

    // Fallback: split fullText by double newlines
    if (!document?.fullArticle) return []

    const rawParagraphs = document.fullArticle
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0)

    const citationText = document.text.toLowerCase()

    return rawParagraphs.map((text, idx) => ({
      index: idx + 1,
      text,
      isCitation: text.toLowerCase().includes(citationText) ||
        citationText.includes(text.slice(0, 30).toLowerCase())
    }))
  }

  const paragraphs = getParagraphs()
  const citationParagraph = paragraphs.find(p => p.isCitation)

  if (!isOpen || !document) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
      style={{ animation: 'modalFadeIn 0.2s ease-out' }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-[var(--landing-bg-white)] rounded-2xl shadow-2xl border border-[var(--landing-border)] flex flex-col max-h-[88vh] w-full max-w-4xl mx-4"
        style={{ animation: 'modalSlideUp 0.25s ease-out' }}
      >
        {/* ── Modal Top Bar ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--landing-border)] shrink-0 bg-[var(--landing-bg-light)] rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--landing-primary-darker)] flex items-center justify-center">
              <FontAwesomeIcon icon={faNewspaper} className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-[var(--landing-text-primary)]">
                Original Document
              </h2>
              <p className="text-[13px] text-[var(--landing-text-secondary)]">
                {paragraphs.length} paragraphs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--landing-border)] transition-colors cursor-pointer"
          >
            <FontAwesomeIcon icon={faXmark} className="w-5 h-5 text-[var(--landing-text-secondary)]" />
          </button>
        </div>

        {/* ── Article Metadata Header ── */}
        <div className="px-6 py-5 border-b border-[var(--landing-border)] shrink-0">
          {/* Title */}
          <h3 className="text-[20px] font-bold text-[var(--landing-text-primary)] leading-snug mb-4">
            {document.articleTitle || document.source}
          </h3>

          {/* Metadata pills */}
          <div className="flex flex-wrap items-center gap-3">
            {document.sequence !== undefined && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--landing-bg)] border border-[var(--landing-border)] rounded-full">
                <span className="text-[12px] text-[var(--landing-text-secondary)]">Seq: {document.sequence}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--landing-bg)] border border-[var(--landing-border)] rounded-full">
              <FontAwesomeIcon icon={faBuildingColumns} className="w-3 h-3 text-[var(--landing-text-secondary)]" />
              <span className="text-[12px] text-[var(--landing-text-secondary)]">{document.source}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--landing-bg)] border border-[var(--landing-border)] rounded-full">
              <FontAwesomeIcon icon={faCalendarDays} className="w-3 h-3 text-[var(--landing-text-secondary)]" />
              <span className="text-[12px] text-[var(--landing-text-secondary)]">{document.date}</span>
            </div>
          </div>
        </div>

        {/* ── Toolbar Area ── */}
        <div className="px-6 py-3 border-b border-[var(--landing-border)] bg-[var(--landing-bg)] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[14px] font-medium text-[var(--landing-text-secondary)]">
            <FontAwesomeIcon icon={faAlignLeft} className="w-4 h-4 opacity-50" />
            <span>Full Document View</span>
          </div>
          {citationParagraph && (
            <button
              onClick={scrollToCitation}
              className="flex items-center gap-2 text-[13px] font-semibold text-[var(--landing-bg-white)] bg-[var(--landing-primary-darker)] hover:bg-[var(--landing-primary-dark)] px-3 py-1.5 rounded-lg transition-all shadow-sm cursor-pointer"
            >
              <FontAwesomeIcon icon={faArrowDown} className="w-3 h-3" />
              <span>Jump to Citation</span>
            </button>
          )}
        </div>

        {/* ── Article Body — scrollable ── */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-6 scroll-smooth">
          <div className="space-y-6">
            {paragraphs.map((para) => (
              <div
                key={para.index}
                ref={para.isCitation ? citationRef : null}
                className={`relative p-5 rounded-2xl border transition-all duration-300 ${
                  para.isCitation
                    ? 'bg-[var(--accent-color-light)] border-[var(--accent-color)] shadow-[0_4px_20px_rgba(255,211,33,0.15)] ring-1 ring-[var(--accent-color-dark)]/10'
                    : 'bg-[var(--landing-bg)] border-[var(--landing-border)] hover:border-[var(--landing-border-dark)]'
                }`}
              >
                {/* Paragraph number */}
                <div className="flex items-start gap-4">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-[12px] font-bold shadow-sm transition-colors ${
                    para.isCitation
                      ? 'bg-[var(--accent-color-dark)] text-white'
                      : 'bg-[var(--landing-border)] text-[var(--landing-text-secondary)]'
                  }`}>
                    {para.index}
                  </div>
                  <div className="flex-1">
                    <p className={`text-[16px] leading-[28px] whitespace-pre-line ${
                      para.isCitation ? 'text-[var(--landing-text-primary)] font-medium' : 'text-[var(--landing-text-secondary)]'
                    }`}>
                      {para.text}
                    </p>
                    {para.isCitation && (
                      <div className="mt-4 pt-4 border-t border-[var(--accent-color-dark)]/10">
                        <p className="text-[13px] text-[var(--accent-color-dark)] font-bold flex items-center gap-2">
                          <FontAwesomeIcon icon={faQuoteLeft} className="w-3.5 h-3.5" />
                          RELEVANT CITATION
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Modal Footer ── */}
        <div className="px-6 py-4 border-t border-[var(--landing-border)] flex items-center justify-between shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 text-[13px] text-[var(--landing-text-secondary)] hover:text-[var(--landing-text-primary)] transition-colors cursor-pointer px-3 py-1.5 rounded-lg hover:bg-[var(--landing-bg)]"
          >
            <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="w-3.5 h-3.5" />
            <span>{copied ? 'Copied!' : 'Copy full article'}</span>
          </button>
          <button
            onClick={onClose}
            className="h-9 px-5 rounded-xl bg-[var(--landing-primary-dark)] text-white text-[14px] font-medium hover:bg-[var(--landing-primary-darker)] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
