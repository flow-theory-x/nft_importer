# NFTインポートツール設計書

## 概要
指定したNFTコントラクトから読み取ったNFT一覧を、異なるチェーン・異なるTBA実装に移転するWebツール

## アーキテクチャ概要
```
Browser (React App)
├── Multi-Chain Provider Manager
├── NFT Contract Reader
├── TBA Registry Interface
├── Asset Discovery Engine
└── Cross-Chain Migration Engine
```

## 使用シナリオ（操作フロー）

### ステップ1: ソースチェーン選択
```
1. ユーザーがツールにアクセス
2. "SOURCE CHAIN"でチェーン選択
   - プリセット: [Ethereum] [Polygon] [Arbitrum]  
   - カスタム: RPC URL入力 + Chain ID入力
```

### ステップ2: NFTコントラクト指定
```
1. NFT Contract Address入力
2. [Load NFTs]ボタンクリック
3. NFT一覧表示 (tokenId, owner, metadata)
   - owner = EOA: 通常のNFT
   - owner = TBA: TBAが所有するNFT
```

### ステップ3: 転送対象選択
```
選択オプション:
○ 個別選択 (チェックボックスで1つずつ)
○ EOA所有のみ全転送
○ TBA所有のみ全転送
○ 全転送 (EOA + TBA所有)
```

### ステップ4: ターゲット設定
```
1. "TARGET CHAIN"でチェーン選択
2. Target Registry/Implementation入力 
   ※TBA所有NFTを転送する場合のみ必要
   ※EOA所有のみの場合は不要
```

### ステップ5: 実行
```
1. [Connect Wallet]でターゲットチェーンに接続
2. [Execute Migration]でmint実行
```

## UI/UXワイヤーフレーム
```
┌─────────────────────────────────────────┐
│ SOURCE CHAIN                            │
│ ○ Ethereum ○ Polygon ○ Custom          │
│ Custom RPC: [_______________] Chain ID: │
├─────────────────────────────────────────┤
│ NFT CONTRACT                            │
│ Address: [_________________________]    │
│ [Load NFTs]                             │
├─────────────────────────────────────────┤
│ NFTS FOUND                              │
│ ┌─────┐ ┌─────┐ ┌─────┐                │
│ │NFT  │ │NFT  │ │NFT  │                │
│ │ #1  │ │ #2  │ │ #3  │                │
│ │(EOA)│ │(TBA)│ │(EOA)│                │
│ └─────┘ └─────┘ └─────┘                │
│ ○ Individual ○ EOA only ○ TBA only ○ All│
├─────────────────────────────────────────┤
│ TARGET CHAIN                            │
│ ○ Ethereum ○ Polygon ○ Custom          │
│ Custom RPC: [_______________] Chain ID: │
│ Registry: [___________________] (条件付き)│
│ Implementation: [_____________] (条件付き)│
├─────────────────────────────────────────┤
│ [Connect Wallet] → [Execute Migration]  │
└─────────────────────────────────────────┘
```

## 技術仕様

### フロントエンド技術スタック
- **フレームワーク**: React 18 + TypeScript + Vite
- **Web3**: Ethers.js v6
- **スタイル**: TailwindCSS + HeadlessUI
- **状態管理**: React Hooks (Context API)

### クロスチェーン対応
```typescript
interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: string;
}

interface CustomChainConfig extends ChainConfig {
  blockExplorer?: string;
}

interface CrossChainTBAConfig {
  sourceChain: ChainConfig;
  targetChain: ChainConfig;
  sourceTBA?: TBAConfig;  // TBA転送時のみ
  targetTBA?: TBAConfig;  // TBA転送時のみ
}
```

### ディレクトリ構造
```
src/
├── components/
│   ├── ChainSelector.tsx
│   ├── NFTContractInput.tsx
│   ├── NFTGrid.tsx
│   ├── SelectionOptions.tsx
│   ├── TBAInput.tsx
│   └── MigrationPanel.tsx
├── hooks/
│   ├── useChainManager.ts
│   ├── useNFTContract.ts
│   ├── useTBA.ts
│   └── useWallet.ts
├── types/
│   ├── chain.ts
│   ├── nft.ts
│   └── tba.ts
├── utils/
│   ├── contracts.ts
│   ├── chainConfigs.ts
│   └── helpers.ts
└── App.tsx
```

### 主要クラス設計
```typescript
class UniversalChainManager {
  private providers: Map<number, ethers.JsonRpcProvider>;
  
  addCustomChain(config: CustomChainConfig): void;
  getProvider(chainId: number): ethers.JsonRpcProvider;
  validateRPC(rpcUrl: string): Promise<boolean>;
  detectChainId(rpcUrl: string): Promise<number>;
}

class AssetScanner {
  async scanNFTContract(contract: string, chainId: number): Promise<NFT[]>;
  async detectTBAOwnership(nfts: NFT[]): Promise<NFT[]>;
  async getNFTMetadata(contract: string, tokenId: string): Promise<Metadata>;
}
```

## 開発フェーズ

### Phase 1: 基本機能
- プロジェクト初期化 (Vite + React + TypeScript)
- チェーン選択UI実装
- NFT一覧取得機能

### Phase 2: TBA対応
- TBA検出機能実装
- 選択オプション実装
- TBA Registry接続

### Phase 3: クロスチェーン移転
- ターゲット設定UI
- ウォレット接続
- mint実行機能

### Phase 4: 最適化・エラーハンドリング
- UX改善
- エラーハンドリング強化
- パフォーマンス最適化