import React from 'react'

interface ImportedNFT {
  tokenId: number
  tokenURI: string | null
  owner: string | null
  creator: string | null
  isTBA: boolean
  isSBT: boolean
  contractAddress: string
  chainId: number
  originalTokenInfo: string
  error?: string
}

interface ImportedNFTListProps {
  nfts: ImportedNFT[]
  contractInfo: { address: string; chainId: number } | null
}

export default function ImportedNFTList({ nfts, contractInfo }: ImportedNFTListProps) {
  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const getChainName = (chainId: number) => {
    const chains: { [key: number]: string } = {
      1: 'Ethereum',
      137: 'Polygon',
      21201: 'Private Chain'
    }
    return chains[chainId] || `Chain ${chainId}`
  }

  return (
    <div className="card">
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 className="subtitle">Imported NFT Collection ({nfts.length} items)</h2>
        {contractInfo && (
          <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
            <div>Contract: {formatAddress(contractInfo.address)}</div>
            <div>Chain: {getChainName(contractInfo.chainId)}</div>
          </div>
        )}
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
        gap: '1rem'
      }}>
        {nfts.map((nft) => (
          <div
            key={nft.tokenId}
            style={{
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              padding: '1rem',
              border: '1px solid #e9ecef',
              overflow: 'hidden'
            }}
          >
            {nft.error ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ 
                  padding: '2rem',
                  backgroundColor: '#fee', 
                  borderRadius: '6px',
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
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Token #{nft.tokenId}</h3>
                  {nft.isSBT && (
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

                {nft.tokenURI && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
                      Token URI:
                    </div>
                    <div style={{ 
                      fontSize: '0.7rem', 
                      fontFamily: 'monospace',
                      backgroundColor: '#fff',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #ddd',
                      wordBreak: 'break-all',
                      maxHeight: '60px',
                      overflow: 'auto'
                    }}>
                      {nft.tokenURI}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
                  {nft.owner && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span><strong>Owner:</strong> {formatAddress(nft.owner)}</span>
                        {nft.isTBA && (
                          <span style={{
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
                    </div>
                  )}
                  {nft.creator && (
                    <div>
                      <strong>Creator:</strong> {formatAddress(nft.creator)}
                      {nft.owner === nft.creator && (
                        <span style={{ 
                          marginLeft: '0.5rem', 
                          color: '#28a745', 
                          fontSize: '0.7rem',
                          fontWeight: '600'
                        }}>
                          (Original Owner)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '0.7rem', color: '#666' }}>
                  Original: {nft.originalTokenInfo}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}