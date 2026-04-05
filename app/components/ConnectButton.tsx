'use client'

import { useAppKit, useAppKitAccount } from '@reown/appkit/react'

interface ConnectButtonProps {
  text?: string
}

export default function ConnectButton({ text = 'Sign in' }: ConnectButtonProps) {
  const { open } = useAppKit()
  const { isConnected, status } = useAppKitAccount()
  const isFullyConnected = isConnected && status === 'connected'

  return (
    <button
      onClick={() => open()}
      className="h-10 px-6 rounded-xl bg-[var(--landing-primary-darker)] hover:bg-[var(--landing-primary-dark)] text-[var(--landing-bg-white)] font-medium text-[14px] cursor-pointer"
    >
      {isFullyConnected ? 'Profil' : text}
    </button>
  )
}
