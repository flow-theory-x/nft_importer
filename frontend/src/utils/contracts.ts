import { ethers } from 'ethers'
import type { ChainConfig } from './chainConfigs'

export const getProvider = (chainConfig: ChainConfig) => {
  return new ethers.JsonRpcProvider(chainConfig.rpcUrl)
}

export const validateContractAddress = (address: string): boolean => {
  try {
    return ethers.isAddress(address)
  } catch {
    return false
  }
}

export const connectToNFTContract = async (address: string, chainConfig: ChainConfig) => {
  if (!validateContractAddress(address)) {
    throw new Error('Invalid contract address')
  }

  const provider = getProvider(chainConfig)
  
  // Multiple ABIs to try for different contract types
  const testABIs = [
    // Standard ERC-721
    ['function name() view returns (string)', 'function symbol() view returns (string)'],
    // ERC-721 Enumerable
    ['function totalSupply() view returns (uint256)', 'function tokenByIndex(uint256) view returns (uint256)'],
    // Basic ownership check
    ['function ownerOf(uint256) view returns (address)'],
    // Minimal contract check
    ['function balanceOf(address) view returns (uint256)']
  ]

  let contractInfo = { name: 'Unknown', symbol: 'Unknown', isValid: false }

  // Test if contract exists by checking code
  try {
    const code = await provider.getCode(address)
    if (code === '0x') {
      throw new Error('No contract found at this address')
    }
  } catch (error) {
    throw new Error('Cannot access contract at this address')
  }

  // Try different methods to get contract info
  for (const abi of testABIs) {
    try {
      const contract = new ethers.Contract(address, abi, provider)
      
      // Try to get name and symbol if available
      if (abi.includes('function name() view returns (string)')) {
        try {
          contractInfo.name = await contract.name()
          contractInfo.symbol = await contract.symbol()
          contractInfo.isValid = true
          break
        } catch {
          // Continue to next test
        }
      }
      
      // Try totalSupply as fallback
      if (abi.includes('function totalSupply() view returns (uint256)')) {
        try {
          const totalSupply = await contract.totalSupply()
          contractInfo.name = `Contract (${totalSupply.toString()} tokens)`
          contractInfo.symbol = 'NFT'
          contractInfo.isValid = true
          break
        } catch {
          // Continue to next test
        }
      }
      
      // Try ownerOf as fallback
      if (abi.includes('function ownerOf(uint256) view returns (address)')) {
        try {
          await contract.ownerOf(1) // Test with token ID 1
          contractInfo.name = 'NFT Contract'
          contractInfo.symbol = 'NFT'
          contractInfo.isValid = true
          break
        } catch {
          // Continue to next test
        }
      }
      
    } catch {
      // Continue to next ABI
    }
  }

  if (!contractInfo.isValid) {
    throw new Error('Contract found but does not appear to be a valid NFT contract')
  }

  return contractInfo
}

export interface NFTMetadata {
  name: string
  description: string
  image: string
  attributes?: Array<{
    trait_type: string
    value: string | number
  }>
}

export const getNFTMetadata = async (
  contractAddress: string,
  tokenId: number,
  chainConfig: ChainConfig
): Promise<NFTMetadata> => {
  if (!validateContractAddress(contractAddress)) {
    throw new Error('Invalid contract address')
  }

  const provider = getProvider(chainConfig)
  const abi = ['function tokenURI(uint256) view returns (string)']
  
  try {
    const contract = new ethers.Contract(contractAddress, abi, provider)
    const tokenURI = await contract.tokenURI(tokenId)
    
    let metadataUrl = tokenURI
    if (tokenURI.startsWith('ipfs://')) {
      metadataUrl = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/')
    }
    
    const response = await fetch(metadataUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.statusText}`)
    }
    
    const metadata: NFTMetadata = await response.json()
    
    if (metadata.image && metadata.image.startsWith('ipfs://')) {
      metadata.image = metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')
    }
    
    return metadata
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get NFT metadata: ${error.message}`)
    }
    throw new Error('Failed to get NFT metadata: Unknown error')
  }
}

export const getTotalSupply = async (
  contractAddress: string,
  chainConfig: ChainConfig
): Promise<number> => {
  if (!validateContractAddress(contractAddress)) {
    throw new Error('Invalid contract address')
  }

  const provider = getProvider(chainConfig)
  const abi = ['function totalSupply() view returns (uint256)']
  
  try {
    const contract = new ethers.Contract(contractAddress, abi, provider)
    const totalSupply = await contract.totalSupply()
    return parseInt(totalSupply.toString())
  } catch (error) {
    throw new Error('Failed to get total supply. Contract may not support totalSupply()')
  }
}

export const getNFTMetadataBatch = async (
  contractAddress: string,
  tokenIds: number[],
  chainConfig: ChainConfig
): Promise<Array<{ tokenId: number; metadata: NFTMetadata | null; error?: string }>> => {
  if (!validateContractAddress(contractAddress)) {
    throw new Error('Invalid contract address')
  }

  const results = await Promise.allSettled(
    tokenIds.map(async (tokenId) => {
      try {
        const metadata = await getNFTMetadata(contractAddress, tokenId, chainConfig)
        return { tokenId, metadata }
      } catch (error) {
        return { 
          tokenId, 
          metadata: null, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        }
      }
    })
  )

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value
    } else {
      return {
        tokenId: tokenIds[index],
        metadata: null,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
      }
    }
  })
}

