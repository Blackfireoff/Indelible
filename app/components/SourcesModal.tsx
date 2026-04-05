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
  const [showAllParagraphs, setShowAllParagraphs] = useState(false)

  // Reset state when document changes
  useEffect(() => {
    if (document) {
      setShowAllParagraphs(false)
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

          {/* Author row */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--landing-primary)] to-[var(--landing-primary-dark)] flex items-center justify-center shrink-0">
              <span className="text-[13px] font-semibold text-white">{document.initials}</span>
            </div>
            <div>
              <p className="text-[15px] font-semibold text-[var(--landing-text-primary)]">
                {document.author}
              </p>
              <p className="text-[13px] text-[var(--landing-text-secondary)]">
                {document.articleAuthor ? `Article by ${document.articleAuthor}` : 'Speaker'}
              </p>
            </div>
          </div>

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
            {document.articleAuthor && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--landing-bg)] border border-[var(--landing-border)] rounded-full">
                <FontAwesomeIcon icon={faUser} className="w-3 h-3 text-[var(--landing-text-secondary)]" />
                <span className="text-[12px] text-[var(--landing-text-secondary)]">By {document.articleAuthor}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Toggle Button ── */}
        <div className="px-6 py-3 border-b border-[var(--landing-border)] bg-[var(--landing-bg)] shrink-0">
          <button
            onClick={() => setShowAllParagraphs(!showAllParagraphs)}
            className="flex items-center gap-2 text-[14px] font-medium text-[var(--landing-primary)] hover:text-[var(--landing-primary-dark)] transition-colors cursor-pointer"
          >
            <FontAwesomeIcon icon={showAllParagraphs ? faQuoteLeft : faAlignLeft} className="w-4 h-4" />
            <span>{showAllParagraphs ? 'Show citation only' : 'Show all paragraphs'}</span>
          </button>
        </div>

        {/* ── Article Body — scrollable ── */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {showAllParagraphs ? (
            <>
              {/* View: All Paragraphs */}
              <div className="space-y-6">
                {paragraphs.map((para) => (
                  <div
                    key={para.index}
                    className={`relative p-4 rounded-xl border transition-all ${
                      para.isCitation
                        ? 'bg-[var(--landing-primary-subtle)] border-[var(--landing-primary)] shadow-sm'
                        : 'bg-[var(--landing-bg)] border-[var(--landing-border)]'
                    }`}
                  >
                    {/* Paragraph number */}
                    <div className="flex items-start gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-semibold ${
                        para.isCitation
                          ? 'bg-[var(--landing-primary)] text-white'
                          : 'bg-[var(--landing-border)] text-[var(--landing-text-secondary)]'
                      }`}>
                        {para.index}
                      </div>
                      <div className="flex-1">
                        <p className="text-[15px] leading-[27px] text-[var(--landing-text-primary)] whitespace-pre-line">
                          {para.text}
                        </p>
                        {para.isCitation && (
                          <div className="mt-3 pt-3 border-t border-[var(--landing-primary)]/20">
                            <p className="text-[12px] text-[var(--landing-primary)] font-medium flex items-center gap-1.5">
                              <FontAwesomeIcon icon={faQuoteLeft} className="w-3 h-3" />
                              This paragraph contains your citation
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* View: Citation Only */}
              <div className="mb-6 p-4 rounded-xl bg-[var(--landing-bg)] border-l-[3px] border-[var(--landing-primary)]">
                <div className="flex gap-2 items-start">
                  <FontAwesomeIcon icon={faQuoteLeft} className="w-3.5 h-3.5 text-[var(--landing-primary)] mt-1 shrink-0 opacity-50" />
                  <p className="text-[14px] leading-[22px] text-[var(--landing-text-secondary)] italic">
                    {document.text}
                  </p>
                </div>
                <p className="text-[11px] text-[var(--landing-text-muted)] mt-2 pl-5">
                  ↑ Extracted citation shown in search results
                </p>
              </div>

              {/* Paragraph containing citation */}
              {citationParagraph && citationParagraph.text !== document.text && (
                <div className="mb-6">
                  <p className="text-[12px] text-[var(--landing-text-secondary)] mb-2 font-medium">
                    Full paragraph containing this citation:
                  </p>
                  <div className="p-4 rounded-xl bg-[var(--landing-bg)] border border-[var(--landing-border)]">
                    <p className="text-[15px] leading-[27px] text-[var(--landing-text-primary)] whitespace-pre-line">
                      {citationParagraph.text}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
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
