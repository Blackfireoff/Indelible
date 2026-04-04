import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { sepolia, mainnet } from '@reown/appkit/networks'
import type { AppKitNetwork } from '@reown/appkit/networks'

export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || 'b56e18d47c72ab683b10814fe9495694'

export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  sepolia, mainnet
]

const globalAny = globalThis as any;

if (!globalAny.__wagmi_adapter__) {
  globalAny.__wagmi_adapter__ = new WagmiAdapter({
    networks,
    projectId,
    ssr: true,
  });
}
export const wagmiAdapter: WagmiAdapter = globalAny.__wagmi_adapter__;

export const metadata = {
  name: 'Indelible',
  description: 'Indelible. - Making political discourse transparent and accessible',
  url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  icons: ['/logo/small.svg']
}
