'use client'

import NavBar from '@/app/components/NavBar'
import Footer from '@/app/components/Footer'
import Image from 'next/image'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faWandMagicSparkles, faShieldHalved, faGlobe, faCheckCircle } from '@fortawesome/free-solid-svg-icons'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--landing-bg)] flex flex-col">
      <NavBar showWallet />

      <main className="flex-1 max-w-5xl mx-auto px-6 py-12 w-full">
        {/* Heading */}
        <div className="text-center mb-12 flex flex-col items-center">
          <h1 className="text-[36px] font-semibold leading-[40px] text-[var(--landing-text-primary)] mb-4 flex justify-center items-center gap-3">
            About
            <Image
              src="/logo/med.svg"
              alt="Indelible Logo"
              width={200}
              height={48}
              className="h-[40px] w-auto object-contain translate-y-1"
              priority
            />
          </h1>
          <p className="text-[18px] leading-[28px] text-[var(--landing-text-secondary)] max-w-[638px] mx-auto">
            Empowering citizens with AI-powered insights into political discourse and public policy statements.
          </p>
        </div>

        {/* Our Mission Card */}
        <div className="bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-2xl p-8 mb-12 shadow-sm">
          <h2 className="text-[24px] font-semibold leading-[32px] text-[var(--landing-text-primary)] mb-4">
            Our Mission
          </h2>
          <p className="text-[16px] leading-[26px] text-[var(--landing-text-secondary)]">
            Our mission is to create a permanent, incorruptible record of political discourse. We believe that a transparent society requires a perfect memory. By leveraging decentralized technology and artificial intelligence, <em className="italic">Indelible.</em> eliminates the 'memory hole'—ensuring that statements, promises, and declarations can never be quietly erased or altered by those in power. We exist to provide citizens, journalists, and researchers with a strictly neutral, publicly accessible source of truth.
          </p>
        </div>

        {/* Feature Cards - 2x2 Grid */}
        <div className="grid grid-cols-2 gap-6 mb-12">
          {/* AI-Powered Analysis */}
          <div className="bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-xl p-6 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--landing-primary)] to-[var(--landing-primary-dark)] flex items-center justify-center mb-4">
              <FontAwesomeIcon icon={faWandMagicSparkles} className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-[18px] font-semibold leading-[28px] text-[var(--landing-text-primary)] mb-2">
              AI-Powered Analysis
            </h3>
            <p className="text-[14px] leading-[22.75px] text-[var(--landing-text-secondary)]">
              Advanced natural language processing to understand context, extract key quotes, and generate comprehensive summaries from political speeches.
            </p>
          </div>

          {/* Verified Sources */}
          <div className="bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-xl p-6 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--landing-primary)] to-[var(--landing-primary-dark)] flex items-center justify-center mb-4">
              <FontAwesomeIcon icon={faShieldHalved} className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-[18px] font-semibold leading-[28px] text-[var(--landing-text-primary)] mb-2">
              Verified Sources
            </h3>
            <p className="text-[14px] leading-[22.75px] text-[var(--landing-text-secondary)]">
              Every quote and document is verified and linked to original sources including official transcripts, news outlets, and government records.
            </p>
          </div>

          {/* Global Coverage */}
          <div className="bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-xl p-6 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--landing-primary)] to-[var(--landing-primary-dark)] flex items-center justify-center mb-4">
              <FontAwesomeIcon icon={faGlobe} className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-[18px] font-semibold leading-[28px] text-[var(--landing-text-primary)] mb-2">
              Global Coverage
            </h3>
            <p className="text-[14px] leading-[22.75px] text-[var(--landing-text-secondary)]">
              Track political discourse from leaders around the world, with support for multiple languages and international policy topics.
            </p>
          </div>

          {/* Fact-Checked */}
          <div className="bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-xl p-6 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--landing-primary)] to-[var(--landing-primary-dark)] flex items-center justify-center mb-4">
              <FontAwesomeIcon icon={faCheckCircle} className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-[18px] font-semibold leading-[28px] text-[var(--landing-text-primary)] mb-2">
              Fact-Checked
            </h3>
            <p className="text-[14px] leading-[22.75px] text-[var(--landing-text-secondary)]">
              Our team of researchers and automated systems work together to ensure accuracy and provide context for every piece of information.
            </p>
          </div>
        </div>

        {/* How It Works */}
        <div className="border border-[var(--landing-border-primary)] rounded-2xl p-8" style={{ background: 'linear-gradient(161.64deg, var(--landing-primary-subtle) 0%, var(--landing-primary-subtle) 100%)' }}>
          <h2 className="text-[24px] font-semibold leading-[32px] text-[var(--landing-text-primary)] mb-6">
            How It Works
          </h2>

          <div className="flex flex-col gap-4">
            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-[var(--landing-primary)] flex items-center justify-center shrink-0">
                <span className="text-[16px] font-semibold text-white">1</span>
              </div>
              <div className="flex-1">
                <h4 className="text-[16px] font-semibold leading-[24px] text-[var(--landing-text-primary)] mb-1">
                  Search by Topic or Name
                </h4>
                <p className="text-[14px] leading-[20px] text-[var(--landing-text-secondary)]">
                  Enter a politician's name and a topic, or ask a question in natural language.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-[var(--landing-primary)] flex items-center justify-center shrink-0">
                <span className="text-[16px] font-semibold text-white">2</span>
              </div>
              <div className="flex-1">
                <h4 className="text-[16px] font-semibold leading-[24px] text-[var(--landing-text-primary)] mb-1">
                  Get AI Summary
                </h4>
                <p className="text-[14px] leading-[20px] text-[var(--landing-text-secondary)]">
                  Our AI analyzes relevant speeches and generates a concise summary of their position.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-[var(--landing-primary)] flex items-center justify-center shrink-0">
                <span className="text-[16px] font-semibold text-white">3</span>
              </div>
              <div className="flex-1">
                <h4 className="text-[16px] font-semibold leading-[24px] text-[var(--landing-text-primary)] mb-1">
                  Explore Source Documents
                </h4>
                <p className="text-[14px] leading-[20px] text-[var(--landing-text-secondary)]">
                  Review specific quotes and read full transcripts to verify information and understand context.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