export const getNFTOwner = async (
  contractAddress: string,
  tokenId: number,
  chainConfig: ChainConfig
): Promise<string> => {
  if (!validateContractAddress(contractAddress)) {
    throw new Error('Invalid contract address')
  }

  const provider = getProvider(chainConfig)
  const abi = ['function ownerOf(uint256) view returns (address)']
  
  try {
    const contract = new ethers.Contract(contractAddress, abi, provider)
    const owner = await contract.ownerOf(tokenId)
    return owner
  } catch (error) {
    throw new Error('Failed to get NFT owner. Token may not exist.')
  }
}

export const getNFTCreator = async (
  contractAddress: string,
  tokenId: number,
  chainConfig: ChainConfig
): Promise<string | null> => {
  if (!validateContractAddress(contractAddress)) {
    throw new Error('Invalid contract address')
  }

  const provider = getProvider(chainConfig)
  
  // Try getTokenCreator(id) first
  try {
    const abi1 = ['function getTokenCreator(uint256) view returns (address)']
    const contract1 = new ethers.Contract(contractAddress, abi1, provider)
    const creator = await contract1.getTokenCreator(tokenId)
    if (creator && creator !== '0x0000000000000000000000000000000000000000') {
      return creator
    }
  } catch (error) {
    console.log('getTokenCreator not available:', error.message)
  }

  // Try _creator() if getTokenCreator fails
  try {
    const abi2 = ['function _creator() view returns (address)']
    const contract2 = new ethers.Contract(contractAddress, abi2, provider)
    const creator = await contract2._creator()
    if (creator && creator !== '0x0000000000000000000000000000000000000000') {
      return creator
    }
  } catch (error) {
    console.log('_creator not available:', error.message)
  }

  // Fallback to _owner if both getTokenCreator and _creator fail
  try {
    const abi3 = ['function _owner() view returns (address)']
    const contract3 = new ethers.Contract(contractAddress, abi3, provider)
    const owner = await contract3._owner()
    if (owner && owner !== '0x0000000000000000000000000000000000000000') {
      return owner
    }
  } catch (error) {
    console.log('_owner not available:', error.message)
  }

  return null
}

const TBA_REGISTRY_ADDRESS = '0x63c8A3536E4A647D48fC0076D442e3243f7e773b'
const TBA_ACCOUNT_IMPLEMENTATION = '0xa8a05744C04c7AD0D31Fcee368aC18040832F1c1'

export const isTBA = async (
  address: string,
  chainConfig: ChainConfig
): Promise<boolean> => {
  try {
    const provider = getProvider(chainConfig)
    
    // First check if it's a contract (TBA must be a contract)
    const code = await provider.getCode(address)
    if (code === '0x') {
      return false // EOA cannot be TBA
    }
    
    // Try to call the token() function which is specific to TBA accounts
    const tbaAbi = [
      'function token() view returns (uint256, address, uint256)'
    ]
    
    try {
      const contract = new ethers.Contract(address, tbaAbi, provider)
      const tokenInfo = await contract.token()
      
      // If we can successfully call token() and get valid data, it's likely a TBA
      if (tokenInfo && tokenInfo.length === 3) {
        const [chainId, tokenContract, tokenId] = tokenInfo
        // Additional validation: check if the returned data makes sense
        return chainId > 0 && ethers.isAddress(tokenContract) && tokenId >= 0
      }
    } catch (error) {
      // If token() call fails, fall back to implementation code comparison
      const implementationCode = await provider.getCode(TBA_ACCOUNT_IMPLEMENTATION)
      if (code === implementationCode) {
        return true
      }
    }
    
    return false
  } catch (error) {
    console.warn('Failed to check if address is TBA:', error)
    return false
  }
}

export const isSBT = async (
  contractAddress: string,
  tokenId: number,
  chainConfig: ChainConfig
): Promise<boolean> => {
  try {
    const provider = getProvider(chainConfig)
    
    // Try _sbtFlag(id) first
    try {
      const sbtFlagAbi = ['function _sbtFlag(uint256) view returns (bool)']
      const contract = new ethers.Contract(contractAddress, sbtFlagAbi, provider)
      const isSBTFlag = await contract._sbtFlag(tokenId)
      return isSBTFlag
    } catch (error) {
      // If _sbtFlag fails, try _lockedTokens(id)
      try {
        const lockedTokensAbi = ['function _lockedTokens(uint256) view returns (bool)']
        const contract = new ethers.Contract(contractAddress, lockedTokensAbi, provider)
        const isLocked = await contract._lockedTokens(tokenId)
        return isLocked
      } catch (error) {
        // Neither function is available
        return false
      }
    }
  } catch (error) {
    console.warn('Failed to check if token is SBT:', error)
    return false
  }
}

export const isEOA = async (
  address: string,
  chainConfig: ChainConfig
): Promise<boolean> => {
  try {
    const provider = getProvider(chainConfig)
    const code = await provider.getCode(address)
    // EOA has no code (returns '0x'), contracts have code
    return code === '0x'
  } catch (error) {
    console.warn('Failed to check if address is EOA:', error)
    return false
  }
}

export interface NFTOwnershipInfo {
  owner: string
  creator: string | null
}

export const getNFTOwnershipInfo = async (
  contractAddress: string,
  tokenId: number,
  chainConfig: ChainConfig
): Promise<NFTOwnershipInfo> => {
  try {
    const [owner, creator] = await Promise.all([
      getNFTOwner(contractAddress, tokenId, chainConfig),
      getNFTCreator(contractAddress, tokenId, chainConfig)
    ])
    
    return { owner, creator }
  } catch (error) {
    throw error
  }
}