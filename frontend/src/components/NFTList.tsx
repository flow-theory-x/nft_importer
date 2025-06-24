import { useState, useEffect } from 'react'
import type { NFTMetadata, NFTOwnershipInfo } from '../utils/contracts'
import type { ChainConfig } from '../utils/chainConfigs'
import { getNFTOwnershipInfo, isTBA, isSBT } from '../utils/contracts'

interface NFTItem {
  tokenId: number
  metadata: NFTMetadata | null
  tokenURI?: string
  ownershipInfo?: NFTOwnershipInfo | null
  error?: string
}

interface NFTListProps {
  nfts: NFTItem[]
  isLoading: boolean
  onTokenSelect?: (tokenId: number) => void
  contractAddress?: string
  selectedChain?: ChainConfig
}

export default function NFTList({ nfts, isLoading, onTokenSelect, contractAddress, selectedChain }: NFTListProps) {
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set())
  const [ownershipCache, setOwnershipCache] = useState<Map<number, NFTOwnershipInfo | null>>(new Map())
  const [loadingOwnership, setLoadingOwnership] = useState<Set<number>>(new Set())
  const [tbaCache, setTbaCache] = useState<Map<string, boolean>>(new Map())
  const [sbtCache, setSbtCache] = useState<Map<number, boolean>>(new Map())
  const [exportedJson, setExportedJson] = useState<string | null>(null)
  const [allSBT, setAllSBT] = useState(false)

  const handleImageError = (tokenId: number) => {
    setImageErrors(prev => new Set(prev).add(tokenId))
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  const fetchOwnershipInfo = async (tokenId: number) => {
    if (!contractAddress || !selectedChain || loadingOwnership.has(tokenId) || ownershipCache.has(tokenId)) {
      return
    }

    setLoadingOwnership(prev => new Set(prev).add(tokenId))

    try {
      const ownershipInfo = await getNFTOwnershipInfo(contractAddress, tokenId, selectedChain)
      setOwnershipCache(prev => new Map(prev).set(tokenId, ownershipInfo))
      
      // Check if owner is TBA and if token is SBT
      const promises = []
      
      if (ownershipInfo.owner && !tbaCache.has(ownershipInfo.owner)) {
        promises.push(
          isTBA(ownershipInfo.owner, selectedChain).then(isOwnerTBA => 
            setTbaCache(prev => new Map(prev).set(ownershipInfo.owner, isOwnerTBA))
          )
        )
      }
      
      if (!sbtCache.has(tokenId)) {
        promises.push(
          isSBT(contractAddress, tokenId, selectedChain).then(isTokenSBT =>
            setSbtCache(prev => new Map(prev).set(tokenId, isTokenSBT))
          )
        )
      }
      
      if (promises.length > 0) {
        await Promise.all(promises)
      }
    } catch (error) {
      console.warn(`Failed to fetch ownership for token ${tokenId}:`, error)
      setOwnershipCache(prev => new Map(prev).set(tokenId, null))
    } finally {
      setLoadingOwnership(prev => {
        const newSet = new Set(prev)
        newSet.delete(tokenId)
        return newSet
      })
    }
  }

  const getOwnershipInfo = (nft: NFTItem): NFTOwnershipInfo | null => {
    if (nft.ownershipInfo) {
      return nft.ownershipInfo
    }
    return ownershipCache.get(nft.tokenId) || null
  }


  // Fetch ownership info for NFTs that don't have it
  useEffect(() => {
    if (!contractAddress || !selectedChain) return

    const nftsWithoutOwnership = nfts.filter(nft => 
      nft.metadata && !nft.ownershipInfo && !ownershipCache.has(nft.tokenId) && !loadingOwnership.has(nft.tokenId)
    )

    // Fetch ownership info for a few NFTs at a time to avoid overwhelming the API
    nftsWithoutOwnership.slice(0, 3).forEach(nft => {
      fetchOwnershipInfo(nft.tokenId)
    })
  }, [nfts, contractAddress, selectedChain, ownershipCache, loadingOwnership])


  const getPlaceholderImage = () => {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMDAgNTBMMTMwIDEwMEwxMDAgMTUwTDcwIDEwMEwxMDAgNTBaIiBmaWxsPSIjOUI5QkEwIi8+Cjx0ZXh0IHg9IjEwMCIgeT0iMTcwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOUI5QkEwIiBmb250LXNpemU9IjEyIj5ObyBJbWFnZTwvdGV4dD4KPC9zdmc+Cg=='
  }

  const handleExportJson = () => {
    const exportData = nfts.map(nft => {
      const ownershipInfo = getOwnershipInfo(nft)
      return {
        tokenId: nft.tokenId,
        tokenURI: nft.tokenURI || null,
        owner: ownershipInfo?.owner || null,
        creator: ownershipInfo?.creator || null,
        isTBA: ownershipInfo?.owner ? tbaCache.get(ownershipInfo.owner) || false : false,
        isSBT: allSBT ? true : (sbtCache.get(nft.tokenId) || false),
        contractAddress: contractAddress,
        chainId: selectedChain?.chainId,
        originalTokenInfo: `${contractAddress}/${nft.tokenId}`,
        error: nft.error
      }
    })
    
    const jsonString = JSON.stringify(exportData, null, 2)
    setExportedJson(jsonString)
  }

  if (isLoading) {
    return (
      <div className="card">
        <h2 className="subtitle">NFT Collection</h2>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ marginBottom: '1rem' }}>Loading NFTs...</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                style={{
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  padding: '1rem',
                  border: '1px solid #e9ecef',
                  animation: 'pulse 1.5s ease-in-out infinite alternate'
                }}
              >
                <div style={{ 
                  width: '100%', 
                  height: '150px', 
                  backgroundColor: '#e9ecef', 
                  borderRadius: '6px',
                  marginBottom: '0.5rem'
                }} />
                <div style={{ 
                  height: '20px', 
                  backgroundColor: '#e9ecef', 
                  borderRadius: '4px',
                  marginBottom: '0.5rem'
                }} />
                <div style={{ 
                  height: '16px', 
                  backgroundColor: '#e9ecef', 
                  borderRadius: '4px',
                  width: '60%'
                }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {exportedJson && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h3 style={{ margin: 0 }}>Exported JSON Data</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={allSBT}
                  onChange={(e) => {
                    setAllSBT(e.target.checked)
                    // Re-generate JSON when checkbox changes
                    if (exportedJson) {
                      const newAllSBT = e.target.checked
                      const exportData = nfts.map(nft => {
                        const ownershipInfo = getOwnershipInfo(nft)
                        return {
                          tokenId: nft.tokenId,
                          tokenURI: nft.tokenURI || null,
                          owner: ownershipInfo?.owner || null,
                          creator: ownershipInfo?.creator || null,
                          isTBA: ownershipInfo?.owner ? tbaCache.get(ownershipInfo.owner) || false : false,
                          isSBT: newAllSBT ? true : (sbtCache.get(nft.tokenId) || false),
                          contractAddress: contractAddress,
                          chainId: selectedChain?.chainId,
                          originalTokenInfo: `${contractAddress}/${nft.tokenId}`,
                          error: nft.error
                        }
                      })
                      const jsonString = JSON.stringify(exportData, null, 2)
                      setExportedJson(jsonString)
                    }
                  }}
                />
                all SBT
              </label>
            </div>
            <button
              onClick={() => setExportedJson(null)}
              style={{
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              Close
            </button>
          </div>
          <div style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: '6px',
            padding: '1rem',
            maxHeight: '400px',
            overflow: 'auto'
          }}>
            <pre style={{
              margin: 0,
              fontSize: '0.8rem',
              lineHeight: '1.4',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {exportedJson}
            </pre>
          </div>
          <div style={{ marginTop: '1rem', textAlign: 'right' }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(exportedJson)
                alert('JSON copied to clipboard!')
              }}
              style={{
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                marginRight: '0.5rem'
              }}
            >
              Copy to Clipboard
            </button>
            <button
              onClick={() => {
                const blob = new Blob([exportedJson], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `nft-collection-${contractAddress}-${Date.now()}.json`
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
              }}
              style={{
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Download JSON
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 className="subtitle" style={{ margin: 0 }}>NFT Collection ({nfts.length} items)</h2>
          {nfts.length > 0 && (
            <button
              onClick={handleExportJson}
              style={{
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '600'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#218838'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#28a745'
              }}
            >
              Export JSON
            </button>
          )}
        </div>
      
      {nfts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
          No NFTs found in this collection.
        </div>
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
          gap: '1rem',
          marginTop: '1rem'
        }}>
          {nfts.map((nft) => (
            <div
              key={nft.tokenId}
              style={{
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                padding: '1rem',
                border: '1px solid #e9ecef',
                cursor: onTokenSelect ? 'pointer' : 'default',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                overflow: 'hidden'
              }}
              onClick={() => onTokenSelect?.(nft.tokenId)}
              onMouseEnter={(e) => {
                if (onTokenSelect) {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                }
              }}
              onMouseLeave={(e) => {
                if (onTokenSelect) {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }
              }}
            >
              {nft.error ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ 
                    width: '100%', 
                    height: '150px', 
                    backgroundColor: '#fee', 
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '0.5rem',
                    color: '#d00'
                  }}>
                    Error
                  </div>
                  <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                    Token #{nft.tokenId}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#d00' }}>
                    {nft.error}
                  </div>
                </div>
              ) : nft.metadata ? (
                <div>
                  <img
                    src={imageErrors.has(nft.tokenId) ? getPlaceholderImage() : nft.metadata.image}
                    alt={nft.metadata.name}
                    style={{
                      width: '100%',
                      height: '150px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      marginBottom: '0.5rem'
                    }}
                    onError={() => handleImageError(nft.tokenId)}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: '600' }}>
                      {nft.metadata.name || `Token #${nft.tokenId}`}
                    </span>
                    {sbtCache.get(nft.tokenId) && (
                      <span style={{
                        backgroundColor: '#dc3545',
                        color: 'white',
                        padding: '0.1rem 0.3rem',
                        borderRadius: '8px',
                        fontSize: '0.6rem',
                        fontWeight: '600'
                      }}>
                        SBT
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#666' }}>
                    Token #{nft.tokenId}
                  </div>
                  {(() => {
                    const ownershipInfo = getOwnershipInfo(nft)
                    if (ownershipInfo) {
                      const ownerIsTBA = tbaCache.get(ownershipInfo.owner)
                      return (
                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span>Owner: {formatAddress(ownershipInfo.owner)}</span>
                            {ownerIsTBA && (
                              <span style={{
                                marginLeft: '0.25rem',
                                backgroundColor: '#007bff',
                                color: 'white',
                                padding: '0.1rem 0.3rem',
                                borderRadius: '8px',
                                fontSize: '0.6rem',
                                fontWeight: '600'
                              }}>
                                TBA
                              </span>
                            )}
                          </div>
                          {ownershipInfo.creator && (
                            <div>Creator: {formatAddress(ownershipInfo.creator)}</div>
                          )}
                        </div>
                      )
                    } else if (loadingOwnership.has(nft.tokenId)) {
                      return (
                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem', fontStyle: 'italic' }}>
                          Loading ownership...
                        </div>
                      )
                    } else if (contractAddress && selectedChain) {
                      return (
                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem', fontStyle: 'italic' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              fetchOwnershipInfo(nft.tokenId)
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#4338CA',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              textDecoration: 'underline',
                              padding: 0
                            }}
                          >
                            Load ownership info
                          </button>
                        </div>
                      )
                    }
                    return null
                  })()}
                  {nft.metadata.attributes && nft.metadata.attributes.length > 0 && (
                    <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
                      {nft.metadata.attributes.length} attribute{nft.metadata.attributes.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ 
                    width: '100%', 
                    height: '150px', 
                    backgroundColor: '#e9ecef', 
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '0.5rem'
                  }}>
                    Loading...
                  </div>
                  <div style={{ fontWeight: '600' }}>
                    Token #{nft.tokenId}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes pulse {
            0% { opacity: 1; }
            100% { opacity: 0.5; }
          }
        `
      }} />
      </div>
    </>
  )
}