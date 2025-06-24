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
}

interface ISourceNFT {
    function _lastTokenId() external view returns (uint256);
    function _creator() external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

contract DonatableNFTImporter {
    address public owner;
    
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
        string memory importType,
        bool sbtFlag,
        uint256 startId,
        uint256 endId
    ) external onlyOwner {
        require(
            keccak256(bytes(importType)) == keccak256(bytes("owner")) || 
            keccak256(bytes(importType)) == keccak256(bytes("creator")),
            "Invalid import type"
        );
        require(endId >= startId, "Invalid ID range");
        
        ISourceNFT source = ISourceNFT(sourceCA);
        uint256 lastId = source._lastTokenId();
        require(endId <= lastId, "End ID exceeds last token");
        
        bool isOwnerType = keccak256(bytes(importType)) == keccak256(bytes("owner"));
        address sourceCreator = source._creator();
        
        for (uint256 i = startId; i <= endId; i++) {
            _importSingleToken(targetNFT, source, sourceCA, i, sbtFlag, isOwnerType, sourceCreator);
        }
    }
    
    function _importSingleToken(
        address targetNFT,
        ISourceNFT source,
        address sourceCA,
        uint256 tokenId,
        bool sbtFlag,
        bool isOwnerType,
        address sourceCreator
    ) private {
        try source.ownerOf(tokenId) returns (address tokenOwner) {
            string memory uri = source.tokenURI(tokenId);
            
            // Check if URI is Arweave
            if (isArweaveURI(uri)) {
                string memory originalInfo = string(abi.encodePacked(
                    addressToString(sourceCA), "/", uintToString(tokenId)
                ));
                
                address creator = isOwnerType ? tokenOwner : sourceCreator;
                
                IDonatableNFT(targetNFT).mintImported(
                    tokenOwner,
                    uri,
                    10, // 10% default royalty
                    sbtFlag,
                    creator,
                    originalInfo
                );
            }
        } catch {
            // Skip if token doesn't exist
        }
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
    
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}