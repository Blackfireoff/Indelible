'use client'

import { useState } from 'react'
import { useAccount, useReadContract, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, formatEther } from 'viem'
import { Button } from '@heroui/react'

// TODO: Ensure this is the TokenSale contract address, not just the ERC20 Token address.
const TOKEN_SALE_ADDRESS = '0x4625ab479D4645A4d96D18A5DAe05b0537c247D3' as `0x${string}`

const tokenSaleAbi = [
  {
    type: 'function',
    name: 'getEthPrice',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'int256' }],
  }
] as const

const PACKAGES = [
  { id: 'starter', name: 'Starter', indl: BigInt(10), desc: 'Perfect to test it out' },
  { id: 'pro', name: 'Pro', indl: BigInt(50), desc: 'Best value for daily use' },
  { id: 'whale', name: 'Whale', indl: BigInt(100), desc: 'For power users' },
]

export default function GetTokenClient() {
  const { isConnected } = useAccount()
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null)

  // Read ETH price from contract
  const { data: ethPriceRaw } = useReadContract({
    address: TOKEN_SALE_ADDRESS,
    abi: tokenSaleAbi,
    functionName: 'getEthPrice',
  })

  const ethPrice = ethPriceRaw ? BigInt(ethPriceRaw) : BigInt(0)

  const getEthRequired = (indlAmount: bigint) => {
    if (ethPrice === BigInt(0)) return BigInt(0)
    // INDL is 18 decimals, Chainlink ETH price is 8 decimals
    // 1 INDL = 1 USD (100 cents fixed in contract)
    const targetIndlWei = parseUnits(indlAmount.toString(), 18)
    return (targetIndlWei * BigInt(100000000)) / ethPrice
  }

  // Send transaction hook
  const {
    data: hash,
    isPending,
    sendTransaction,
    error
  } = useSendTransaction()

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  })

  // Handlers
  const handleBuy = () => {
    if (!selectedPackage || ethPrice === BigInt(0)) return
    const pkg = PACKAGES.find(p => p.id === selectedPackage)
    if (!pkg) return

    const ethReq = getEthRequired(pkg.indl)
    if (ethReq === BigInt(0)) return

    sendTransaction({
      to: TOKEN_SALE_ADDRESS,
      value: ethReq,
    })
  }

  const isLoading = isPending || isConfirming

  const getErrorMessage = () => {
    if (!error) return null
    return error.message.split('\\n')[0]
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-[var(--landing-text-primary)]">Get INDL Tokens</h1>
        <p className="text-[var(--landing-text-secondary)] mt-2 text-lg">Choose a package to top up your account. Conversions are calculated automatically from live rates.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PACKAGES.map((pkg) => {
          const isSelected = selectedPackage === pkg.id
          const ethReq = getEthRequired(pkg.indl)
          const displayEth = ethReq > BigInt(0) ? Number(formatEther(ethReq)).toFixed(5) : '...'

          return (
            <button
              key={pkg.id}
              onClick={() => setSelectedPackage(pkg.id)}
              className={`relative flex flex-col items-center p-6 rounded-2xl border-2 transition-all text-left ${isSelected
                ? 'border-[var(--landing-primary)] bg-[var(--landing-primary-subtle)] shadow-md'
                : 'border-[var(--landing-border)] bg-[var(--landing-bg-white)] hover:border-gray-300'
                }`}
            >
              {isSelected && (
                <div className="absolute -top-3 bg-[var(--landing-primary)] text-white text-[11px] font-bold px-3 py-1 rounded-full">
                  SELECTED
                </div>
              )}
              <h3 className="text-xl font-bold text-[var(--landing-text-primary)]">{pkg.name}</h3>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-4xl font-extrabold text-[var(--landing-text-primary)]">{pkg.indl.toString()}</span>
                <span className="text-lg font-semibold text-[var(--landing-text-secondary)]">INDL</span>
              </div>
              <p className="text-[13px] text-[var(--landing-text-muted)] mt-2 text-center h-10">{pkg.desc}</p>

              <div className="w-full mt-4 pt-4 border-t border-[var(--landing-border)]">
                <div className="flex justify-between items-center w-full">
                  <span className="text-[14px] text-[var(--landing-text-secondary)]">Cost</span>
                  <div className="flex flex-col items-end">
                    <span className="text-[16px] font-bold text-[var(--landing-primary)]">
                      ${ethPrice > BigInt(0) && ethReq > BigInt(0) ? (Number(formatEther(ethReq)) * (Number(ethPrice) / 1e8)).toFixed(2) : '0.00'} USD
                    </span>
                    <span className="text-[12px] font-medium text-[var(--landing-text-muted)]">
                      ~ {displayEth} ETH
                    </span>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="max-w-lg w-full mx-auto bg-[var(--landing-bg-white)] border border-[var(--landing-border)] rounded-2xl p-6 shadow-sm">
        <h3 className="text-[16px] font-semibold text-[var(--landing-text-primary)] mb-4">Checkout</h3>

        {!isConnected ? (
          <div className="text-center p-3 text-[14px] font-medium text-orange-600 bg-orange-50 rounded-xl border border-orange-200">
            Please connect your wallet from the navigation bar to purchase tokens.
          </div>
        ) : !selectedPackage ? (
          <div className="text-center p-3 text-[14px] font-medium text-[var(--landing-text-secondary)] bg-gray-50 rounded-xl border border-gray-200">
            Select a package above to continue.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              onPress={handleBuy}
              isDisabled={isLoading || ethPrice === BigInt(0) || isConfirmed}
              className={`w-full h-12 rounded-xl bg-[var(--landing-primary)] text-white font-semibold text-[16px] shadow-sm
                ${(isLoading || ethPrice === BigInt(0)) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--landing-primary-dark)] cursor-pointer'} 
              `}
            >
              {isConfirmed ? 'Purchase Successful!' : isLoading ? 'Processing Transaction...' : 'Confirm Purchase'}
            </Button>

            {error && (
              <div className="p-3 text-[12px] text-red-600 bg-red-50 rounded-xl border border-red-100 mt-2">
                {getErrorMessage()}
              </div>
            )}

            {isConfirmed && hash && (
              <div className="text-center text-[13px] text-green-600 mt-2">
                Transaction completed successfully!
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
