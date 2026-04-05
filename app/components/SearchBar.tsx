'use client'

import { Button } from '@heroui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass, faXmark, faSpinner } from '@fortawesome/free-solid-svg-icons'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onSearch: () => void
  isLoading?: boolean
  placeholder?: string
  className?: string
  size?: 'md' | 'lg'
}

export default function SearchBar({
  value,
  onChange,
  onSearch,
  isLoading = false,
  placeholder = "Search...",
  className = "",
  size = 'md'
}: SearchBarProps) {

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch()
    }
  }

  const isLarge = size === 'lg'

  return (
    <div className={`w-full bg-[var(--landing-bg-white)] border border-[var(--landing-border)] ${isLarge ? 'h-16 rounded-2xl px-6 gap-4 shadow-[0px_10px_15px_0px_rgba(0,0,0,0.1),0px_4px_6px_0px_rgba(0,0,0,0.1)]' : 'h-16 rounded-xl px-4 gap-3 shadow-sm'} flex items-center ${className}`}>
      <button
        onClick={() => onChange('')}
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[16px] text-[var(--landing-text-primary)] placeholder:text-[var(--landing-text-muted)] outline-none"
      />

      <Button
        onPress={onSearch}
        isDisabled={isLoading || !value.trim()}
        className={`bg-[var(--landing-primary-darker)] text-[var(--landing-bg-white)] hover:bg-[var(--landing-primary-dark)] font-medium rounded-xl px-6 cursor-pointer ${isLarge ? 'h-12' : 'h-12'} flex items-center justify-center`}
      >
        {isLoading ? (
          <FontAwesomeIcon icon={faSpinner} className="w-5 h-5 animate-spin" />
        ) : 'Search'}
      </Button>
    </div>
  )
}
