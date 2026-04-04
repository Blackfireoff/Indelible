'use client'

import { useState } from 'react'
import { useAccount, useReadContract, useWaitForTransactionReceipt, useBalance } from 'wagmi'
import { useAppKitProvider, useAppKit } from '@reown/appkit/react'
import { parseUnits, formatEther, numberToHex } from 'viem'
import { sepolia } from 'wagmi/chains'
import { Button } from '@heroui/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCoins } from '@fortawesome/free-solid-svg-icons'

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
  const { address, isConnected } = useAccount()
  const { data: balanceData } = useBalance({ address })
  const { walletProvider } = useAppKitProvider('eip155')
  const { open } = useAppKit()
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null)

  const [customHash, setCustomHash] = useState<`0x${string}` | undefined>(undefined)
  const [isPending, setIsPending] = useState(false)
  const [errorObj, setErrorObj] = useState<Error | null>(null)

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

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: customHash,
  })

  // Handlers
  const handleBuy = async () => {
    if (!selectedPackage || ethPrice === BigInt(0)) return
    const pkg = PACKAGES.find(p => p.id === selectedPackage)
    if (!pkg) return

    const ethReq = getEthRequired(pkg.indl)
    if (ethReq === BigInt(0) || !address || !walletProvider) return

    // Check if user has enough ETH for the transaction
    if (balanceData && balanceData.value < ethReq) {
      // Open AppKit to explicitly let the user purchase or swap for ETH
      open({ view: 'OnRampProviders' })
      return
    }

    setIsPending(true)
    setErrorObj(null)
    setCustomHash(undefined)

    try {
      const txHash = await (walletProvider as any).request({
        method: 'eth_sendTransaction',
        params: [{
          from: address,
          to: TOKEN_SALE_ADDRESS,
          value: numberToHex(ethReq)
        }]
      })
      setCustomHash(txHash as `0x${string}`)
    } catch (err: any) {
      console.error('Provider Request Error:', err)
      setErrorObj(err)
    } finally {
      setIsPending(false)
    }
  }

  const handleAddToken = async () => {
    if (!walletProvider) return
    try {
      await (walletProvider as any).request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: '0x230c1F84e14E355760c158f94D42d6Ef81a4D35f',
            symbol: 'INDL',
            decimals: 18,
            image: window.location.origin + '/logo/circle.svg',
          },
        },
      })
    } catch (error) {
      console.error('Failed to add token to wallet', error)
    }
  }

  const isLoading = isPending || isConfirming

  const getErrorMessage = () => {
    if (!errorObj) return null
    return errorObj.message?.split('\n')[0] || 'Unknown error occurred'
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-[var(--landing-text-primary)] mb-4">Get requests to use <em className="italic" style={{ textDecorationLine: 'underline', textDecorationColor: 'var(--accent-color)', textDecorationThickness: '3px', textUnderlineOffset: '6px' }}>INDELIBLE.</em></h1>
        <p className="text-[var(--landing-text-secondary)] mt-2 text-lg">Choose a package below. Don&apos;t have ETH yet? No worries — we&apos;ll help you purchase some first, then you can use it to buy your requests.</p>
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
              className={`cursor-pointer relative flex flex-col items-center p-6 rounded-2xl border-2 transition-all text-left ${isSelected
                ? 'border-[var(--accent-color)] bg-[var(--accent-color-light)] shadow-[0_0_20px_rgba(255,211,33,0.35),0_0_40px_rgba(255,211,33,0.15)]'
                : 'border-[var(--landing-border)] bg-[var(--landing-bg-white)] hover:border-gray-300'
                }`}
            >
              {isSelected && (
                <div className="absolute -top-3 bg-[var(--accent-color-dark)] text-white text-[11px] font-bold px-3 py-1 rounded-full">
                  SELECTED
                </div>
              )}
              <h3 className="text-xl font-bold text-[var(--landing-text-primary)]">{pkg.name}</h3>
              <div className="flex items-baseline gap-1 mt-2">
                <span className="text-4xl font-extrabold text-[var(--landing-text-primary)]">{pkg.indl.toString()}</span>
                <span className="text-lg font-semibold text-[var(--landing-text-secondary)]">REQUESTS</span>
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
        <h3 className="text-[16px] font-semibold text-[var(--landing-text-primary)] text-center mb-4">Checkout</h3>

        {!selectedPackage ? (
          <div className="text-center p-3 text-[14px] font-medium text-[var(--landing-text-secondary)] bg-gray-50 rounded-xl border border-gray-200">
            Select a package above to continue.
          </div>
        ) : !isConnected ? (
          <div className="flex flex-col gap-2">
            <Button
              onPress={() => open()}
              className="w-full h-12 rounded-xl bg-[var(--landing-primary-darker)] hover:bg-[var(--landing-primary-dark)] text-white font-semibold text-[16px] shadow-sm cursor-pointer"
            >
              Connect Wallet
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              onPress={handleBuy}
              isDisabled={isLoading || ethPrice === BigInt(0) || isConfirmed}
              className={`w-full h-12 rounded-xl bg-[var(--landing-primary-darker)] hover:bg-[var(--landing-primary-dark)] text-white font-semibold text-[16px] shadow-sm
                ${(isLoading || ethPrice === BigInt(0)) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--landing-primary-dark)] cursor-pointer'} 
              `}
            >
              {isConfirmed ? 'Purchase Successful!' : isLoading ? 'Processing Transaction...' : 'Confirm Purchase'}
            </Button>

            {errorObj && (
              <div className="p-3 text-[12px] text-red-600 bg-red-50 rounded-xl border border-red-100 mt-2">
                {getErrorMessage()}
              </div>
            )}

            {isConfirmed && customHash && (
              <div className="text-center text-[13px] text-green-600 mt-2">
                Transaction completed successfully!
              </div>
            )}
          </div>
        )}
      </div>

      {/* INDL Description & Add to Wallet */}
      <div className="max-w-lg w-full mx-auto border border-[var(--landing-primary-light)] rounded-2xl p-8" style={{
        background: 'linear-gradient(167.8deg, var(--landing-primary-subtle) 0%, rgba(3, 105, 209, 0.05) 100%)'
      }}>
        <div className="flex items-center gap-4 mb-5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--landing-primary-darker)] to-[var(--landing-primary-dark)] flex items-center justify-center shrink-0">
            <FontAwesomeIcon icon={faCoins} className="w-6 h-6 text-white" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-[18px] font-semibold leading-[28px] text-[var(--landing-text-primary)]" style={{ textDecorationLine: 'underline', textDecorationColor: 'var(--accent-color-dark)', textDecorationThickness: '3px', textUnderlineOffset: '6px' }}>About INDL Token</h3>
            <span className="px-2 py-0.5 rounded-full bg-[var(--accent-color-light)] border border-[var(--accent-color-dark)] text-[var(--accent-color-dark)] text-[11px] font-bold uppercase tracking-wide">
              Optional
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 mb-6">
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-[var(--landing-primary-dark)] flex items-center justify-center shrink-0">
              <span className="text-[16px] font-semibold text-white">1</span>
            </div>
            <div className="flex-1">
              <h4 className="text-[16px] font-semibold leading-[24px] text-[var(--landing-text-primary)] mb-1">
                Automatic Tracking
              </h4>
              <p className="text-[14px] leading-[20px] text-[var(--landing-text-secondary)]">
                INDL is the utility token powering your activity. <strong className="text-[var(--landing-text-primary)] font-semibold">You do not need to add it to your wallet manually</strong> — our app tracks your balance automatically.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-[var(--landing-primary-dark)] flex items-center justify-center shrink-0">
              <span className="text-[16px] font-semibold text-white">2</span>
            </div>
            <div className="flex-1">
              <h4 className="text-[16px] font-semibold leading-[24px] text-[var(--landing-text-primary)] mb-1">
                Optional Wallet Pin
              </h4>
              <p className="text-[14px] leading-[20px] text-[var(--landing-text-secondary)]">
                If you want to view your INDL balance directly inside your wallet software, you can optionally pin it using the button below.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={isConnected ? handleAddToken : undefined}
          disabled={!isConnected}
          className={`w-full h-12 rounded-xl font-semibold text-[14px] transition-all
            ${isConnected
              ? 'bg-[var(--landing-primary-dark)] hover:bg-[var(--landing-primary)] text-white cursor-pointer shadow-sm'
              : 'bg-[var(--landing-bg-light)] border border-[var(--landing-border)] text-[var(--landing-text-muted)] cursor-not-allowed'
            }
          `}
        >
          Add INDL to Wallet
        </button>
      </div>
    </div>
  )
}
