import { useState } from 'react'
import { connectToNFTContract, getNFTMetadata, getTotalSupply, getNFTMetadataBatch } from './utils/contracts'
import type { ChainConfig } from './utils/chainConfigs'
import type { NFTMetadata, NFTOwnershipInfo } from './utils/contracts'
import { PRESET_CHAINS } from './utils/chainConfigs'
import ChainSelector from './components/ChainSelector'
import NFTDisplay from './components/NFTDisplay'
import NFTList from './components/NFTList'

function App() {
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
    
    try {
      const result = await connectToNFTContract(contractAddress, selectedChain)
      setContractInfo({ name: result.name, symbol: result.symbol })
      setConnectionStatus('success')
      
      // Try to get total supply
      try {
        const supply = await getTotalSupply(contractAddress, selectedChain)
        setTotalSupply(supply)
        setRangeEnd(Math.min(20, supply).toString())
      } catch {
        // totalSupply not supported, that's ok
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error')
      setConnectionStatus('error')
    }
  }

  const [ownershipInfo, setOwnershipInfo] = useState<NFTOwnershipInfo | null>(null)

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

  return (
    <div className="container">
      <h1 className="title">NFT Importer</h1>
      
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
    </div>
  )
}

export default App
