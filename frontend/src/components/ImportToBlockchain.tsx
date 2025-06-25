import React, { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import type { ChainConfig } from '../utils/chainConfigs'
import { getChainDefaults } from '../utils/chainDefaults'

interface ImportedNFT {
  tokenId: string
  tokenURI?: string | null
  owner?: string | null
  creator?: string | null
  isTBA: boolean
  isSBT: boolean
  tbaSourceToken?: string | null
  contractAddress: string
  chainId: number
  originalTokenInfo: string
  isAlreadyImported?: boolean
}

interface ImportToBlockchainProps {
  importedNFTs: ImportedNFT[]
  selectedChain: ChainConfig | null
  walletChainId: number | null
  onImportComplete: (results: ImportResult[]) => void
}

interface ImportResult {
  originalTokenInfo: string
  success: boolean
  transactionHash?: string
  newTokenId?: number
  error?: string
}

// JSONDataImporter contract ABI (essential functions only)
const JSON_DATA_IMPORTER_ABI = [
  'function importSingleToken(address targetNFT, string memory tokenURI, address to, address creator, bool isSBT, string memory originalTokenInfo, uint16 royaltyRate) external payable returns (uint256)',
  'function importSingleTokenWithTBA(address targetNFT, string memory tokenURI, address to, address creator, bool isSBT, string memory originalTokenInfo, uint16 royaltyRate, string memory tbaSourceToken, address registry, address implementation) external payable returns (uint256)',
  'function importBatch(address targetNFT, tuple(string tokenURI, address to, address creator, bool isSBT, string originalTokenInfo, uint16 royaltyRate, string tbaSourceToken)[] memory imports) external payable returns (uint256[])',
  'function importBatchWithTBA(address targetNFT, tuple(string tokenURI, address to, address creator, bool isSBT, string originalTokenInfo, uint16 royaltyRate, string tbaSourceToken)[] memory imports, address registry, address implementation) external payable returns (uint256[])',
  'function validateImportData(address targetNFT, string memory tokenURI, address to, address creator, bool isSBT, string memory originalTokenInfo, uint16 royaltyRate) external view returns (bool isValid, string memory reason)',
  'function validateBatch(address targetNFT, tuple(string tokenURI, address to, address creator, bool isSBT, string originalTokenInfo, uint16 royaltyRate, string tbaSourceToken)[] memory imports) external view returns (bool[] memory validResults, string[] memory reasons)',
  'function isTokenImported(string memory originalTokenInfo) external view returns (bool)',
  'function getImportStats(address importer) external view returns (tuple(uint256 totalImported, uint256 totalFailed, uint256 lastImportTime))'
]

// DonatableNFT contract ABI for TBA source checking
const DONATABLE_NFT_ABI = [
  {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "_originalTokenInfo",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "ownerOf",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]

// TBA Registry ABI - correct version from nftstore
const TBA_REGISTRY_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "implementation",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "tokenContract",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "salt",
        "type": "uint256"
      }
    ],
    "name": "account",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "implementation",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "tokenContract",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "salt",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "initData",
        "type": "bytes"
      }
    ],
    "name": "createAccount",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
]

