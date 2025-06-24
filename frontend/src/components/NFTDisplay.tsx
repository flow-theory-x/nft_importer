import { useState, useEffect } from 'react'
import type { NFTMetadata, NFTOwnershipInfo } from '../utils/contracts'
import type { ChainConfig } from '../utils/chainConfigs'
import { getNFTOwnershipInfo, isTBA, isSBT } from '../utils/contracts'

interface NFTDisplayProps {
  metadata: NFTMetadata
  tokenId: number
  contractAddress: string
  ownershipInfo?: NFTOwnershipInfo | null
  selectedChain?: ChainConfig
}

export default function NFTDisplay({ metadata, tokenId, contractAddress, ownershipInfo, selectedChain }: NFTDisplayProps) {
  const [currentOwnershipInfo, setCurrentOwnershipInfo] = useState<NFTOwnershipInfo | null>(ownershipInfo || null)
  const [loadingOwnership, setLoadingOwnership] = useState(false)
  const [ownerIsTBA, setOwnerIsTBA] = useState<boolean | null>(null)
  const [tokenIsSBT, setTokenIsSBT] = useState<boolean | null>(null)

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const fetchOwnershipInfo = async () => {
    if (!selectedChain || loadingOwnership) return

    setLoadingOwnership(true)
    try {
      const ownership = await getNFTOwnershipInfo(contractAddress, tokenId, selectedChain)
      setCurrentOwnershipInfo(ownership)
      
      // Check if owner is TBA and if token is SBT
      if (ownership.owner) {
        const [isOwnerTBA, isTokenSBT] = await Promise.all([
          isTBA(ownership.owner, selectedChain),
          isSBT(contractAddress, tokenId, selectedChain)
        ])
        setOwnerIsTBA(isOwnerTBA)
        setTokenIsSBT(isTokenSBT)
      }
    } catch (error) {
      console.warn('Failed to fetch ownership info:', error)
    } finally {
      setLoadingOwnership(false)
    }
  }

  useEffect(() => {
    if (!currentOwnershipInfo && selectedChain) {
      fetchOwnershipInfo()
    } else if (currentOwnershipInfo && selectedChain && (ownerIsTBA === null || tokenIsSBT === null)) {
      // Check if existing owner is TBA and if token is SBT
      Promise.all([
        ownerIsTBA === null ? isTBA(currentOwnershipInfo.owner, selectedChain) : Promise.resolve(ownerIsTBA),
        tokenIsSBT === null ? isSBT(contractAddress, tokenId, selectedChain) : Promise.resolve(tokenIsSBT)
      ]).then(([isTBAResult, isSBTResult]) => {
        if (ownerIsTBA === null) setOwnerIsTBA(isTBAResult)
        if (tokenIsSBT === null) setTokenIsSBT(isSBTResult)
      })
    }
  }, [tokenId, contractAddress, selectedChain, currentOwnershipInfo])
  return (
    <div className="card">
      <h2 className="subtitle">NFT Details</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
        <div>
          <img
            src={metadata.image}
            alt={metadata.name}
            style={{
              width: '100%',
              maxWidth: '400px',
              height: 'auto',
              borderRadius: '8px',
              border: '1px solid #ddd'
            }}
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDQwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMDAgMTAwTDI2MCAyMDBMMjAwIDMwMEwxNDAgMjAwTDIwMCAxMDBaIiBmaWxsPSIjOUI5QkEwIi8+Cjx0ZXh0IHg9IjIwMCIgeT0iMzQwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOUI5QkEwIiBmb250LXNpemU9IjE0Ij5JbWFnZSBub3QgZm91bmQ8L3RleHQ+Cjwvc3ZnPgo='
            }}
          />
        </div>
        
        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <h3 style={{ margin: '0', fontSize: '1.5rem' }}>{metadata.name}</h3>
              {tokenIsSBT && (
                <span style={{
                  backgroundColor: '#dc3545',
                  color: 'white',
                  padding: '0.15rem 0.4rem',
                  borderRadius: '12px',
                  fontSize: '0.7rem',
                  fontWeight: '600'
                }}>
                  SBT
                </span>
              )}
            </div>
            <p style={{ margin: '0', color: '#666', fontSize: '0.9rem' }}>
              Token ID: {tokenId} | Contract: {formatAddress(contractAddress)}
            </p>
          </div>
          
          {/* Ownership Information */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0' }}>Ownership</h4>
            {currentOwnershipInfo ? (
              <div style={{ fontSize: '0.9rem' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Current Owner:</strong>{' '}
                  <span style={{ 
                    fontFamily: 'monospace', 
                    backgroundColor: '#f8f9fa', 
                    padding: '0.25rem 0.5rem', 
                    borderRadius: '4px',
                    fontSize: '0.8rem'
                  }}>
                    {formatAddress(currentOwnershipInfo.owner)}
                  </span>
                  {ownerIsTBA && (
                    <span style={{
                      marginLeft: '0.5rem',
                      backgroundColor: '#007bff',
                      color: 'white',
                      padding: '0.15rem 0.4rem',
                      borderRadius: '12px',
                      fontSize: '0.7rem',
                      fontWeight: '600'
                    }}>
                      TBA
                    </span>
                  )}
                </div>
                {currentOwnershipInfo.creator && (
                  <div>
                    <strong>Creator:</strong>{' '}
                    <span style={{ 
                      fontFamily: 'monospace', 
                      backgroundColor: '#f8f9fa', 
                      padding: '0.25rem 0.5rem', 
                      borderRadius: '4px',
                      fontSize: '0.8rem'
                    }}>
                      {formatAddress(currentOwnershipInfo.creator)}
                    </span>
                    {currentOwnershipInfo.owner === currentOwnershipInfo.creator && (
                      <span style={{ 
                        marginLeft: '0.5rem', 
                        color: '#28a745', 
                        fontSize: '0.8rem',
                        fontWeight: '600'
                      }}>
                        (Original Owner)
                      </span>
                    )}
                  </div>
                )}
                {!currentOwnershipInfo.creator && (
                  <div style={{ fontSize: '0.8rem', color: '#666', fontStyle: 'italic' }}>
                    Creator information not available
                  </div>
                )}
              </div>
            ) : loadingOwnership ? (
              <div style={{ fontSize: '0.9rem', color: '#666', fontStyle: 'italic' }}>
                Loading ownership information...
              </div>
            ) : (
              <div style={{ fontSize: '0.9rem' }}>
                <button
                  onClick={fetchOwnershipInfo}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#4338CA',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  Load ownership information
                </button>
              </div>
            )}
          </div>
          
          {metadata.description && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Description</h4>
              <p style={{ margin: '0', lineHeight: '1.5' }}>{metadata.description}</p>
            </div>
          )}
          
          {metadata.attributes && metadata.attributes.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 1rem 0' }}>Attributes</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
                {metadata.attributes.map((attr, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '0.75rem',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '6px',
                      border: '1px solid #e9ecef'
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
                      {attr.trait_type}
                    </div>
                    <div style={{ fontWeight: '600' }}>{attr.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}