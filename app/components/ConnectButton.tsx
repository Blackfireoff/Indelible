'use client'

import { useAppKit, useAppKitAccount } from '@reown/appkit/react'

interface ConnectButtonProps {
  text?: string
}

export default function ConnectButton({ text = 'Sign in' }: ConnectButtonProps) {
  const { open } = useAppKit()
  const { isConnected } = useAppKitAccount()

  return (
    <button
      onClick={() => open()}
      className="h-10 px-6 rounded-xl bg-[var(--landing-primary)] text-[var(--landing-bg-white)] font-medium text-[14px] cursor-pointer"
    >
      {isConnected ? 'Profil' : text}
    </button>
  )
}
