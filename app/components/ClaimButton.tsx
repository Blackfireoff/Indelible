'use client'

import { Button } from '@heroui/react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useAppKitAccount } from '@reown/appkit/react'

// TODO: Replace with your actual deployed DailyClaim contract address
const CLAIM_CONTRACT_ADDRESS = '0x1234567890123456789012345678901234567890'

const claimAbi = [
  {
    type: 'function',
    name: 'claim',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

export default function ClaimButton() {
  const { isConnected, address } = useAppKitAccount()

  const { data: hash, isPending, writeContract, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })

  const handleClaim = () => {
    writeContract({
      address: CLAIM_CONTRACT_ADDRESS,
      abi: claimAbi,
      functionName: 'claim',
    })
  }

  // Do not show the claim button if they are not fully connected
  if (!isConnected) {
    return null
  }

  const isLoading = isPending || isConfirming

  const getErrorMessage = () => {
    if (!error) return null
    const errStr = error.message.toLowerCase()
    if (errStr.includes('alreadyclaimed')) return 'You already claimed your tokens today.'
    return errStr
  }

  return (
    <div className="relative group flex items-center">
      <Button
        onPress={handleClaim}
        isDisabled={isLoading || isConfirmed}
        className={`h-10 px-6 rounded-xl bg-gradient-to-r from-[var(--landing-primary)] to-[var(--landing-primary-dark)] text-[var(--landing-bg-white)] font-medium text-[14px] cursor-pointer shadow-sm ${isLoading ? 'opacity-50 cursor-not-allowed' : 'disabled:opacity-50'}`}
      >
        {isConfirmed ? 'Claimed!' : isLoading ? 'Claiming...' : 'Claim 3 INDL'}
      </Button>

      {error && (
        <div className="absolute top-full mt-2 right-0 w-max bg-red-100 text-red-600 text-[12px] px-3 py-1.5 rounded-lg border border-red-200 shadow-sm z-10">
          {getErrorMessage()}
        </div>
      )}
    </div>
  )
}
