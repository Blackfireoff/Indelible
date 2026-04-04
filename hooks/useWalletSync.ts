'use client'

import { useEffect } from 'react'
import { useAppKitAccount } from '@reown/appkit/react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'

const WALLET_STORAGE_KEY = 'indelible_wallet_state'
const INDL_TOKEN_ADDRESS = '0x230c1F84e14E355760c158f94D42d6Ef81a4D35f' as `0x${string}`

export function useWalletSync() {
  const { address, isConnected } = useAppKitAccount()
  const { address: wagmiAddress } = useAccount()

  // Read INDL balance — same call as NavBar.tsx
  const { data: balanceData } = useReadContract({
    address: INDL_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: wagmiAddress ? [wagmiAddress] : undefined,
    query: {
      enabled: isConnected && !!wagmiAddress,
    }
  })

  useEffect(() => {
    if (isConnected && address) {
      const indlBalance = balanceData !== undefined
        ? Math.floor(Number(formatUnits(balanceData, 18)))
        : 0

      const state = {
        account: address,
        chainId: 1,
        indlBalance,
        connectedAt: Date.now()
      }
      localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(state))
      window.dispatchEvent(new CustomEvent('wallet-state-changed', { detail: state }))
    } else {
      localStorage.removeItem(WALLET_STORAGE_KEY)
      window.dispatchEvent(new CustomEvent('wallet-state-changed', { detail: null }))
    }
  }, [address, isConnected, balanceData])

  return { address, isConnected }
}
