'use client'

import { createAppKit } from '@reown/appkit/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cookieToInitialState, WagmiProvider } from 'wagmi'
import type { Config } from 'wagmi'
import { projectId, networks, wagmiAdapter, metadata } from '@/config'

const queryClient = new QueryClient()

const globalAny = globalThis as any;

if (!globalAny.__appkit_modal__) {
  globalAny.__appkit_modal__ = createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    metadata,
    themeMode: 'light',
    themeVariables: {
      '--w3m-accent': '#b87c4c',
    },
    features: {
      email: true,
      socials: ['google', 'x', 'github', 'discord', 'apple', 'facebook', 'farcaster'],
      emailShowWallets: true,
      analytics: false
    }
  })
}
const modal = globalAny.__appkit_modal__;

export default function ContextProvider({
  children,
  cookies,
}: {
  children: React.ReactNode
  cookies: string | null
}) {
  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig as Config,
    cookies
  )

  return (
    <WagmiProvider
      config={wagmiAdapter.wagmiConfig as Config}
      initialState={initialState}
    >
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
