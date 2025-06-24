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