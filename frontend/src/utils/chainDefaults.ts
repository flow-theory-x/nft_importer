// Chain-specific default contract addresses from environment variables

export interface ChainDefaults {
  importerAddress: string
  nftAddress: string
  tbaRegistry: string
  tbaImplementation: string
}

export const getChainDefaults = (chainId: number): ChainDefaults => {
  switch (chainId) {
    case parseInt(import.meta.env.VITE_PRIVATE_CHAIN_ID || '21201'):
      return {
        importerAddress: import.meta.env.VITE_PRIVATE_IMPORTER_ADDRESS || '',
        nftAddress: import.meta.env.VITE_PRIVATE_NFT_ADDRESS || '',
        tbaRegistry: import.meta.env.VITE_PRIVATE_TBA_REGISTRY || '',
        tbaImplementation: import.meta.env.VITE_PRIVATE_TBA_IMPLEMENTATION || ''
      }
    
    case parseInt(import.meta.env.VITE_ETHEREUM_CHAIN_ID || '1'):
      return {
        importerAddress: import.meta.env.VITE_ETHEREUM_IMPORTER_ADDRESS || '',
        nftAddress: import.meta.env.VITE_ETHEREUM_NFT_ADDRESS || '',
        tbaRegistry: import.meta.env.VITE_ETHEREUM_TBA_REGISTRY || '0x63c8A3536E4A647D48fC0076D442e3243f7e773b',
        tbaImplementation: import.meta.env.VITE_ETHEREUM_TBA_IMPLEMENTATION || '0xa8a05744C04c7AD0D31Fcee368aC18040832F1c1'
      }
    
    case parseInt(import.meta.env.VITE_POLYGON_CHAIN_ID || '137'):
      return {
        importerAddress: import.meta.env.VITE_POLYGON_IMPORTER_ADDRESS || '',
        nftAddress: import.meta.env.VITE_POLYGON_NFT_ADDRESS || '',
        tbaRegistry: import.meta.env.VITE_POLYGON_TBA_REGISTRY || '0x63c8A3536E4A647D48fC0076D442e3243f7e773b',
        tbaImplementation: import.meta.env.VITE_POLYGON_TBA_IMPLEMENTATION || '0xa8a05744C04c7AD0D31Fcee368aC18040832F1c1'
      }
    
    default:
      // Default fallback for unknown chains
      return {
        importerAddress: '',
        nftAddress: '',
        tbaRegistry: '0x63c8A3536E4A647D48fC0076D442e3243f7e773b',
        tbaImplementation: '0xa8a05744C04c7AD0D31Fcee368aC18040832F1c1'
      }
  }
}

export const getChainDisplayName = (chainId: number): string => {
  switch (chainId) {
    case 21201:
      return 'Private Chain'
    case 1:
      return 'Ethereum Mainnet'
    case 137:
      return 'Polygon'
    default:
      return `Chain ${chainId}`
  }
}

export const isKnownChain = (chainId: number): boolean => {
  return [21201, 1, 137].includes(chainId)
}