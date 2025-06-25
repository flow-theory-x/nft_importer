import { useState, useEffect } from 'react'
import { connectToNFTContract, getNFTMetadata, getTotalSupply, getNFTMetadataBatch, getLastId, getLastTokenId } from './utils/contracts'
import type { ChainConfig } from './utils/chainConfigs'
import type { NFTMetadata, NFTOwnershipInfo } from './utils/contracts'
import { PRESET_CHAINS } from './utils/chainConfigs'
import ChainSelector from './components/ChainSelector'
import NFTDisplay from './components/NFTDisplay'
import NFTList from './components/NFTList'
import ImportedNFTList from './components/ImportedNFTList'
import ImportToBlockchain from './components/ImportToBlockchain'

function App() {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export')
  const [selectedChain, setSelectedChain] = useState<ChainConfig>(PRESET_CHAINS[0]) // Default to Ethereum
  const [contractAddress, setContractAddress] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle')
  const [contractInfo, setContractInfo] = useState<{ name: string; symbol: string } | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  
  const [tokenId, setTokenId] = useState('')
  const [metadataStatus, setMetadataStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [nftMetadata, setNftMetadata] = useState<NFTMetadata | null>(null)
  const [metadataError, setMetadataError] = useState('')
  
  const [totalSupply, setTotalSupply] = useState<number | null>(null)
  const [lastId, setLastId] = useState<number | null>(null)
  const [lastTokenId, setLastTokenId] = useState<number | null>(null)
  const [listMode, setListMode] = useState<'single' | 'list'>('single')
  const [nftList, setNftList] = useState<Array<{ tokenId: number; metadata: NFTMetadata | null; error?: string }>>([])
  const [listStatus, setListStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [listError, setListError] = useState('')
  
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(20)
  const [rangeStart, setRangeStart] = useState('1')
  const [rangeEnd, setRangeEnd] = useState('20')

  const handleConnect = async () => {
    if (!contractAddress) return
    
    setConnectionStatus('connecting')
    setErrorMessage('')
    setNftMetadata(null)
    setMetadataStatus('idle')
    setNftList([])
    setListStatus('idle')
    setTotalSupply(null)
    setLastId(null)
    setLastTokenId(null)
    
    try {
      const result = await connectToNFTContract(contractAddress, selectedChain)
      setContractInfo({ name: result.name, symbol: result.symbol })
      setConnectionStatus('success')
      
      // Try to get various supply/count values
      let maxId = 0
      
      try {
        const supply = await getTotalSupply(contractAddress, selectedChain)
        setTotalSupply(supply)
        maxId = Math.max(maxId, supply)
      } catch {
        // totalSupply not supported, that's ok
      }
      
      try {
        const lastIdValue = await getLastId(contractAddress, selectedChain)
        if (lastIdValue !== null) {
          setLastId(lastIdValue)
          maxId = Math.max(maxId, lastIdValue)
        }
      } catch {
        // _lastId not supported, that's ok
      }
      
      try {
        const lastTokenIdValue = await getLastTokenId(contractAddress, selectedChain)
        if (lastTokenIdValue !== null) {
          setLastTokenId(lastTokenIdValue)
          maxId = Math.max(maxId, lastTokenIdValue)
        }
      } catch {
        // _lastTokenId not supported, that's ok
      }
      
      // Set rangeEnd to the maximum found value
      if (maxId > 0) {
        setRangeEnd(maxId.toString())
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error')
      setConnectionStatus('error')
    }
  }

  const [ownershipInfo, setOwnershipInfo] = useState<NFTOwnershipInfo | null>(null)
  
  // Import states
  const [importJson, setImportJson] = useState('')
  const [importStatus, setImportStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle')
  const [importError, setImportError] = useState('')
  const [importedNFTs, setImportedNFTs] = useState<any[]>([])
  const [importedContractInfo, setImportedContractInfo] = useState<{ address: string; chainId: number } | null>(null)
  const [importResults, setImportResults] = useState<any[]>([])

  // Wallet connection states
  const [walletConnected, setWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')
  const [walletChainId, setWalletChainId] = useState<number | null>(null)
  const [walletError, setWalletError] = useState('')

  const handleGetMetadata = async () => {
    if (!contractAddress || !tokenId) return
    
    setMetadataStatus('loading')
    setMetadataError('')
    setOwnershipInfo(null)
    
    try {
      const metadata = await getNFTMetadata(contractAddress, parseInt(tokenId), selectedChain)
      setNftMetadata(metadata)
      setMetadataStatus('success')
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : 'Unknown error')
      setMetadataStatus('error')
    }
  }

  const handleLoadNFTList = async () => {
    if (!contractAddress) return
    
    const start = parseInt(rangeStart)
    const end = parseInt(rangeEnd)
    
    if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
      setListError('Invalid range. Please enter valid token IDs.')
      return
    }
    
    if (end - start > 100) {
      setListError('Range too large. Please limit to 100 NFTs at a time.')
      return
    }
    
    setListStatus('loading')
    setListError('')
    setNftList([])
    
    try {
      const tokenIds = Array.from({ length: end - start + 1 }, (_, i) => start + i)
      const results = await getNFTMetadataBatch(contractAddress, tokenIds, selectedChain)
      setNftList(results)
      setListStatus('success')
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Unknown error')
      setListStatus('error')
    }
  }

  const handleTokenSelect = (tokenId: number) => {
    setTokenId(tokenId.toString())
    setListMode('single')
    const nft = nftList.find(n => n.tokenId === tokenId)
    if (nft && nft.metadata) {
      setNftMetadata(nft.metadata)
      setOwnershipInfo(nft.ownershipInfo || null)
      setMetadataStatus('success')
    }
  }

  const handleImportJson = () => {
    setImportStatus('processing')
    setImportError('')
    
    try {
      const parsedData = JSON.parse(importJson)
      
      if (!Array.isArray(parsedData)) {
        throw new Error('JSON must be an array of NFT objects')
      }
      
      if (parsedData.length === 0) {
        throw new Error('JSON array is empty')
      }
      
      // Validate required fields in first item
      const firstItem = parsedData[0]
      if (!firstItem.tokenId || !firstItem.contractAddress) {
        throw new Error('Invalid JSON format. Each item must have tokenId and contractAddress')
      }
      
      // Extract contract info from first item
      const contractInfo = {
        address: firstItem.contractAddress,
        chainId: firstItem.chainId || 1
      }
      
      // Find matching chain config
      const matchingChain = PRESET_CHAINS.find(chain => chain.chainId === contractInfo.chainId)
      if (matchingChain) {
        setSelectedChain(matchingChain)
      }
      
      setImportedNFTs(parsedData)
      setImportedContractInfo(contractInfo)
      setImportStatus('success')
      
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Invalid JSON format')
      setImportStatus('error')
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setImportJson(content)
    }
    reader.readAsText(file)
  }

  // Check if MetaMask is installed
  const checkMetaMaskInstalled = () => {
    return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined'
  }

  // Connect to MetaMask
  const connectWallet = async () => {
    setWalletError('')
    
    if (!checkMetaMaskInstalled()) {
      setWalletError('MetaMask is not installed. Please install MetaMask to connect your wallet.')
      return
    }

    try {
      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      })

      if (accounts.length > 0) {
        setWalletAddress(accounts[0])
        setWalletConnected(true)
        
        // Get current chain ID
        const chainId = await window.ethereum.request({
          method: 'eth_chainId'
        })
        
        // Convert hex to decimal
        const decimalChainId = parseInt(chainId, 16)
        setWalletChainId(decimalChainId)
        
        // Try to find matching chain in preset chains
        const matchingChain = PRESET_CHAINS.find(chain => chain.chainId === decimalChainId)
        if (matchingChain) {
          setSelectedChain(matchingChain)
        }
      }
    } catch (error: any) {
      if (error.code === 4001) {
        setWalletError('Please connect to MetaMask.')
      } else {
        setWalletError('An error occurred while connecting to MetaMask.')
      }
    }
  }

  // Disconnect wallet
  const disconnectWallet = () => {
    setWalletConnected(false)
    setWalletAddress('')
    setWalletChainId(null)
    setWalletError('')
  }

  // Get chain name by ID
  const getChainName = (chainId: number) => {
    const chains: { [key: number]: string } = {
      1: 'Ethereum',
      137: 'Polygon',
      21201: 'Private'
    }
    return chains[chainId] || `Chain ${chainId}`
  }

  // Format wallet address
  const formatWalletAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Listen for account and chain changes
  useEffect(() => {
    if (checkMetaMaskInstalled() && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnectWallet()
        } else {
          setWalletAddress(accounts[0])
        }
      }

      const handleChainChanged = (chainId: string) => {
        const decimalChainId = parseInt(chainId, 16)
        setWalletChainId(decimalChainId)
        const matchingChain = PRESET_CHAINS.find(chain => chain.chainId === decimalChainId)
        if (matchingChain) {
          setSelectedChain(matchingChain)
        }
      }

      window.ethereum.on('accountsChanged', handleAccountsChanged)
      window.ethereum.on('chainChanged', handleChainChanged)

      // Check if already connected
      Promise.all([
        window.ethereum.request({ method: 'eth_accounts' }),
        window.ethereum.request({ method: 'eth_chainId' })
      ])
        .then(([accounts, chainId]: [string[], string]) => {
          if (accounts.length > 0) {
            setWalletAddress(accounts[0])
            setWalletConnected(true)
            const decimalChainId = parseInt(chainId, 16)
            setWalletChainId(decimalChainId)
          }
        })
        .catch(console.error)

      return () => {
        if (window.ethereum) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
          window.ethereum.removeListener('chainChanged', handleChainChanged)
        }
      }
    }
  }, [])

  return (
    <div className="container">
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h1 className="title" style={{ margin: 0 }}>NFT Importer</h1>
          
          {/* Wallet Connection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {walletConnected ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  backgroundColor: '#e8f5e8',
                  color: '#2d6e2d',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  fontWeight: '600'
                }}>
                  🟢 {formatWalletAddress(walletAddress)}
                </div>
                {walletChainId && (
                  <div style={{
                    backgroundColor: '#e3f2fd',
                    color: '#1565c0',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontWeight: '600'
                  }}>
                    {getChainName(walletChainId)} ({walletChainId})
                  </div>
                )}
                <button
                  onClick={disconnectWallet}
                  style={{
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                style={{
                  backgroundColor: '#f7931a',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                🦊 Connect MetaMask
              </button>
            )}
          </div>
        </div>

        {walletError && (
          <div style={{
            backgroundColor: '#f8d7da',
            color: '#721c24',
            padding: '0.75rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.9rem'
          }}>
            {walletError}
          </div>
        )}

        <nav style={{ 
          display: 'flex', 
          gap: '1rem', 
          borderBottom: '1px solid #e9ecef',
          paddingBottom: '1rem'
        }}>
          <button
            onClick={() => setActiveTab('export')}
            style={{
              backgroundColor: activeTab === 'export' ? '#007bff' : 'transparent',
              color: activeTab === 'export' ? 'white' : '#007bff',
              border: `1px solid #007bff`,
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '600',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'export') {
                e.currentTarget.style.backgroundColor = '#007bff'
                e.currentTarget.style.color = 'white'
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'export') {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = '#007bff'
              }
            }}
          >
            Export
          </button>
          <button
            onClick={() => setActiveTab('import')}
            style={{
              backgroundColor: activeTab === 'import' ? '#007bff' : 'transparent',
              color: activeTab === 'import' ? 'white' : '#007bff',
              border: `1px solid #007bff`,
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '600',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'import') {
                e.currentTarget.style.backgroundColor = '#007bff'
                e.currentTarget.style.color = 'white'
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'import') {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = '#007bff'
              }
            }}
          >
            Import
          </button>
        </nav>
      </header>

      {activeTab === 'export' && (
        <>
          <ChainSelector 
            selectedChain={selectedChain}
            onChainChange={setSelectedChain}
          />
      
      <div className="card">
        <h2 className="subtitle">NFT Contract Connection</h2>
        
        <div className="form-group">
          <label htmlFor="contract" className="label">
            NFT Contract Address
          </label>
          <input
            id="contract"
            type="text"
            value={contractAddress}
            onChange={(e) => setContractAddress(e.target.value)}
            placeholder="0x..."
            className="input"
          />
        </div>
        
        <button
          onClick={handleConnect}
          disabled={!contractAddress || connectionStatus === 'connecting'}
          className="button"
        >
          {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect to Contract'}
        </button>
        
        {connectionStatus === 'success' && contractInfo && (
          <div className="alert alert-success">
            <p><strong>Successfully connected to NFT contract!</strong></p>
            <p>Name: {contractInfo.name}</p>
            <p>Symbol: {contractInfo.symbol}</p>
            {totalSupply !== null && <p>Total Supply: {totalSupply.toLocaleString()}</p>}
            {lastId !== null && <p>_lastId: {lastId.toLocaleString()}</p>}
            {lastTokenId !== null && <p>_lastTokenId: {lastTokenId.toLocaleString()}</p>}
          </div>
        )}
        
        {connectionStatus === 'error' && (
          <div className="alert alert-error">
            <p><strong>Failed to connect to NFT contract.</strong></p>
            {errorMessage && <p>{errorMessage}</p>}
          </div>
        )}
      </div>

      {connectionStatus === 'success' && (
        <div className="card">
          <h2 className="subtitle">NFT Viewer</h2>
          
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="radio"
                  name="viewMode"
                  checked={listMode === 'single'}
                  onChange={() => setListMode('single')}
                  style={{ marginRight: '0.5rem' }}
                />
                Single NFT
              </label>
              <label style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="radio"
                  name="viewMode"
                  checked={listMode === 'list'}
                  onChange={() => setListMode('list')}
                  style={{ marginRight: '0.5rem' }}
                />
                NFT List
              </label>
            </div>
          </div>

          {listMode === 'single' ? (
            <>
              <div className="form-group">
                <label htmlFor="tokenId" className="label">
                  Token ID
                </label>
                <input
                  id="tokenId"
                  type="number"
                  value={tokenId}
                  onChange={(e) => setTokenId(e.target.value)}
                  placeholder="1"
                  className="input"
                  min="0"
                />
              </div>
              
              <button
                onClick={handleGetMetadata}
                disabled={!tokenId || metadataStatus === 'loading'}
                className="button"
              >
                {metadataStatus === 'loading' ? 'Loading...' : 'Get NFT Metadata'}
              </button>
              
              {metadataStatus === 'error' && (
                <div className="alert alert-error">
                  <p><strong>Failed to get NFT metadata.</strong></p>
                  {metadataError && <p>{metadataError}</p>}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label htmlFor="rangeStart" className="label">
                    Start Token ID
                  </label>
                  <input
                    id="rangeStart"
                    type="number"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    placeholder="1"
                    className="input"
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="rangeEnd" className="label">
                    End Token ID
                  </label>
                  <input
                    id="rangeEnd"
                    type="number"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    placeholder="20"
                    className="input"
                    min="1"
                  />
                </div>
              </div>
              
              <button
                onClick={handleLoadNFTList}
                disabled={!rangeStart || !rangeEnd || listStatus === 'loading'}
                className="button"
              >
                {listStatus === 'loading' ? 'Loading...' : 'Load NFT List'}
              </button>
              
              {listError && (
                <div className="alert alert-error">
                  <p><strong>Error:</strong> {listError}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

          {listMode === 'list' && (
            <NFTList
              nfts={nftList}
              isLoading={listStatus === 'loading'}
              onTokenSelect={handleTokenSelect}
              contractAddress={contractAddress}
              selectedChain={selectedChain}
              contractName={contractInfo?.name}
            />
          )}

          {listMode === 'single' && metadataStatus === 'success' && nftMetadata && (
            <NFTDisplay
              metadata={nftMetadata}
              tokenId={parseInt(tokenId)}
              contractAddress={contractAddress}
              ownershipInfo={ownershipInfo}
              selectedChain={selectedChain}
            />
          )}
        </>
      )}

      {activeTab === 'import' && (
        <>
          {importStatus === 'success' && importedNFTs.length > 0 && (
            <>
              <ImportToBlockchain
                importedNFTs={importedNFTs}
                selectedChain={selectedChain}
                walletChainId={walletChainId}
                onImportComplete={(results) => setImportResults(results)}
              />
              
              <ImportedNFTList 
                nfts={importedNFTs} 
                contractInfo={importedContractInfo}
              />
            </>
          )}

          <div className="card" style={{ marginTop: importStatus === 'success' && importedNFTs.length > 0 ? '1rem' : '0' }}>
            <h2 className="subtitle">Import NFT Collection</h2>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="jsonFile" className="label">
                Upload JSON File
              </label>
              <input
                id="jsonFile"
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                style={{ marginBottom: '1rem', display: 'block' }}
              />
              <div style={{ fontSize: '0.8rem', color: '#666' }}>
                Select a JSON file exported from the Export tab
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="jsonInput" className="label">
                Or paste JSON data
              </label>
              <textarea
                id="jsonInput"
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder="Paste your exported JSON data here..."
                style={{
                  width: '100%',
                  height: '200px',
                  padding: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  resize: 'vertical'
                }}
              />
            </div>

            <button
              onClick={handleImportJson}
              disabled={!importJson.trim() || importStatus === 'processing'}
              className="button"
              style={{
                backgroundColor: importJson.trim() && importStatus !== 'processing' ? '#007bff' : '#6c757d',
                cursor: importJson.trim() && importStatus !== 'processing' ? 'pointer' : 'not-allowed'
              }}
            >
              {importStatus === 'processing' ? 'Processing...' : 'Import JSON'}
            </button>

            {importStatus === 'error' && (
              <div className="alert alert-error" style={{ marginTop: '1rem' }}>
                <p><strong>Import Error:</strong> {importError}</p>
              </div>
            )}

            {importStatus === 'success' && (
              <div className="alert alert-success" style={{ marginTop: '1rem' }}>
                <p><strong>Successfully imported {importedNFTs.length} NFT(s)!</strong></p>
                {importedContractInfo && (
                  <p>Contract: {importedContractInfo.address}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default App
