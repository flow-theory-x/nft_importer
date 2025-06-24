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
}

contract JSONDataImporter {
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
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Owner only");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    /**
     * @dev Import single NFT from JSON data
     * @param targetNFT The DonatableNFT contract address
     * @param tokenURI The metadata URI from JSON
     * @param to The recipient address (usually the owner from JSON)
     * @param creator The creator address from JSON
     * @param isSBT Whether this is a Soul Bound Token
     * @param originalTokenInfo The original token info (CA/tokenId format)
     * @param royaltyRate The royalty rate (0-100, representing percentage)
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
        require(targetNFT != address(0), "Invalid target NFT address");
        require(bytes(tokenURI).length > 0, "Token URI cannot be empty");
        require(to != address(0), "Invalid recipient address");
        require(creator != address(0), "Invalid creator address");
        require(royaltyRate <= 100, "Royalty rate cannot exceed 100%");
        require(!importedTokens[originalTokenInfo], "Token already imported");
        
        // Validate that the original token info is not already in the target NFT
        require(!_isTokenAlreadyImported(targetNFT, originalTokenInfo), "Original token already exists in target NFT");
        
        IDonatableNFT donatableNFT = IDonatableNFT(targetNFT);
        
        try donatableNFT.mintImported(
            to,
            tokenURI,
            royaltyRate,
            isSBT,
            creator,
            originalTokenInfo
        ) returns (uint256 newTokenId) {
            // Mark as imported
            importedTokens[originalTokenInfo] = true;
            
            // Update stats
            importerStats[msg.sender].totalImported++;
            importerStats[msg.sender].lastImportTime = block.timestamp;
            
            emit JSONDataImported(msg.sender, targetNFT, newTokenId, originalTokenInfo);
            
            return newTokenId;
        } catch Error(string memory reason) {
            importerStats[msg.sender].totalFailed++;
            emit ImportFailed(msg.sender, originalTokenInfo, reason);
            revert(string(abi.encodePacked("Import failed: ", reason)));
        }
    }
    
    /**
     * @dev Import multiple NFTs from JSON data in batch
     * @param targetNFT The DonatableNFT contract address
     * @param imports Array of import data
     */
    function importBatch(
        address targetNFT,
        ImportData[] memory imports
    ) external payable returns (uint256[] memory) {
        require(imports.length > 0, "No imports provided");
        require(imports.length <= 50, "Batch size too large"); // Prevent gas limit issues
        
        emit BatchImportStarted(msg.sender, targetNFT, imports.length);
        
        uint256[] memory newTokenIds = new uint256[](imports.length);
        uint256 successCount = 0;
        uint256 failureCount = 0;
        
        for (uint256 i = 0; i < imports.length; i++) {
            try this.importSingleToken{value: 0}(
                targetNFT,
                imports[i].tokenURI,
                imports[i].to,
                imports[i].creator,
                imports[i].isSBT,
                imports[i].originalTokenInfo,
                imports[i].royaltyRate
            ) returns (uint256 newTokenId) {
                newTokenIds[i] = newTokenId;
                successCount++;
            } catch Error(string memory reason) {
                newTokenIds[i] = 0; // Mark as failed
                failureCount++;
                emit ImportFailed(msg.sender, imports[i].originalTokenInfo, reason);
            }
        }
        
        emit BatchImportCompleted(msg.sender, targetNFT, successCount, failureCount);
        
        return newTokenIds;
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
    function isTokenImported(string memory originalTokenInfo) external view returns (bool) {
        return importedTokens[originalTokenInfo];
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
        if (importedTokens[originalTokenInfo]) {
            return (false, "Token already imported");
        }
        if (_isTokenAlreadyImported(targetNFT, originalTokenInfo)) {
            return (false, "Original token already exists in target NFT");
        }
        
        return (true, "");
    }
    
    /**
     * @dev Emergency function to reset import status (owner only)
     */
    function resetImportStatus(string memory originalTokenInfo) external onlyOwner {
        importedTokens[originalTokenInfo] = false;
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