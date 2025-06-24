# システム設計書

## アーキテクチャ概要
```
Browser (React App)
├── Wallet Connection (MetaMask/WalletConnect)
├── TBA Registry Interface
├── Asset Discovery Engine
└── Migration Engine
```

## コア機能設計

### 1. TBA Connection Layer
```typescript
interface TBAConfig {
  registry: string;
  implementation: string; 
  chainId: number;
}

interface TBAAccount {
  address: string;
  tokenContract: string;
  tokenId: string;
  salt: string;
}
```

### 2. Asset Discovery Engine
- NFT残高取得 (ERC-721/ERC-1155)
- ERC-20トークン残高取得
- ETH残高取得
- TBA階層構造探索

### 3. Migration Workflow
```
1. Source TBA接続・検証
2. Asset一覧取得・表示
3. Target TBA設定
4. 移転対象選択
5. Batch移転実行
6. 結果確認
```

### 4. データフロー
```
User Input → TBA Registry → Asset Discovery → Migration Engine → Transaction
```

## 技術仕様

### フロントエンド
- React + TypeScript + Vite
- Ethers.js (ERC-6551対応)
- TailwindCSS

### 主要コンポーネント
- TBARegistryConnector
- TBAAccountFinder  
- AssetViewer (NFT/Token一覧)
- TBAMigrator
- TransactionTracker

### 入力項目
- **インポート元**: Registry + Implementation アドレス
- **インポート先**: Registry + Implementation アドレス  
- NFTコントラクトアドレス