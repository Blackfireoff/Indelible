import GetTokenClient from '../components/GetTokenClient'
import NavBar from '../components/NavBar'

export default function GetTokenPage() {
  return (
    <div className="min-h-screen bg-[var(--landing-bg-light)]">
      <NavBar showWallet />
      <main className="max-w-7xl mx-auto px-6 py-16">
        <GetTokenClient />
      </main>
    </div>
  )
}
