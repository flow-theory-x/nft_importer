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
    
    function totalSupply() external view returns (uint256);
    function _originalTokenInfo(uint256 tokenId) external view returns (string memory);
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface ISourceNFT {
    function _lastTokenId() external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function tokenURI(uint256 tokenId) external view returns (string memory);
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

contract DonatableTBAImporter {
    address public owner;
    
    // Debug events
    event TokenProcessed(uint256 indexed tokenId, address owner, bool isTBA);
    event ArweaveURIFound(uint256 indexed tokenId, string uri);
    event DonatableTokenFound(uint256 indexed sourceTokenId, uint256 donatableTokenId);
    event TBACreated(uint256 indexed donatableTokenId, address tba);
    event MintCompleted(address indexed tba, uint256 sourceTokenId);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Owner only");
        _;
    }
    
    constructor() {
        owner = msg.sender;
    }
    
    function importTokens(
        address targetNFT,
        address sourceCA,
        bool sbtFlag,
        uint256 startId,
        uint256 endId,
        address registry,
        address implementation,
        uint256 chainId,
        uint256 salt
    ) external onlyOwner {
        require(endId >= startId, "Invalid ID range");
        
        IDonatableNFT target = IDonatableNFT(targetNFT);
        ISourceNFT source = ISourceNFT(sourceCA);
        IERC6551Registry tbaRegistry = IERC6551Registry(registry);
        
        uint256 lastId = source._lastTokenId();
        require(endId <= lastId, "End ID exceeds last token");
        
        // Store params for later use
        _importParams = ImportParams({
            targetNFT: targetNFT,
            sourceCA: sourceCA,
            implementation: implementation,
            salt: salt,
            chainId: chainId,
            sbtFlag: sbtFlag
        });
        
        for (uint256 i = startId; i <= endId; i++) {
            _processSingleToken(target, source, tbaRegistry, i);
        }
    }
    
    struct ImportParams {
        address targetNFT;
        address sourceCA;
        address implementation;
        uint256 salt;
        uint256 chainId;
        bool sbtFlag;
    }
    
    ImportParams private _importParams;
    
    function _processSingleToken(
        IDonatableNFT target,
        ISourceNFT source,
        IERC6551Registry tbaRegistry,
        uint256 tokenId
    ) private {
        try source.ownerOf(tokenId) returns (address tokenOwner) {
            bool isTBAOwner = isTBA(tokenOwner);
            emit TokenProcessed(tokenId, tokenOwner, isTBAOwner);
            
            // Check if owner is a TBA
            if (isTBAOwner) {
                string memory uri = source.tokenURI(tokenId);
                
                // Check if URI is Arweave
                if (isArweaveURI(uri)) {
                    emit ArweaveURIFound(tokenId, uri);
                    _handleArweaveToken(target, tbaRegistry, tokenId, uri);
                }
            }
        } catch {
            // Skip if token doesn't exist
        }
    }
    
    function _handleArweaveToken(
        IDonatableNFT target,
        IERC6551Registry tbaRegistry,
        uint256 tokenId,
        string memory uri
    ) private {
        // Find corresponding DonatableNFT token
        string memory lookupKey = string(abi.encodePacked(
            addressToString(_importParams.sourceCA), "/", uintToString(tokenId)
        ));
        
        uint256 donatableTokenId = findTokenByOriginalInfo(target, lookupKey);
        emit DonatableTokenFound(tokenId, donatableTokenId);
        
        if (donatableTokenId > 0) {
            _mintToTBA(target, tbaRegistry, donatableTokenId, uri, tokenId);
        }
    }
    
    function _mintToTBA(
        IDonatableNFT target,
        IERC6551Registry tbaRegistry,
        uint256 donatableTokenId,
        string memory uri,
        uint256 sourceTokenId
    ) private {
        // Create TBA for the DonatableNFT token
        address tba = tbaRegistry.createAccount(
            _importParams.implementation,
            _importParams.chainId,
            _importParams.targetNFT,
            donatableTokenId,
            _importParams.salt,
            "" // empty initData
        );
        emit TBACreated(donatableTokenId, tba);
        
        // Mint new NFT to the TBA
        string memory originalInfo = string(abi.encodePacked(
            addressToString(_importParams.sourceCA), "/", uintToString(sourceTokenId)
        ));
        
        address nftOwner = target.ownerOf(donatableTokenId);
        
        target.mintImported(
            tba,            // mint to TBA
            uri,
            10,             // 10% default royalty
            _importParams.sbtFlag,
            nftOwner,       // creator is the NFT owner
            originalInfo
        );
        emit MintCompleted(tba, sourceTokenId);
    }
    
    function findTokenByOriginalInfo(IDonatableNFT target, string memory lookupKey) private view returns (uint256) {
        uint256 totalSupply = target.totalSupply();
        
        for (uint256 i = 1; i <= totalSupply; i++) {
            try target._originalTokenInfo(i) returns (string memory info) {
                if (keccak256(bytes(info)) == keccak256(bytes(lookupKey))) {
                    return i;
                }
            } catch {
                // Skip if token doesn't exist
            }
        }
        
        return 0; // Not found
    }
    
    function isTBA(address account) private view returns (bool) {
        // Check if address is a smart contract
        uint256 size;
        assembly {
            size := extcodesize(account)
        }
        
        if (size == 0) {
            return false; // Not a contract
        }
        
        // Additional TBA-specific checks could be added here
        // For now, we assume any contract could be a TBA
        return true;
    }
    
    function isArweaveURI(string memory uri) private pure returns (bool) {
        bytes memory uriBytes = bytes(uri);
        bytes memory prefix = bytes("https://arweave.net/");
        
        if (uriBytes.length < prefix.length) {
            return false;
        }
        
        for (uint256 i = 0; i < prefix.length; i++) {
            if (uriBytes[i] != prefix[i]) {
                return false;
            }
        }
        
        return true;
    }
    
    function addressToString(address _addr) private pure returns (string memory) {
        bytes32 value = bytes32(uint256(uint160(_addr)));
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            str[2+i*2] = alphabet[uint8(value[i + 12] >> 4)];
            str[3+i*2] = alphabet[uint8(value[i + 12] & 0x0f)];
        }
        return string(str);
    }
    
    function uintToString(uint256 _i) private pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        while (_i != 0) {
            k = k-1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
    
    // Individual utility functions
    
    function getTBAAddress(
        address registry,
        address implementation,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId,
        uint256 salt
    ) external view returns (address) {
        IERC6551Registry tbaRegistry = IERC6551Registry(registry);
        return tbaRegistry.account(
            implementation,
            chainId,
            tokenContract,
            tokenId,
            salt
        );
    }
    
    function checkIfTBA(address account) external view returns (bool) {
        return isTBA(account);
    }
    
    function checkArweaveURI(string memory uri) external pure returns (bool) {
        return isArweaveURI(uri);
    }
    
    function findDonatableTokenByOriginal(
        address donatableNFT,
        address sourceCA,
        uint256 sourceTokenId
    ) external view returns (uint256) {
        IDonatableNFT target = IDonatableNFT(donatableNFT);
        string memory lookupKey = string(abi.encodePacked(
            addressToString(sourceCA), "/", uintToString(sourceTokenId)
        ));
        return findTokenByOriginalInfo(target, lookupKey);
    }
    
    function createTBAForToken(
        address registry,
        address implementation,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId,
        uint256 salt
    ) external returns (address) {
        require(msg.sender == owner, "Owner only");
        IERC6551Registry tbaRegistry = IERC6551Registry(registry);
        return tbaRegistry.createAccount(
            implementation,
            chainId,
            tokenContract,
            tokenId,
            salt,
            ""
        );
    }
    
    function mintToSpecificTBA(
        address donatableNFT,
        address tbaAddress,
        string memory uri,
        bool sbtFlag,
        address creator,
        string memory originalInfo
    ) external {
        require(msg.sender == owner, "Owner only");
        IDonatableNFT target = IDonatableNFT(donatableNFT);
        target.mintImported(
            tbaAddress,
            uri,
            10, // 10% default royalty
            sbtFlag,
            creator,
            originalInfo
        );
    }
    
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}