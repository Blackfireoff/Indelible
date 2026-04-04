export default function Footer() {
  return (
    <footer className="bg-[var(--landing-bg-white)] border-t border-[var(--landing-border)] py-4 mt-auto">
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
  )
}
