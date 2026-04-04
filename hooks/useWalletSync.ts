'use client'

import { useEffect } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'

const WALLET_STORAGE_KEY = 'indelible_wallet_state'

export function useWalletSync() {
  const { address, isConnected } = useAppKitAccount()

  useEffect(() => {
    if (isConnected && address) {
      const state = {
        account: address,
        chainId: 1, // Will be updated by content script polling
        connectedAt: Date.now()
      }
      localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(state))
      window.dispatchEvent(new CustomEvent('wallet-state-changed', { detail: state }))
    } else {
      localStorage.removeItem(WALLET_STORAGE_KEY)
      window.dispatchEvent(new CustomEvent('wallet-state-changed', { detail: null }))
    }
  }, [address, isConnected])

  return { address, isConnected }
}
