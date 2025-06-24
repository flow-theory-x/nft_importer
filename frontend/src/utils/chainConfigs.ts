export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: string;
}

export const PRESET_CHAINS: ChainConfig[] = [
  {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://ethereum.blockpi.network/v1/rpc/public',
    nativeCurrency: 'ETH'
  },
  {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: 'https://polygon-rpc.com',
    nativeCurrency: 'MATIC'
  },
  {
    chainId: 42161,
    name: 'Arbitrum',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    nativeCurrency: 'ETH'
  },
  {
    chainId: 10,
    name: 'Optimism',
    rpcUrl: 'https://mainnet.optimism.io',
    nativeCurrency: 'ETH'
  },
  {
    chainId: 21201,
    name: 'Private Chain',
    rpcUrl: 'https://bc.bon-soleil.com:8080',
    nativeCurrency: 'PRIV'
  }
]