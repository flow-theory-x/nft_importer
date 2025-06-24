# Smart Contract Deployment Guide

This document explains how to deploy and configure the JSONDataImporter smart contract for importing NFT data to the blockchain.

## Contracts Overview

### 1. DonatableNFT.sol
- Main NFT contract that will receive imported NFTs
- Must be deployed first
- Supports donation features and royalties
- Has `mintImported` function for external imports

### 2. JSONDataImporter.sol
- Import contract that reads JSON data and mints NFTs to DonatableNFT
- Must be authorized by DonatableNFT owner
- Handles single and batch imports
- Validates data before importing

## Deployment Steps

### Step 1: Deploy DonatableNFT
Deploy the DonatableNFT contract with your desired name and symbol:
```solidity
constructor(
    string memory _nameParam,     // e.g., "My NFT Collection"
    string memory _symbolParam    // e.g., "MNC"
)
```

### Step 2: Deploy JSONDataImporter
Deploy the JSONDataImporter contract (no constructor parameters needed).

### Step 3: Authorize JSONDataImporter
Call `setImporter` on the DonatableNFT contract to authorize the JSONDataImporter:
```solidity
donatableNFT.setImporter(jsonDataImporterAddress, true);
```

## Frontend Configuration

In the ImportToBlockchain component, users need to provide:

1. **JSONDataImporter Contract Address**: The deployed JSONDataImporter contract
2. **Target DonatableNFT Contract Address**: The deployed DonatableNFT contract

## Example Contract Addresses

Replace these with your actual deployed contract addresses:

```
// Example for Ethereum Mainnet
JSONDataImporter: 0x1234567890123456789012345678901234567890
DonatableNFT: 0x0987654321098765432109876543210987654321

// Example for Polygon
JSONDataImporter: 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd
DonatableNFT: 0xfedcbafedcbafedcbafedcbafedcbafedcbafedcba
```

## Gas Considerations

- Single import: ~200,000 gas
- Batch import (10 items): ~1,500,000 gas
- Always estimate gas before importing
- Batch imports are more gas-efficient for multiple NFTs

## Security Notes

1. Only the DonatableNFT owner can authorize importers
2. JSONDataImporter validates all data before importing
3. Duplicate imports are prevented by originalTokenInfo tracking
4. Failed imports don't affect successful ones in batch operations

## Testing

Before mainnet deployment, test on testnets:
1. Deploy both contracts on testnet
2. Authorize the importer
3. Test single and batch imports
4. Verify gas estimates and transaction costs

## Frontend Integration

The ImportToBlockchain component provides:
- Contract address configuration
- NFT selection for import
- Gas estimation
- Batch import support
- Transaction result tracking