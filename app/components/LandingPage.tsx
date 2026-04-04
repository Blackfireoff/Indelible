'use client'

// Removed unused Button import
import NavBar from './NavBar'
import HeroSection from './HeroSection'
import Footer from './Footer'

// (Custom inline icons and unused data arrays have been removed)

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--landing-bg)] flex flex-col">
      {/* NavBar with wallet */}
      <NavBar showWallet />

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