const ImportToBlockchain: React.FC<ImportToBlockchainProps> = ({
  importedNFTs,
  selectedChain,
  walletChainId,
  onImportComplete
}) => {
  const [selectedNFTs, setSelectedNFTs] = useState<Set<string>>(new Set())
  const [isImporting, setIsImporting] = useState(false)
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  const [gasEstimate, setGasEstimate] = useState<string>('')
  const [importerContractAddress, setImporterContractAddress] = useState('')
  const [targetNFTContract, setTargetNFTContract] = useState('')
  const [tbaRegistry, setTbaRegistry] = useState('0x63c8A3536E4A647D48fC0076D442e3243f7e773b') // Default TBA registry
  const [tbaImplementation, setTbaImplementation] = useState('0xa8a05744C04c7AD0D31Fcee368aC18040832F1c1') // Default TBA implementation
  const [walletConnected, setWalletConnected] = useState(false)
  const [currentAccount, setCurrentAccount] = useState<string>('')
  const [authorizationStatus, setAuthorizationStatus] = useState<string>('')
  const [customGasLimit, setCustomGasLimit] = useState<string>('')
  const [metadataCache, setMetadataCache] = useState<Map<string, { name?: string; image?: string }>>(new Map())
  const [nftsWithImportStatus, setNftsWithImportStatus] = useState<ImportedNFT[]>([])

  // Check wallet connection on mount
  useEffect(() => {
    checkWalletConnection()
  }, [])

  // Set default values based on wallet chain ID
  useEffect(() => {
    if (walletChainId) {
      const defaults = getChainDefaults(walletChainId)
      setImporterContractAddress(defaults.importerAddress)
      setTargetNFTContract(defaults.nftAddress)
      setTbaRegistry(defaults.tbaRegistry)
      setTbaImplementation(defaults.tbaImplementation)
    }
  }, [walletChainId])

  // Initialize NFTs with import status
  useEffect(() => {
    setNftsWithImportStatus(importedNFTs)
  }, [importedNFTs])

  // Fetch metadata for all NFTs when they are imported
  useEffect(() => {
    const fetchAllMetadata = async () => {
      const newCache = new Map(metadataCache)
      
      for (const nft of importedNFTs) {
        if (nft.tokenURI && !newCache.has(nft.originalTokenInfo)) {
          const metadata = await fetchMetadata(nft.tokenURI)
          newCache.set(nft.originalTokenInfo, metadata)
        }
      }
      
      setMetadataCache(newCache)
    }
    
    fetchAllMetadata()
  }, [importedNFTs])

  const checkWalletConnection = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        if (accounts.length > 0) {
          setWalletConnected(true)
          setCurrentAccount(accounts[0])
        }
      } catch (error) {
        console.error('Failed to check wallet connection:', error)
      }
    }
  }

  // Fetch metadata from tokenURI
  const fetchMetadata = async (tokenURI: string): Promise<{ name?: string; image?: string }> => {
    if (!tokenURI) return {}
    
    try {
      // Convert IPFS URL if needed
      let metadataUrl = tokenURI
      if (tokenURI.startsWith('ipfs://')) {
        metadataUrl = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/')
      }
      
      const response = await fetch(metadataUrl)
      const metadata = await response.json()
      
      // Convert IPFS image URL if needed
      let imageUrl = metadata.image
      if (imageUrl && imageUrl.startsWith('ipfs://')) {
        imageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/')
      }
      
      return {
        name: metadata.name,
        image: imageUrl
      }
    } catch (error) {
      console.error('Failed to fetch metadata:', error)
      return {}
    }
  }

  // Check if TBA source token exists in target contract
  const checkTBASourceToken = async (tbaSourceToken: string) => {
    if (!tbaSourceToken) return null

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const nftContract = new ethers.Contract(targetNFTContract, DONATABLE_NFT_ABI, provider)
      
      const totalSupply = await nftContract.totalSupply()
      console.log(`🔍 Checking TBA source token: "${tbaSourceToken}"`)
      console.log(`📊 Total supply in target contract: ${totalSupply}`)
      
      // Convert to hex for detailed comparison
      const tbaSourceTokenHex = ethers.hexlify(ethers.toUtf8Bytes(tbaSourceToken))
      console.log(`🔍 TBA source token hex: ${tbaSourceTokenHex}`)
      
      for (let i = 1; i <= totalSupply; i++) {
        try {
          const originalTokenInfo = await nftContract._originalTokenInfo(i)
          const originalTokenInfoHex = ethers.hexlify(ethers.toUtf8Bytes(originalTokenInfo))
          
          console.log(`Token ${i} _originalTokenInfo: "${originalTokenInfo}"`)
          console.log(`Token ${i} _originalTokenInfo hex: ${originalTokenInfoHex}`)
          console.log(`Token ${i} exact match: ${originalTokenInfo === tbaSourceToken}`)
          console.log(`Token ${i} hex match: ${originalTokenInfoHex === tbaSourceTokenHex}`)
          
          if (originalTokenInfo === tbaSourceToken) {
            console.log(`✅ Found TBA source token at DonatableNFT token ID ${i}`)
            
            // Get token owner for additional info
            try {
              const owner = await nftContract.ownerOf(i)
              console.log(`Token ${i} owner: ${owner}`)
            } catch (ownerError) {
              console.log(`Could not get owner for token ${i}:`, ownerError)
            }
            
            return i
          }
        } catch (error) {
          console.log(`❌ Error reading token ${i}:`, error)
        }
      }
      
      console.log(`❌ TBA source token not found: ${tbaSourceToken}`)
      return null
    } catch (error) {
      console.error('Error checking TBA source token:', error)
      return null
    }
  }

  // Test TBA registry and implementation
  const testTBAComponents = async (sourceTokenId: number) => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      
      const chainId = await provider.getNetwork().then(network => network.chainId)
      console.log(`🔗 Chain ID: ${chainId}`)
      
      // First check if TBA registry contract exists
      const registryCode = await provider.getCode(tbaRegistry)
      console.log(`🔍 TBA Registry code exists: ${registryCode !== '0x'}`)
      console.log(`📍 TBA Registry address: ${tbaRegistry}`)
      
      if (registryCode === '0x') {
        throw new Error(`TBA Registry contract not found at address ${tbaRegistry}`)
      }
      
      // Check if TBA implementation exists
      const implementationCode = await provider.getCode(tbaImplementation)
      console.log(`🔍 TBA Implementation code exists: ${implementationCode !== '0x'}`)
      console.log(`📍 TBA Implementation address: ${tbaImplementation}`)
      
      if (implementationCode === '0x') {
        throw new Error(`TBA Implementation contract not found at address ${tbaImplementation}`)
      }
      
      const registryContract = new ethers.Contract(tbaRegistry, TBA_REGISTRY_ABI, provider)
      
      // Test TBA account calculation
      try {
        const tbaAccount = await registryContract.account(
          tbaImplementation,
          chainId,
          targetNFTContract,
          sourceTokenId.toString(), // convert to string like in tbaService
          "1" // salt as string like in tbaService
        )
        console.log(`🏦 Calculated TBA account for token ${sourceTokenId}: ${tbaAccount}`)
        
        // Check if account already exists by checking code
        const code = await provider.getCode(tbaAccount)
        const accountExists = code !== '0x'
        console.log(`🏦 TBA account exists: ${accountExists}`)
        
        return { tbaAccount, accountExists }
      } catch (accountError) {
        console.error('❌ Error calculating TBA account:', accountError)
        throw accountError
      }
    } catch (error) {
      console.error('❌ Error testing TBA components:', error)
      throw error
    }
  }

  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
        if (accounts.length > 0) {
          setWalletConnected(true)
          setCurrentAccount(accounts[0])
        }
      } catch (error) {
        console.error('Failed to connect wallet:', error)
        alert('Failed to connect wallet')
      }
    } else {
      alert('MetaMask is not installed')
    }
  }

  const toggleNFTSelection = (originalTokenInfo: string) => {
    const newSelection = new Set(selectedNFTs)
    if (newSelection.has(originalTokenInfo)) {
      newSelection.delete(originalTokenInfo)
    } else {
      newSelection.add(originalTokenInfo)
    }
    setSelectedNFTs(newSelection)
  }

  const selectAll = () => {
    const allTokenInfos = nftsWithImportStatus.filter(nft => !nft.isAlreadyImported).map(nft => nft.originalTokenInfo)
    setSelectedNFTs(new Set(allTokenInfos))
  }

  const deselectAll = () => {
    setSelectedNFTs(new Set())
  }

  // Check authorization status
  const checkAuthorization = async () => {
    if (!importerContractAddress || !targetNFTContract) {
      setAuthorizationStatus('Please enter both contract addresses')
      return
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      
      // Check if addresses are valid contracts
      const importerCode = await provider.getCode(importerContractAddress)
      const targetCode = await provider.getCode(targetNFTContract)
      
      if (importerCode === '0x') {
        setAuthorizationStatus('Error: JSONDataImporter address is not a contract')
        return
      }
      
      if (targetCode === '0x') {
        setAuthorizationStatus('Error: DonatableNFT address is not a contract')
        return
      }
      
      // Check authorization
      const donatableNFTAbi = ['function _importers(address) view returns (bool)', 'function _owner() view returns (address)']
      const donatableNFT = new ethers.Contract(targetNFTContract, donatableNFTAbi, provider)
      
      const [isAuthorized, contractOwner] = await Promise.all([
        donatableNFT._importers(importerContractAddress).catch(() => false),
        donatableNFT._owner().catch(() => null)
      ])
      
      if (isAuthorized) {
        setAuthorizationStatus('✅ JSONDataImporter is authorized')
      } else {
        setAuthorizationStatus(`❌ JSONDataImporter NOT authorized. Contract owner (${contractOwner ? contractOwner.slice(0, 6) + '...' + contractOwner.slice(-4) : 'unknown'}) must call: setImporter("${importerContractAddress}", true)`)
      }
    } catch (error) {
      console.error('Authorization check failed:', error)
      setAuthorizationStatus('Error checking authorization: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  const estimateGas = async () => {
    if (!walletConnected || !importerContractAddress || !targetNFTContract || selectedNFTs.size === 0) {
      return
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const contract = new ethers.Contract(importerContractAddress, JSON_DATA_IMPORTER_ABI, provider)
      
      // First, check import status for all NFTs
      const updatedNFTs = await Promise.all(
        nftsWithImportStatus.map(async (nft) => {
          try {
            const validation = await contractSigner.validateImportData(
              targetNFTContract,
              nft.tokenURI || '',
              nft.owner || currentAccount,
              nft.creator || currentAccount,
              nft.isSBT,
              nft.originalTokenInfo,
              10
            )
            return { ...nft, isAlreadyImported: !validation[0] && validation[1].includes('already') }
          } catch {
            return { ...nft, isAlreadyImported: false }
          }
        })
      )
      
      setNftsWithImportStatus(updatedNFTs)
      console.log('Import status checked for all NFTs during gas estimation')
      
      // Check if the JSONDataImporter is authorized
      const donatableNFTAbi = ['function _importers(address) view returns (bool)']
      const donatableNFT = new ethers.Contract(targetNFTContract, donatableNFTAbi, provider)
      
      try {
        const isAuthorized = await donatableNFT._importers(importerContractAddress)
        if (!isAuthorized) {
          setGasEstimate('Error: JSONDataImporter not authorized. Please call setImporter() on DonatableNFT contract.')
          return
        }
      } catch (authError) {
        console.warn('Could not check authorization:', authError)
      }
      
      const signer = await provider.getSigner()
      const contractSigner = new ethers.Contract(importerContractAddress, JSON_DATA_IMPORTER_ABI, signer)

      const selectedNFTsList = updatedNFTs.filter(nft => selectedNFTs.has(nft.originalTokenInfo))
      
      // Debug log
      console.log('Gas estimation debug:', {
        importerContract: importerContractAddress,
        targetNFT: targetNFTContract,
        selectedCount: selectedNFTsList.length,
        selectedNFTs: selectedNFTsList.map(nft => ({
          tokenId: nft.tokenId,
          originalTokenInfo: nft.originalTokenInfo,
          hasTBA: !!nft.tbaSourceToken,
          tbaSourceToken: nft.tbaSourceToken
        }))
      })
      
      // Additional validation check
      if (selectedNFTsList.length > 0) {
        const firstNFT = selectedNFTsList[0]
        if (!firstNFT.tokenURI) {
          setGasEstimate('Error: First NFT has no tokenURI')
          return
        }
        if (!firstNFT.originalTokenInfo) {
          setGasEstimate('Error: First NFT has no originalTokenInfo')
          return
        }
      }
      
      if (selectedNFTsList.length === 1) {
        // Single import gas estimation - try without TBA first for debugging
        const nft = selectedNFTsList[0]
        
        // Debug: Validate import data first
        console.log('Validating import data for:', nft.originalTokenInfo)
        try {
          const validation = await contractSigner.validateImportData(
            targetNFTContract,
            nft.tokenURI || '',
            nft.owner || currentAccount,
            nft.creator || currentAccount,
            nft.isSBT,
            nft.originalTokenInfo,
            10
          )
          console.log('Validation result:', validation)
          
          if (!validation[0]) {
            setGasEstimate(`Validation failed: ${validation[1]}`)
            return
          }
        } catch (validationErr) {
          console.error('Validation check failed:', validationErr)
          setGasEstimate(`Validation check failed: ${validationErr.message}`)
          return
        }

        // Debug: Log parameters
        console.log('Gas estimation parameters:', {
          targetNFT: targetNFTContract,
          tokenURI: nft.tokenURI || '',
          to: nft.owner || currentAccount,
          creator: nft.creator || currentAccount,
          isSBT: nft.isSBT,
          originalTokenInfo: nft.originalTokenInfo,
          hasTBASource: !!nft.tbaSourceToken
        })

        // Debug TBA source token existence
        if (nft.tbaSourceToken) {
          console.log('Checking TBA source token existence:', nft.tbaSourceToken)
          try {
            // Check if the parent NFT exists in DonatableNFT
            const donatableNFTAbi = [
              'function totalSupply() view returns (uint256)',
              'function _originalTokenInfo(uint256) view returns (string)',
              'function ownerOf(uint256) view returns (address)'
            ]
            const donatableNFT = new ethers.Contract(targetNFTContract, donatableNFTAbi, contractSigner.runner)
            
            const totalSupply = await donatableNFT.totalSupply()
            console.log('DonatableNFT total supply:', totalSupply.toString())
            
            let foundSourceToken = false
            for (let i = 1; i <= parseInt(totalSupply.toString()); i++) {
              try {
                const originalTokenInfo = await donatableNFT._originalTokenInfo(i)
                console.log(`Token ${i} originalTokenInfo:`, originalTokenInfo)
                
                if (originalTokenInfo === nft.tbaSourceToken) {
                  console.log(`✅ Found TBA source token at DonatableNFT token ID ${i}`)
                  foundSourceToken = true
                  
                  // Check if this token has an owner
                  const owner = await donatableNFT.ownerOf(i)
                  console.log(`Token ${i} owner:`, owner)
                  break
                }
              } catch (err) {
                console.log(`Token ${i} does not exist or error:`, err.message)
              }
            }
            
            if (!foundSourceToken) {
              console.log(`❌ TBA source token "${nft.tbaSourceToken}" NOT found in DonatableNFT`)
              
              // List all available originalTokenInfo for reference
              console.log('Available originalTokenInfo in DonatableNFT:')
              const availableTokens = []
              for (let i = 1; i <= parseInt(totalSupply.toString()); i++) {
                try {
                  const originalTokenInfo = await donatableNFT._originalTokenInfo(i)
                  console.log(`  Token ${i}: "${originalTokenInfo}"`)
                  availableTokens.push(originalTokenInfo)
                } catch (err) {
                  console.log(`  Token ${i}: Error - ${err.message}`)
                }
              }
              
              // Check if the parent NFT exists in the imported NFTs list
              const parentExists = importedNFTs.some(importedNft => 
                importedNft.originalTokenInfo === nft.tbaSourceToken
              )
              
              let errorMessage = `🚨 TBA Import Error:\n\n`
              errorMessage += `This NFT requires a parent NFT to create its TBA (Token Bound Account).\n\n`
              errorMessage += `Required parent NFT: "${nft.tbaSourceToken}"\n`
              errorMessage += `Current NFT: "${nft.originalTokenInfo}"\n\n`
              
              if (parentExists) {
                errorMessage += `✅ The parent NFT exists in your imported list.\n`
                errorMessage += `📋 Solution: Please import the parent NFT first, then import this TBA NFT.\n\n`
                errorMessage += `1. Deselect this NFT\n`
                errorMessage += `2. Select and import the parent NFT: "${nft.tbaSourceToken}"\n`
                errorMessage += `3. After successful import, return to import this TBA NFT`
              } else {
                errorMessage += `❌ The parent NFT is not in your imported list.\n`
                errorMessage += `📋 Solution: You need to export and import the parent NFT first.\n\n`
                errorMessage += `1. Go back to the source and export the parent NFT: "${nft.tbaSourceToken}"\n`
                errorMessage += `2. Import the parent NFT to this blockchain\n`
                errorMessage += `3. Then import this TBA NFT`
              }
              
              errorMessage += `\n\nCurrently available tokens in DonatableNFT (${totalSupply}): \n${availableTokens.map((token, idx) => `${idx + 1}. ${token}`).join('\n')}`
              
              setGasEstimate(errorMessage)
              return
            }
          } catch (err) {
            console.error('Error checking TBA source token:', err)
            setGasEstimate(`Error checking TBA source token: ${err.message}`)
            return
          }
        }

        // Choose import method based on TBA source token (TBA re-enabled)
        if (!nft.tbaSourceToken) {
          console.log('Using simple import (no TBA source token)')
          const gasEstimate = await contractSigner.importSingleToken.estimateGas(
            targetNFTContract,
            nft.tokenURI || '',
            nft.owner || currentAccount,
            nft.creator || currentAccount,
            nft.isSBT,
            nft.originalTokenInfo,
            10 // 10% royalty rate
          )
          setGasEstimate(gasEstimate.toString())
        } else {
          console.log('Using TBA import (parent NFT validation passed)')
          
          // Test TBA components for gas estimation
          const sourceTokenId = await checkTBASourceToken(nft.tbaSourceToken)
          if (sourceTokenId !== null) {
            console.log('🧪 Testing TBA components for gas estimation...')
            await testTBAComponents(sourceTokenId)
          }
          
          const gasEstimate = await contractSigner.importSingleTokenWithTBA.estimateGas(
            targetNFTContract,
            nft.tokenURI || '',
            nft.owner || currentAccount,
            nft.creator || currentAccount,
            nft.isSBT,
            nft.originalTokenInfo,
            10, // 10% royalty rate
            nft.tbaSourceToken, // TBA source token
            tbaRegistry,
            tbaImplementation
          )
          setGasEstimate(gasEstimate.toString())
        }
        
        /*
        // If no TBA source token, use simple import
        if (!nft.tbaSourceToken) {
          const gasEstimate = await contractSigner.importSingleToken.estimateGas(
            targetNFTContract,
            nft.tokenURI || '',
            nft.owner || currentAccount,
            nft.creator || currentAccount,
            nft.isSBT,
            nft.originalTokenInfo,
            10 // 10% royalty rate
          )
          setGasEstimate(gasEstimate.toString())
        } else {
          // Use TBA version
          const gasEstimate = await contractSigner.importSingleTokenWithTBA.estimateGas(
            targetNFTContract,
            nft.tokenURI || '',
            nft.owner || currentAccount,
            nft.creator || currentAccount,
            nft.isSBT,
            nft.originalTokenInfo,
            10, // 10% royalty rate
            nft.tbaSourceToken, // TBA source token
            tbaRegistry,
            tbaImplementation
          )
          setGasEstimate(gasEstimate.toString())
        }
        */
      } else {
        // Check batch size limit (more permissive)
        if (selectedNFTsList.length > 50) {
          setGasEstimate(`Warning: Batch size (${selectedNFTsList.length}) is very large. Consider using smaller batches (≤50) if gas estimation fails.`)
          // Don't return - allow user to try
        }
        
        // Basic validation - check required fields
        console.log('Basic validation for batch of', selectedNFTsList.length, 'NFTs')
        const basicValidationErrors = []
        
        selectedNFTsList.forEach((nft, i) => {
          if (!nft.originalTokenInfo) {
            basicValidationErrors.push(`NFT ${i + 1}: Missing originalTokenInfo`)
          }
          if (!nft.tokenURI) {
            basicValidationErrors.push(`NFT ${i + 1}: Missing tokenURI`)
          }
        })
        
        if (basicValidationErrors.length > 0) {
          setGasEstimate(`Basic validation failed:\n\n${basicValidationErrors.join('\n')}`)
          return
        }
        
        console.log('Basic validation passed for all NFTs')
        
        // Check if NFTs are already imported (using validateImportData for comprehensive check)
        console.log('Validating import data for all NFTs...')
        const validationErrors = []
        
        for (let i = 0; i < selectedNFTsList.length; i++) {
          const nft = selectedNFTsList[i]
          try {
            const validation = await contractSigner.validateImportData(
              targetNFTContract,
              nft.tokenURI || '',
              nft.owner || currentAccount,
              nft.creator || currentAccount,
              nft.isSBT,
              nft.originalTokenInfo,
              10
            )
            
            console.log(`NFT ${i + 1} (${nft.originalTokenInfo}) validation:`, validation)
            
            if (!validation[0]) {
              validationErrors.push(`NFT ${i + 1} (${nft.originalTokenInfo}): ${validation[1]}`)
            }
          } catch (err) {
            console.error(`Failed to validate NFT ${i + 1}:`, err)
            validationErrors.push(`NFT ${i + 1} (${nft.originalTokenInfo}): Validation failed - ${err.message}`)
          }
        }
        
        if (validationErrors.length > 0) {
          setGasEstimate(`Validation failed:\n\n${validationErrors.join('\n')}`)
          return
        }
        
        console.log('All NFTs passed validation and can be imported')
        
        // Try batch import first, fallback to individual if it fails
        console.log(`Attempting batch gas estimation for ${selectedNFTsList.length} NFTs`)
        
        try {
          // Check if any NFT has TBA source token
          const hasTBANFTs = selectedNFTsList.some(nft => nft.tbaSourceToken)
          
          // Prepare batch import data
          const importData = selectedNFTsList.map(nft => [
            nft.tokenURI || '',
            nft.owner || currentAccount,
            nft.creator || currentAccount,
            nft.isSBT || false,
            nft.originalTokenInfo,
            10, // royaltyRate
            nft.tbaSourceToken || '' // tbaSourceToken
          ])
          
          // Try batch gas estimation
          const batchGasEstimate = await contractSigner.importBatchWithTBA.estimateGas(
            targetNFTContract, 
            importData,
            hasTBANFTs ? tbaRegistry : ethers.ZeroAddress,
            hasTBANFTs ? tbaImplementation : ethers.ZeroAddress
          )
          
          console.log('Batch gas estimate successful:', batchGasEstimate.toString())
          setGasEstimate(`Batch import gas: ${batchGasEstimate.toString()} (single transaction)`)
          
        } catch (batchError) {
          console.log('Batch gas estimation failed:', batchError)
          setGasEstimate(`Batch gas estimation failed: ${batchError.message}`)
        }
      }
    } catch (error: any) {
      console.error('Gas estimation failed - Full error:', error)
      console.error('Error details:', {
        reason: error.reason,
        code: error.code,
        action: error.action,
        data: error.data,
        transaction: error.transaction
      })
      
      // More detailed error handling
      let errorMessage = 'Estimation failed'
      
      if (error.reason) {
        errorMessage = error.reason
      } else if (error.data && error.data.message) {
        errorMessage = error.data.message
      } else if (error.message) {
        errorMessage = error.message
        
        // Check for specific error patterns
        if (error.message.includes('missing revert data')) {
          errorMessage = 'Transaction would fail. Possible causes:\n' +
            '1. JSONDataImporter not authorized (call setImporter on DonatableNFT)\n' +
            '2. Invalid contract addresses\n' +
            '3. Token already imported\n' +
            '4. Invalid token data'
        }
      }
      
      setGasEstimate(errorMessage)
    }
  }

  const executeImport = async () => {
    if (!walletConnected || !importerContractAddress || !targetNFTContract || selectedNFTs.size === 0) {
      alert('Please fill all required fields and select NFTs to import')
      return
    }

    setIsImporting(true)
    const results: ImportResult[] = []

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(importerContractAddress, JSON_DATA_IMPORTER_ABI, signer)

      const selectedNFTsList = importedNFTs.filter(nft => selectedNFTs.has(nft.originalTokenInfo))

      if (selectedNFTsList.length === 1) {
        // Single import
        const nft = selectedNFTsList[0]
        try {
          const txOptions: any = {}
          if (customGasLimit) {
            txOptions.gasLimit = parseInt(customGasLimit)
          } else {
            // Add gas buffer for single imports
            try {
              let estimatedGas
              if (!nft.tbaSourceToken) {
                estimatedGas = await contract.importSingleToken.estimateGas(
                  targetNFTContract,
                  nft.tokenURI || '',
                  nft.owner || currentAccount,
                  nft.creator || currentAccount,
                  nft.isSBT,
                  nft.originalTokenInfo,
                  10
                )
              } else {
                estimatedGas = await contract.importSingleTokenWithTBA.estimateGas(
                  targetNFTContract,
                  nft.tokenURI || '',
                  nft.owner || currentAccount,
                  nft.creator || currentAccount,
                  nft.isSBT,
                  nft.originalTokenInfo,
                  10,
                  nft.tbaSourceToken,
                  tbaRegistry,
                  tbaImplementation
                )
              }
              const gasWithBuffer = (estimatedGas * BigInt(120)) / BigInt(100) // Add 20% buffer
              txOptions.gasLimit = gasWithBuffer
              console.log('Single import - Original gas estimate:', estimatedGas.toString())
              console.log('Single import - Using gas with 20% buffer:', gasWithBuffer.toString())
            } catch (gasEstError) {
              console.warn('Could not estimate gas for single import, proceeding without gas limit')
            }
          }
          
          // Choose import method based on TBA source token
          let tx
          if (!nft.tbaSourceToken) {
            console.log('Executing simple import (no TBA source token)')
            tx = await contract.importSingleToken(
              targetNFTContract,
              nft.tokenURI || '',
              nft.owner || currentAccount,
              nft.creator || currentAccount,
              nft.isSBT,
              nft.originalTokenInfo,
              10,
              txOptions
            )
          } else {
            // TBA import - check source token first
            console.log('🔍 Pre-checking TBA source token for:', nft.originalTokenInfo)
            const sourceTokenId = await checkTBASourceToken(nft.tbaSourceToken)
            
            if (sourceTokenId === null) {
              throw new Error(`TBA source token not found in target contract: ${nft.tbaSourceToken}`)
            }
            
            // Test TBA components
            console.log('🧪 Testing TBA registry and implementation...')
            const tbaInfo = await testTBAComponents(sourceTokenId)
            
            console.log('✅ TBA source token verified, executing TBA import')
            tx = await contract.importSingleTokenWithTBA(
              targetNFTContract,
              nft.tokenURI || '',
              nft.owner || currentAccount,
              nft.creator || currentAccount,
              nft.isSBT,
              nft.originalTokenInfo,
              10,
              nft.tbaSourceToken,
              tbaRegistry,
              tbaImplementation,
              txOptions
            )
          }
          
          const receipt = await tx.wait()
          
          // Parse events to get new token ID
          const importEvent = receipt.logs.find((log: any) => 
            log.topics[0] === ethers.id('JSONDataImported(address,address,uint256,string)')
          )
          
          const newTokenId = importEvent ? parseInt(importEvent.topics[3], 16) : undefined
          
          results.push({
            originalTokenInfo: nft.originalTokenInfo,
            success: true,
            transactionHash: receipt.hash,
            newTokenId
          })
        } catch (error) {
          results.push({
            originalTokenInfo: nft.originalTokenInfo,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      } else {
        // Check batch size and warn user
        if (selectedNFTsList.length > 10) {
          const proceed = confirm(
            `You're trying to import ${selectedNFTsList.length} NFTs in one batch. ` +
            `Large batches may fail due to gas limits. ` +
            `Would you like to try anyway? (Recommended: 10 or fewer NFTs per batch)`
          )
          if (!proceed) {
            setIsImporting(false)
            return
          }
        }
        
        // Try batch import first, fallback to individual if it fails
        console.log(`Attempting batch import for ${selectedNFTsList.length} NFTs`)
        
        try {
          // First check if the importer is authorized
          console.log('Checking if JSONDataImporterV2 is authorized...')
          const provider = new ethers.BrowserProvider(window.ethereum)
          const donatableNFTAbi = ['function _importers(address) view returns (bool)']
          const donatableNFT = new ethers.Contract(targetNFTContract, donatableNFTAbi, provider)
          
          try {
            const isAuthorized = await donatableNFT._importers(importerContractAddress)
            console.log('Authorization status:', isAuthorized)
            console.log('Importer address:', importerContractAddress)
            console.log('Target NFT address:', targetNFTContract)
            
            if (!isAuthorized) {
              alert(`❌ JSONDataImporterV2 is not authorized on DonatableNFT.\n\nImporter: ${importerContractAddress}\nTarget NFT: ${targetNFTContract}\n\nPlease call: setImporter("${importerContractAddress}", true) on the DonatableNFT contract.`)
              setIsImporting(false)
              return
            } else {
              console.log('✅ JSONDataImporterV2 is properly authorized')
            }
          } catch (authError) {
            console.warn('Could not check authorization:', authError)
            alert(`⚠️ Warning: Could not verify authorization status.\n\nError: ${authError.message}\n\nProceeding anyway, but import may fail if not authorized.`)
          }
          
          // Check if any NFT has TBA source token
          const hasTBANFTs = selectedNFTsList.some(nft => nft.tbaSourceToken)
          
          // Pre-check all TBA source tokens
          if (hasTBANFTs) {
            console.log('🔍 Pre-checking TBA source tokens for batch import...')
            
            for (const nft of selectedNFTsList) {
              if (nft.tbaSourceToken) {
                const sourceTokenId = await checkTBASourceToken(nft.tbaSourceToken)
                
                if (sourceTokenId === null) {
                  throw new Error(`TBA source token not found in target contract: ${nft.tbaSourceToken} for NFT: ${nft.originalTokenInfo}`)
                }
                
                console.log(`✅ TBA source token verified for ${nft.originalTokenInfo}: ${nft.tbaSourceToken} -> ID ${sourceTokenId}`)
              }
            }
            
            console.log('✅ All TBA source tokens verified for batch import')
          }
          
          // Prepare batch import data
          const importData = selectedNFTsList.map(nft => [
            nft.tokenURI || '',
            nft.owner || currentAccount,
            nft.creator || currentAccount,
            nft.isSBT || false,
            nft.originalTokenInfo,
            10, // royaltyRate
            nft.tbaSourceToken || '' // tbaSourceToken
          ])
          
          const txOptions: any = {}
          if (customGasLimit) {
            txOptions.gasLimit = parseInt(customGasLimit)
          }
          
          // Use pre-estimated gas from UI if available, otherwise estimate with buffer
          if (!customGasLimit) {
            // Parse gas estimate from the UI if available
            const uiGasEstimate = gasEstimate.match(/\d+/)
            if (uiGasEstimate) {
              const baseGas = BigInt(uiGasEstimate[0])
              const gasWithBuffer = (baseGas * BigInt(130)) / BigInt(100) // Add 30% buffer
              txOptions.gasLimit = gasWithBuffer
              console.log('Using UI gas estimate with 30% buffer:', gasWithBuffer.toString())
            } else {
              console.log('No UI gas estimate available, using default gas handling')
            }
          }
          
          // Try batch import
          console.log('Executing batch import...')
          console.log('Debug info:', {
            targetNFTContract,
            importDataCount: importData.length,
            hasTBANFTs,
            tbaRegistry: hasTBANFTs ? tbaRegistry : ethers.ZeroAddress,
            tbaImplementation: hasTBANFTs ? tbaImplementation : ethers.ZeroAddress,
            txOptions,
            firstImportItem: importData[0]
          })
          
          // Skip batch validation for now - seems to have issues
          console.log('⚠️ Skipping batch validation, proceeding with execution...')
          
          console.log('🚀 Executing batch import transaction...')
          
          // Try to estimate gas first
          try {
            const gasEstimate = await contract.importBatchWithTBA.estimateGas(
              targetNFTContract,
              importData,
              hasTBANFTs ? tbaRegistry : ethers.ZeroAddress,
              hasTBANFTs ? tbaImplementation : ethers.ZeroAddress
            )
            console.log('Gas estimate successful:', gasEstimate.toString())
          } catch (gasError) {
            console.error('Gas estimation failed:', gasError)
            throw new Error(`Gas estimation failed: ${gasError.message}`)
          }
          
          const tx = await contract.importBatchWithTBA(
            targetNFTContract,
            importData,
            hasTBANFTs ? tbaRegistry : ethers.ZeroAddress,
            hasTBANFTs ? tbaImplementation : ethers.ZeroAddress,
            txOptions
          )
          
          const receipt = await tx.wait()
          console.log('Batch import transaction successful!')
          console.log('Transaction hash:', receipt.hash)
          console.log('Gas used:', receipt.gasUsed?.toString())
          
          // Mark all as successful - don't validate after successful minting
          selectedNFTsList.forEach(nft => {
            results.push({
              originalTokenInfo: nft.originalTokenInfo,
              success: true,
              transactionHash: receipt.hash
            })
          })
          
          console.log(`✅ Successfully imported ${selectedNFTsList.length} NFTs in batch`)
          
        } catch (batchError) {
          console.error('Batch import failed:', batchError)
          
          // More specific error message
          let errorMsg = 'Batch import failed. '
          if (batchError.message.includes('Internal JSON-RPC error')) {
            errorMsg += 'This is likely due to a contract validation error or authorization issue.'
          } else if (batchError.message.includes('gas')) {
            errorMsg += 'This may be due to insufficient gas limit.'
          }
          
          // Mark all as failed
          selectedNFTsList.forEach(nft => {
            results.push({
              originalTokenInfo: nft.originalTokenInfo,
              success: false,
              error: `Batch import failed: ${batchError.message}`
            })
          })
          
          alert(`${errorMsg}\n\nPlease check:\n- JSONDataImporter authorization\n- Gas limit settings\n- Network connection`)
        }
      }
      
      // Complete the import process
      setImportResults(results)
      onImportComplete(results)
      setIsImporting(false)
    } catch (error) {
      console.error('Import failed:', error)
      alert('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
      setIsImporting(false)
    }
  }

  /* Original batch import code - kept for reference
        // Block if exceeds contract limit
        if (selectedNFTsList.length > 100) {
          alert(`Batch size (${selectedNFTsList.length}) exceeds maximum limit of 100 NFTs. Please reduce your selection.`)
          setIsImporting(false)
          return
        }
        
        // Warning for very large batches but don't block
        if (selectedNFTsList.length > 50) {
          const confirmed = confirm(`You're about to import ${selectedNFTsList.length} NFTs in one transaction. This may require high gas fees and could fail. Continue?`)
          if (!confirmed) {
            setIsImporting(false)
            return
          }
        }
        */


  if (importedNFTs.length === 0) {
    return (
      <div className="import-to-blockchain">
        <h3>Import to Blockchain</h3>
        <p>No imported NFTs available. Please import JSON data first.</p>
      </div>
    )
  }

  return (
    <div className="import-to-blockchain">
      <h3>Import NFTs to Blockchain</h3>
      
      {/* Wallet Connection */}
      <div className="wallet-section" style={{ marginBottom: '20px' }}>
        {!walletConnected ? (
          <button onClick={connectWallet} style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}>
            Connect Wallet
          </button>
        ) : (
          <div>
            <p>Connected: {currentAccount.slice(0, 6)}...{currentAccount.slice(-4)}</p>
          </div>
        )}
      </div>

      {/* Contract Configuration */}
      <div className="contract-config" style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '10px' }}>
          <label>JSONDataImporter Contract Address:</label>
          <input
            type="text"
            value={importerContractAddress}
            onChange={(e) => setImporterContractAddress(e.target.value)}
            placeholder="0x..."
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Target DonatableNFT Contract Address:</label>
          <input
            type="text"
            value={targetNFTContract}
            onChange={(e) => setTargetNFTContract(e.target.value)}
            placeholder="0x..."
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <label>TBA Registry Address:</label>
          <input
            type="text"
            value={tbaRegistry}
            onChange={(e) => setTbaRegistry(e.target.value)}
            placeholder="0x63c8A3536E4A647D48fC0076D442e3243f7e773b"
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <label>TBA Implementation Address:</label>
          <input
            type="text"
            value={tbaImplementation}
            onChange={(e) => setTbaImplementation(e.target.value)}
            placeholder="0xa8a05744C04c7AD0D31Fcee368aC18040832F1c1"
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>
        
        {/* Authorization Check Button */}
        <button
          onClick={checkAuthorization}
          style={{
            padding: '8px 16px',
            backgroundColor: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginTop: '10px'
          }}
        >
          Check Authorization Status
        </button>
        
        {authorizationStatus && (
          <div style={{
            marginTop: '10px',
            padding: '10px',
            backgroundColor: authorizationStatus.includes('✅') ? '#d4edda' : '#f8d7da',
            border: `1px solid ${authorizationStatus.includes('✅') ? '#c3e6cb' : '#f5c6cb'}`,
            borderRadius: '4px',
            fontSize: '14px',
            whiteSpace: 'pre-wrap'
          }}>
            {authorizationStatus}
          </div>
        )}
      </div>

      {/* NFT Selection */}
      <div className="nft-selection" style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '10px' }}>
          <button onClick={selectAll} style={{ marginRight: '10px', padding: '5px 10px' }}>
            Select All
          </button>
          <button onClick={deselectAll} style={{ marginRight: '10px', padding: '5px 10px' }}>
            Deselect All
          </button>
          <span>Selected: {selectedNFTs.size} / {nftsWithImportStatus.length}</span>
          {selectedNFTs.size > 50 && (
            <span style={{ color: '#ffc107', marginLeft: '10px', fontWeight: 'bold' }}>
              ⚠️ Large batch size ({selectedNFTs.size} NFTs) - may require high gas fees
            </span>
          )}
          {selectedNFTs.size > 100 && (
            <span style={{ color: '#dc3545', marginLeft: '10px', fontWeight: 'bold' }}>
              ❌ Exceeds maximum batch size (100 NFTs). Please reduce selection.
            </span>
          )}
        </div>

        <div style={{ border: '1px solid #ddd', padding: '10px' }}>
          {nftsWithImportStatus.map((nft, index) => {
            // Check if this NFT is already imported based on validation errors
            const isAlreadyImported = nft.isAlreadyImported || false
            
            return (
              <div key={index} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                marginBottom: '8px', 
                padding: '8px', 
                border: '1px solid #eee',
                backgroundColor: isAlreadyImported ? '#e9ecef' : '#fff',
                opacity: isAlreadyImported ? 0.8 : 1
              }}>
                <input
                  type="checkbox"
                  checked={selectedNFTs.has(nft.originalTokenInfo)}
                  onChange={() => toggleNFTSelection(nft.originalTokenInfo)}
                  disabled={isAlreadyImported}
                  style={{ marginRight: '10px' }}
                />
                {/* NFT Image */}
                {metadataCache.get(nft.originalTokenInfo)?.image && (
                  <div style={{ marginRight: '12px' }}>
                    <img
                      src={metadataCache.get(nft.originalTokenInfo)?.image}
                      alt={metadataCache.get(nft.originalTokenInfo)?.name || 'NFT'}
                      style={{
                        width: '60px',
                        height: '60px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div>
                    {/* NFT Name */}
                    {metadataCache.get(nft.originalTokenInfo)?.name && (
                      <div style={{ 
                        fontWeight: 'bold', 
                        fontSize: '16px',
                        color: '#333',
                        marginBottom: '4px'
                      }}>
                        {metadataCache.get(nft.originalTokenInfo)?.name}
                      </div>
                    )}
                    <div style={{ 
                      color: '#666', 
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      {nft.originalTokenInfo}
                      {isAlreadyImported && (
                        <span style={{ 
                          backgroundColor: '#28a745', 
                          color: 'white', 
                          padding: '2px 6px', 
                          borderRadius: '3px', 
                          fontSize: '11px',
                          fontWeight: 'bold'
                        }}>
                          ✓ IMPORTED
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    <strong>Owner:</strong> {nft.owner || 'Unknown'}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    <strong>Creator:</strong> {nft.creator || 'Unknown'}
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    {nft.isSBT && <span style={{ backgroundColor: '#ff6b6b', color: 'white', padding: '2px 6px', borderRadius: '3px', fontSize: '12px', marginRight: '5px' }}>SBT</span>}
                    {nft.isTBA && <span style={{ backgroundColor: '#4ecdc4', color: 'white', padding: '2px 6px', borderRadius: '3px', fontSize: '12px' }}>TBA</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Gas Estimation */}
      {walletConnected && importerContractAddress && targetNFTContract && selectedNFTs.size > 0 && (
        <div className="gas-estimation" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <button onClick={estimateGas} style={{ padding: '8px 16px' }}>
              Estimate Gas
            </button>
            <div>
              <label>Custom Gas Limit (optional):</label>
              <input
                type="number"
                value={customGasLimit}
                onChange={(e) => setCustomGasLimit(e.target.value)}
                placeholder="e.g., 5000000"
                style={{ padding: '4px', marginLeft: '5px', width: '120px' }}
              />
            </div>
          </div>
          {gasEstimate && (
            <div style={{ 
              marginTop: '10px', 
              padding: '10px', 
              backgroundColor: gasEstimate.includes('Failed') || gasEstimate.includes('Error') ? '#fee' : '#efe',
              border: `1px solid ${gasEstimate.includes('Failed') || gasEstimate.includes('Error') ? '#fcc' : '#cfc'}`,
              borderRadius: '4px',
              maxWidth: '100%',
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              fontSize: '14px'
            }}>
              <strong>Estimated Gas:</strong>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: '5px' }}>
                {gasEstimate}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import Button */}
      <div className="import-actions" style={{ marginBottom: '20px' }}>
        <button
          onClick={executeImport}
          disabled={!walletConnected || !importerContractAddress || !targetNFTContract || selectedNFTs.size === 0 || isImporting}
          style={{
            padding: '12px 24px',
            backgroundColor: isImporting ? '#ccc' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: isImporting ? 'not-allowed' : 'pointer'
          }}
        >
          {isImporting ? 'Importing...' : `Import ${selectedNFTs.size} NFT${selectedNFTs.size > 1 ? 's' : ''} to Blockchain`}
        </button>
      </div>

      {/* Import Results */}
      {importResults.length > 0 && (
        <div className="import-results">
          <h4>Import Results</h4>
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ddd', padding: '10px' }}>
            {importResults.map((result, index) => (
              <div key={index} style={{ 
                marginBottom: '8px', 
                padding: '8px', 
                backgroundColor: result.success ? '#d4edda' : '#f8d7da',
                border: `1px solid ${result.success ? '#c3e6cb' : '#f5c6cb'}`,
                borderRadius: '4px'
              }}>
                <div><strong>Token:</strong> {result.originalTokenInfo}</div>
                <div><strong>Status:</strong> {result.success ? 'Success' : 'Failed'}</div>
                {result.success && result.transactionHash && (
                  <div><strong>TX Hash:</strong> {result.transactionHash.slice(0, 10)}...{result.transactionHash.slice(-8)}</div>
                )}
                {result.success && result.newTokenId && (
                  <div><strong>New Token ID:</strong> {result.newTokenId}</div>
                )}
                {!result.success && result.error && (
                  <div style={{ color: '#721c24' }}><strong>Error:</strong> {result.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ImportToBlockchain