import { useState } from 'react'
import { connectToNFTContract } from './utils/contracts'
import type { ChainConfig } from './utils/chainConfigs'
import { PRESET_CHAINS } from './utils/chainConfigs'
import ChainSelector from './components/ChainSelector'

function App() {
  const [selectedChain, setSelectedChain] = useState<ChainConfig>(PRESET_CHAINS[0]) // Default to Ethereum
  const [contractAddress, setContractAddress] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle')
  const [contractInfo, setContractInfo] = useState<{ name: string; symbol: string } | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const handleConnect = async () => {
    if (!contractAddress) return
    
    setConnectionStatus('connecting')
    setErrorMessage('')
    
    try {
      const result = await connectToNFTContract(contractAddress, selectedChain)
      setContractInfo({ name: result.name, symbol: result.symbol })
      setConnectionStatus('success')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error')
      setConnectionStatus('error')
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
          </div>
        )}
        
        {connectionStatus === 'error' && (
          <div className="alert alert-error">
            <p><strong>Failed to connect to NFT contract.</strong></p>
            {errorMessage && <p>{errorMessage}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
