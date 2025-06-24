import { useState } from 'react'
import type { ChainConfig } from '../utils/chainConfigs'
import { PRESET_CHAINS } from '../utils/chainConfigs'

interface ChainSelectorProps {
  selectedChain: ChainConfig
  onChainChange: (chain: ChainConfig) => void
}

export default function ChainSelector({ selectedChain, onChainChange }: ChainSelectorProps) {
  const [isCustom, setIsCustom] = useState(false)
  const [customChain, setCustomChain] = useState<ChainConfig>({
    chainId: 0,
    name: '',
    rpcUrl: '',
    nativeCurrency: ''
  })

  const handlePresetChange = (chainId: number) => {
    const chain = PRESET_CHAINS.find(c => c.chainId === chainId)
    if (chain) {
      onChainChange(chain)
      setIsCustom(false)
    }
  }

  const handleCustomChainChange = () => {
    if (customChain.chainId && customChain.name && customChain.rpcUrl && customChain.nativeCurrency) {
      onChainChange(customChain)
    }
  }

  return (
    <div className="card">
      <h2 className="subtitle">Chain Selection</h2>
      
      <div className="form-group">
        <label className="label">Select Chain</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {PRESET_CHAINS.map((chain) => (
            <label key={chain.chainId} style={{ display: 'flex', alignItems: 'center', marginRight: '1rem' }}>
              <input
                type="radio"
                name="chain"
                value={chain.chainId}
                checked={selectedChain.chainId === chain.chainId && !isCustom}
                onChange={() => handlePresetChange(chain.chainId)}
                style={{ marginRight: '0.5rem' }}
              />
              {chain.name}
            </label>
          ))}
          <label style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="radio"
              name="chain"
              checked={isCustom}
              onChange={() => setIsCustom(true)}
              style={{ marginRight: '0.5rem' }}
            />
            Custom
          </label>
        </div>
      </div>

      {isCustom && (
        <div>
          <div className="form-group">
            <label className="label">Chain Name</label>
            <input
              type="text"
              value={customChain.name}
              onChange={(e) => setCustomChain({ ...customChain, name: e.target.value })}
              placeholder="Custom Chain"
              className="input"
            />
          </div>
          
          <div className="form-group">
            <label className="label">RPC URL</label>
            <input
              type="text"
              value={customChain.rpcUrl}
              onChange={(e) => setCustomChain({ ...customChain, rpcUrl: e.target.value })}
              placeholder="https://"
              className="input"
            />
          </div>
          
          <div className="form-group">
            <label className="label">Chain ID</label>
            <input
              type="number"
              value={customChain.chainId || ''}
              onChange={(e) => setCustomChain({ ...customChain, chainId: parseInt(e.target.value) || 0 })}
              placeholder="1337"
              className="input"
            />
          </div>
          
          <div className="form-group">
            <label className="label">Native Currency</label>
            <input
              type="text"
              value={customChain.nativeCurrency}
              onChange={(e) => setCustomChain({ ...customChain, nativeCurrency: e.target.value })}
              placeholder="ETH"
              className="input"
            />
          </div>
          
          <button 
            onClick={handleCustomChainChange}
            className="button"
            disabled={!customChain.chainId || !customChain.name || !customChain.rpcUrl || !customChain.nativeCurrency}
          >
            Use Custom Chain
          </button>
        </div>
      )}
      
      <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
        <strong>Selected Chain:</strong> {selectedChain.name || 'None'}<br />
        <strong>Chain ID:</strong> {selectedChain.chainId || 'N/A'}<br />
        <strong>RPC:</strong> {selectedChain.rpcUrl || 'N/A'}
      </div>
    </div>
  )
}