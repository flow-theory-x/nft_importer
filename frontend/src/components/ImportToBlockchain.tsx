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
  const [walletConnected, setWalletConnected] = useState(false)
  const [currentAccount, setCurrentAccount] = useState<string>('')

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

  const estimateGas = async () => {
    if (!walletConnected || !importerContractAddress || !targetNFTContract || selectedNFTs.size === 0) {
      return
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const contract = new ethers.Contract(importerContractAddress, JSON_DATA_IMPORTER_ABI, signer)

      const selectedNFTsList = importedNFTs.filter(nft => selectedNFTs.has(nft.originalTokenInfo))
      
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
        // Batch import gas estimation
        const importData = selectedNFTsList.map(nft => ({
          tokenURI: nft.tokenURI || '',
          to: nft.owner || currentAccount,
          creator: nft.creator || currentAccount,
          isSBT: nft.isSBT,
          originalTokenInfo: nft.originalTokenInfo,
          royaltyRate: 10
        }))
        
        const gasEstimate = await contract.importBatch.estimateGas(targetNFTContract, importData)
        setGasEstimate(gasEstimate.toString())
      }
    } catch (error) {
      console.error('Gas estimation failed:', error)
      setGasEstimate('Estimation failed')
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
          const tx = await contract.importSingleToken(
            targetNFTContract,
            nft.tokenURI || '',
            nft.owner || currentAccount,
            nft.creator || currentAccount,
            nft.isSBT,
            nft.originalTokenInfo,
            10
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
        // Batch import
        const importData = selectedNFTsList.map(nft => ({
          tokenURI: nft.tokenURI || '',
          to: nft.owner || currentAccount,
          creator: nft.creator || currentAccount,
          isSBT: nft.isSBT,
          originalTokenInfo: nft.originalTokenInfo,
          royaltyRate: 10
        }))

        try {
          const tx = await contract.importBatch(targetNFTContract, importData)
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
          <button onClick={estimateGas} style={{ padding: '8px 16px', marginRight: '10px' }}>
            Estimate Gas
          </button>
          {gasEstimate && <span>Estimated Gas: {gasEstimate}</span>}
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