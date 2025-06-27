// SPDX-License-Identifier: Apache License 2.0
pragma solidity ^0.8.0;

interface IDonatableNFT {
    function mintImported(
        address to,
        string memory metaUrl,
        uint16 feeRate,
        bool sbtFlag,
        address creator,
        string memory originalInfo
    ) external returns (uint256);

    function _originalTokenInfo(uint256 tokenId) external view returns (string memory);
    function totalSupply() external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IERC6551Registry {
    function account(
        address implementation,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId,
        uint256 salt
    ) external view returns (address);

    function createAccount(
        address implementation,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId,
        uint256 salt,
        bytes calldata initData
    ) external returns (address);
}

interface ITBA {
    function token() external view returns (uint256, address, uint256);
}

contract JSONDataImporterV2 {
    address public owner;

    // Events for tracking imports
    event JSONDataImported(
        address indexed importer,
        address indexed targetNFT,
        uint256 indexed newTokenId,
        string originalTokenInfo
    );

    event BatchImportStarted(
        address indexed importer,
        address indexed targetNFT,
        uint256 batchSize
    );

    event BatchImportCompleted(
        address indexed importer,
        address indexed targetNFT,
        uint256 successCount,
        uint256 failureCount
    );

    event ImportFailed(
        address indexed importer,
        string originalTokenInfo,
        string reason
    );

    // Import statistics
    struct ImportStats {
        uint256 totalImported;
        uint256 totalFailed;
        uint256 lastImportTime;
    }

    mapping(address => ImportStats) public importerStats;
    mapping(string => bool) public importedTokens; // Track to prevent duplicates

    // Import data structure
    struct ImportData {
        string tokenURI;
        address to;
        address creator;
        bool isSBT;
        string originalTokenInfo;
        uint16 royaltyRate;
        string tbaSourceToken; // TBA source token info (CA/ID format)
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Owner only");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Import single NFT from JSON data with TBA support
     */
    function importSingleTokenWithTBA(
        address targetNFT,
        string memory tokenURI,
        address to,
        address creator,
        bool isSBT,
        string memory originalTokenInfo,
        uint16 royaltyRate,
        string memory tbaSourceToken,
        address registry,
        address implementation
    ) public payable returns (uint256) {
        ImportData memory data = ImportData({
            tokenURI: tokenURI,
            to: to,
            creator: creator,
            isSBT: isSBT,
            originalTokenInfo: originalTokenInfo,
            royaltyRate: royaltyRate,
            tbaSourceToken: tbaSourceToken
        });

        return _importSingleHelper(targetNFT, data, registry, implementation);
    }

    /**
     * @dev Helper function to handle single imports
     */
    function _importSingleHelper(
        address targetNFT,
        ImportData memory data,
        address registry,
        address implementation
    ) private returns (uint256) {
        // Validate basic parameters
        _validateImportParameters(
            targetNFT,
            data.tokenURI,
            data.to,
            data.creator,
            data.royaltyRate,
            data.originalTokenInfo
        );

        // Determine mint destination (to or TBA)
        address mintTo = _determineMintDestination(
            data.to,
            data.tbaSourceToken,
            registry,
            implementation,
            targetNFT
        );

        // Execute the mint
        return _executeMint(
            targetNFT,
            mintTo,
            data.tokenURI,
            data.royaltyRate,
            data.isSBT,
            data.creator,
            data.originalTokenInfo
        );
    }

    /**
     * @dev Import single NFT (legacy function for backward compatibility)
     */
    function importSingleToken(
        address targetNFT,
        string memory tokenURI,
        address to,
        address creator,
        bool isSBT,
        string memory originalTokenInfo,
        uint16 royaltyRate
    ) external payable returns (uint256) {
        ImportData memory data = ImportData({
            tokenURI: tokenURI,
            to: to,
            creator: creator,
            isSBT: isSBT,
            originalTokenInfo: originalTokenInfo,
            royaltyRate: royaltyRate,
            tbaSourceToken: ""
        });

        return _importSingleHelper(targetNFT, data, address(0), address(0));
    }

    /**
     * @dev Import multiple NFTs from JSON data in batch with TBA support
     */
    function importBatchWithTBA(
        address targetNFT,
        ImportData[] memory imports,
        address registry,
        address implementation
    ) external payable returns (uint256[] memory) {
        require(imports.length > 0, "No imports provided");
        require(imports.length <= 100, "Batch size too large. Maximum 100 NFTs per batch");

        emit BatchImportStarted(msg.sender, targetNFT, imports.length);

        uint256[] memory newTokenIds = new uint256[](imports.length);
        uint256 successCount = 0;
        uint256 failureCount = 0;

        for (uint256 i = 0; i < imports.length; i++) {
            try this._importBatchItem(
                targetNFT,
                imports[i],
                registry,
                implementation
            ) returns (uint256 newTokenId) {
                newTokenIds[i] = newTokenId;
                successCount++;
            } catch Error(string memory reason) {
                newTokenIds[i] = 0;
                failureCount++;
                emit ImportFailed(msg.sender, imports[i].originalTokenInfo, reason);
            } catch {
                newTokenIds[i] = 0;
                failureCount++;
                emit ImportFailed(msg.sender, imports[i].originalTokenInfo, "Unknown error");
            }
        }

        emit BatchImportCompleted(msg.sender, targetNFT, successCount, failureCount);
        return newTokenIds;
    }

    /**
     * @dev Internal import function for batch processing
     */
    function _importBatchItem(
        address targetNFT,
        ImportData memory importData,
        address registry,
        address implementation
    ) external returns (uint256) {
        require(msg.sender == address(this), "Internal only");

        return _importSingleHelper(targetNFT, importData, registry, implementation);
    }

    /**
     * @dev Import multiple NFTs (legacy function)
     */
    function importBatch(
        address targetNFT,
        ImportData[] memory imports
    ) external payable returns (uint256[] memory) {
        return this.importBatchWithTBA(targetNFT, imports, address(0), address(0));
    }

    function _validateImportParameters(
        address targetNFT,
        string memory tokenURI,
        address to,
        address creator,
        uint16 royaltyRate,
        string memory originalTokenInfo
    ) private view {
        require(targetNFT != address(0), "Invalid target NFT address");
        require(bytes(tokenURI).length > 0, "Token URI cannot be empty");
        require(to != address(0), "Invalid recipient address");
        require(creator != address(0), "Invalid creator address");
        require(royaltyRate <= 100, "Royalty rate cannot exceed 100%");
        require(!_isTokenAlreadyImported(targetNFT, originalTokenInfo), "Token already exists in target NFT");
    }

    function _determineMintDestination(
        address to,
        string memory tbaSourceToken,
        address registry,
        address implementation,
        address targetNFT
    ) private returns (address) {
        if (bytes(tbaSourceToken).length == 0) {
            return to;
        }

        require(registry != address(0), "Registry address required for TBA");
        require(implementation != address(0), "Implementation address required for TBA");

        uint256 sourceTokenId = _findTokenByTBASource(targetNFT, tbaSourceToken);
        require(sourceTokenId > 0, "TBA source token not found in target NFT");

        return _createTBA(registry, implementation, targetNFT, sourceTokenId);
    }

    function _executeMint(
        address targetNFT,
        address mintTo,
        string memory tokenURI,
        uint16 royaltyRate,
        bool isSBT,
        address creator,
        string memory originalTokenInfo
    ) private returns (uint256) {
        IDonatableNFT donatableNFT = IDonatableNFT(targetNFT);

        try donatableNFT.mintImported(
            mintTo,
            tokenURI,
            royaltyRate,
            isSBT,
            creator,
            originalTokenInfo
        ) returns (uint256 newTokenId) {
            // importedTokens[originalTokenInfo] = true; // Removed - rely on actual NFT existence
            importerStats[tx.origin].totalImported++; // Use tx.origin for batch imports
            importerStats[tx.origin].lastImportTime = block.timestamp;
            emit JSONDataImported(tx.origin, targetNFT, newTokenId, originalTokenInfo);
            return newTokenId;
        } catch Error(string memory reason) {
            importerStats[tx.origin].totalFailed++;
            emit ImportFailed(tx.origin, originalTokenInfo, reason);
            revert(string(abi.encodePacked("Import failed: ", reason)));
        }
    }

    /**
     * @dev Find token ID by TBA source token info
     */
    function _findTokenByTBASource(address targetNFT, string memory tbaSourceToken) private view returns (uint256) {
        IDonatableNFT donatableNFT = IDonatableNFT(targetNFT);

        try donatableNFT.totalSupply() returns (uint256 totalSupply) {
            for (uint256 i = 1; i <= totalSupply; i++) {
                try donatableNFT._originalTokenInfo(i) returns (string memory existingInfo) {
                    if (keccak256(bytes(existingInfo)) == keccak256(bytes(tbaSourceToken))) {
                        return i;
                    }
                } catch {
                    // Skip if token doesn't exist or error accessing info
                    continue;
                }
            }
        } catch {
            // If we can't check, return 0
            return 0;
        }

        return 0; // Not found
    }

    /**
     * @dev Create TBA for a given token
     */
    function _createTBA(
        address registry,
        address implementation,
        address tokenContract,
        uint256 tokenId
    ) private returns (address) {
        IERC6551Registry tbaRegistry = IERC6551Registry(registry);

        // Use chainId and salt
        uint256 chainId = block.chainid;
        uint256 salt = 0;

        return tbaRegistry.createAccount(
            implementation,
            chainId,
            tokenContract,
            tokenId,
            salt,
            "" // empty initData
        );
    }

    /**
     * @dev Check if a token with the same original info already exists
     */
    function _isTokenAlreadyImported(
        address targetNFT,
        string memory originalTokenInfo
    ) private view returns (bool) {
        IDonatableNFT donatableNFT = IDonatableNFT(targetNFT);

        try donatableNFT.totalSupply() returns (uint256 totalSupply) {
            for (uint256 i = 1; i <= totalSupply; i++) {
                try donatableNFT._originalTokenInfo(i) returns (string memory existingInfo) {
                    if (keccak256(bytes(existingInfo)) == keccak256(bytes(originalTokenInfo))) {
                        return true;
                    }
                } catch {
                    // Skip if token doesn't exist or error accessing info
                    continue;
                }
            }
        } catch {
            // If we can't check, assume not imported
            return false;
        }

        return false;
    }

    /**
     * @dev Get import statistics for an address
     */
    function getImportStats(address importer) external view returns (ImportStats memory) {
        return importerStats[importer];
    }

    /**
     * @dev Check if a token has been imported
     */
    function isTokenImported(address targetNFT, string memory originalTokenInfo) external view returns (bool) {
        return _isTokenAlreadyImported(targetNFT, originalTokenInfo);
    }

    /**
     * @dev Validate import data before actual import
     */
    function validateImportData(
        address targetNFT,
        string memory tokenURI,
        address to,
        address creator,
        bool /* isSBT */,
        string memory originalTokenInfo,
        uint16 royaltyRate
    ) external view returns (bool isValid, string memory reason) {
        if (targetNFT == address(0)) {
            return (false, "Invalid target NFT address");
        }
        if (bytes(tokenURI).length == 0) {
            return (false, "Token URI cannot be empty");
        }
        if (to == address(0)) {
            return (false, "Invalid recipient address");
        }
        if (creator == address(0)) {
            return (false, "Invalid creator address");
        }
        if (royaltyRate > 100) {
            return (false, "Royalty rate cannot exceed 100%");
        }
        if (_isTokenAlreadyImported(targetNFT, originalTokenInfo)) {
            return (false, "Token already exists in target NFT");
        }

        return (true, "");
    }

    /**
     * @dev Get batch validation results
     */
    function validateBatch(
        address targetNFT,
        ImportData[] memory imports
    ) external view returns (bool[] memory validResults, string[] memory reasons) {
        validResults = new bool[](imports.length);
        reasons = new string[](imports.length);

        for (uint256 i = 0; i < imports.length; i++) {
            (validResults[i], reasons[i]) = this.validateImportData(
                targetNFT,
                imports[i].tokenURI,
                imports[i].to,
                imports[i].creator,
                imports[i].isSBT,
                imports[i].originalTokenInfo,
                imports[i].royaltyRate
            );
        }
    }

    /**
     * @dev Emergency function to reset import status (owner only)
     * @notice This function is deprecated as importedTokens mapping is no longer used
     */
    function resetImportStatus(string memory originalTokenInfo) external onlyOwner {
        // importedTokens[originalTokenInfo] = false; // Deprecated - no longer maintaining this mapping
    }

    /**
     * @dev Transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    /**
     * @dev Withdraw contract balance (owner only)
     */
    function withdraw() external onlyOwner {
        require(address(this).balance > 0, "No balance to withdraw");
        payable(owner).transfer(address(this).balance);
    }
}