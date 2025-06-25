import React, { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import type { ChainConfig } from '../utils/chainConfigs'

interface ImportedNFT {
  tokenId: string
  tokenURI?: string | null
  owner?: string | null
  creator?: string | null
  isTBA: boolean
  isSBT: boolean
  contractAddress: string
  chainId: number
  originalTokenInfo: string
}

interface ImportToBlockchainProps {
  importedNFTs: ImportedNFT[]
  selectedChain: ChainConfig | null
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
  'function importBatch(address targetNFT, tuple(string tokenURI, address to, address creator, bool isSBT, string originalTokenInfo, uint16 royaltyRate)[] memory imports) external payable returns (uint256[])',
  'function validateImportData(address targetNFT, string memory tokenURI, address to, address creator, bool isSBT, string memory originalTokenInfo, uint16 royaltyRate) external view returns (bool isValid, string memory reason)',
  'function isTokenImported(string memory originalTokenInfo) external view returns (bool)',
  'function getImportStats(address importer) external view returns (tuple(uint256 totalImported, uint256 totalFailed, uint256 lastImportTime))'
]

const ImportToBlockchain: React.FC<ImportToBlockchainProps> = ({
  importedNFTs,
  selectedChain,
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

  // Check wallet connection on mount
  useEffect(() => {
    checkWalletConnection()
  }, [])

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
    const allTokenInfos = importedNFTs.map(nft => nft.originalTokenInfo)
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
      // First, check if the JSONDataImporter is authorized
      const provider = new ethers.BrowserProvider(window.ethereum)
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
      const contract = new ethers.Contract(importerContractAddress, JSON_DATA_IMPORTER_ABI, signer)

      const selectedNFTsList = importedNFTs.filter(nft => selectedNFTs.has(nft.originalTokenInfo))
      
      // Debug log
      console.log('Gas estimation debug:', {
        importerContract: importerContractAddress,
        targetNFT: targetNFTContract,
        selectedCount: selectedNFTsList.length,
        firstNFT: selectedNFTsList[0]
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
        // Single import gas estimation
        const nft = selectedNFTsList[0]
        const gasEstimate = await contract.importSingleToken.estimateGas(
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
        // Check batch size limit (more permissive)
        if (selectedNFTsList.length > 50) {
          setGasEstimate(`Warning: Batch size (${selectedNFTsList.length}) is very large. Consider using smaller batches (≤50) if gas estimation fails.`)
          // Don't return - allow user to try
        }
        
        // Batch import gas estimation
        const importData = selectedNFTsList.map(nft => [
          nft.tokenURI || '',
          nft.owner || currentAccount,
          nft.creator || currentAccount,
          nft.isSBT || false,
          nft.originalTokenInfo,
          10 // royaltyRate
        ])
        
        const gasEstimate = await contract.importBatch.estimateGas(targetNFTContract, importData)
        setGasEstimate(gasEstimate.toString())
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
          }
          
          const tx = await contract.importSingleTokenWithTBA(
            targetNFTContract,
            nft.tokenURI || '',
            nft.owner || currentAccount,
            nft.creator || currentAccount,
            nft.isSBT,
            nft.originalTokenInfo,
            10,
            nft.tbaSourceToken || '',
            tbaRegistry,
            tbaImplementation,
            txOptions
          )
          
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
        
        // Batch import with TBA support
        const importData = selectedNFTsList.map(nft => [
          nft.tokenURI || '',
          nft.owner || currentAccount,
          nft.creator || currentAccount,
          nft.isSBT || false,
          nft.originalTokenInfo,
          10, // royaltyRate
          nft.tbaSourceToken || '' // tbaSourceToken
        ])

        try {
          const txOptions: any = {}
          if (customGasLimit) {
            txOptions.gasLimit = parseInt(customGasLimit)
          }
          
          const tx = await contract.importBatchWithTBA(targetNFTContract, importData, tbaRegistry, tbaImplementation, txOptions)
          const receipt = await tx.wait()
          
          // For batch imports, we'll mark all as successful
          // In a production app, you'd parse individual results from events
          selectedNFTsList.forEach(nft => {
            results.push({
              originalTokenInfo: nft.originalTokenInfo,
              success: true,
              transactionHash: receipt.hash
            })
          })
        } catch (error) {
          selectedNFTsList.forEach(nft => {
            results.push({
              originalTokenInfo: nft.originalTokenInfo,
              success: false,
              error: error instanceof Error ? error.message : 'Batch import failed'
            })
          })
        }
      }
    } catch (error) {
      console.error('Import failed:', error)
      alert('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }

    setImportResults(results)
    onImportComplete(results)
    setIsImporting(false)
  }

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
          <span>Selected: {selectedNFTs.size} / {importedNFTs.length}</span>
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

        <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #ddd', padding: '10px' }}>
          {importedNFTs.map((nft, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', padding: '8px', border: '1px solid #eee' }}>
              <input
                type="checkbox"
                checked={selectedNFTs.has(nft.originalTokenInfo)}
                onChange={() => toggleNFTSelection(nft.originalTokenInfo)}
                style={{ marginRight: '10px' }}
              />
              <div style={{ flex: 1 }}>
                <div><strong>Token:</strong> {nft.originalTokenInfo}</div>
                <div><strong>Owner:</strong> {nft.owner || 'Unknown'}</div>
                <div><strong>Creator:</strong> {nft.creator || 'Unknown'}</div>
                <div>
                  {nft.isSBT && <span style={{ backgroundColor: '#ff6b6b', color: 'white', padding: '2px 6px', borderRadius: '3px', fontSize: '12px', marginRight: '5px' }}>SBT</span>}
                  {nft.isTBA && <span style={{ backgroundColor: '#4ecdc4', color: 'white', padding: '2px 6px', borderRadius: '3px', fontSize: '12px' }}>TBA</span>}
                </div>
              </div>
            </div>
          ))}
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