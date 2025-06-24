// SPDX-License-Identifier: Apache License 2.0
pragma solidity ^0.8.0;
import "github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.7.3/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "./RoyaltyStandard.sol";

contract DonatableNFT is ERC721Enumerable, RoyaltyStandard {
    address public _owner;
    uint256 public _mintFee;
    uint256 public _maxFeeRate;
    mapping(uint256 => string) private _metaUrl;
    mapping(uint256 => bool) public _sbtFlag;
    uint256 public _lastId;
    mapping(address => uint256) public _totalDonations;
    string private _name;
    string private _symbol;
    address[] private _creators;
    mapping(address => bool) private _isCreator;
    mapping(address => uint256[]) private _creatorTokens;
    mapping(uint256 => address) private _tokenCreator;
    mapping(address => string) private _creatorNames;
    uint256 public _totalBurned;
    mapping(uint256 => string) public _originalTokenInfo;
    mapping(address => bool) public _importers;

    /*
    * @param string name string Nft name
    * @param string symbol string
    * @param address creator
    * @param address feeRate Unit is %
    */
    constructor(
        string memory _nameParam,
        string memory _symbolParam
    ) ERC721(_nameParam, _symbolParam) {
        _owner = msg.sender;
        _mintFee = 5000000000000000;
        _name = _nameParam;
        _symbol = _symbolParam;
    }

    /*
    * @param address to
    * @param string metaUrl
    */
    function mint(address to,  string memory metaUrl, uint16 feeRate, bool sbtFlag) public payable {
        require(msg.value >= _mintFee, "Insufficient Mint Fee");
        require(feeRate <= _maxFeeRate, "over Max Fee Rate");

        if(msg.value - _mintFee > 0){
           _totalDonations[msg.sender] = _totalDonations[msg.sender] + (msg.value - _mintFee);
        }

        _lastId++;
        uint256 tokenId = _lastId;
        _metaUrl[tokenId] = metaUrl;
        if (sbtFlag) {
            _sbtFlag[tokenId] = true;
        }else{
            _sbtFlag[tokenId] = false;
        }
        _mint(to, tokenId);
        _setTokenRoyalty(tokenId, msg.sender, feeRate * 100); // 100 = 1%

        // Track creator
        if (!_isCreator[msg.sender]) {
            _isCreator[msg.sender] = true;
            _creators.push(msg.sender);
        }
        _creatorTokens[msg.sender].push(tokenId);
        _tokenCreator[tokenId] = msg.sender;
    }

    /*
     * ERC721 0x80ac58cd
     * ERC165 0x01ffc9a7 (RoyaltyStandard)
     */
    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        virtual
        override(ERC721Enumerable, RoyaltyStandard)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function tokenURI(
        uint256 tokenId
    ) public view virtual override returns (string memory) {
        _requireMinted(tokenId);
        return _metaUrl[tokenId];
    }

    function burn(uint256 tokenId) external {
        require(
            _isApprovedOrOwner(_msgSender(), tokenId) || msg.sender == _owner,
            "Caller is not owner nor approved"
        );
        _metaUrl[tokenId] = "";
        _burn(tokenId);
    }

    function transferFromWithDonation(
        address from,
        address to,
        uint256 tokenId
    ) external payable {
        require(_isApprovedOrOwner(_msgSender(), tokenId), "ERC721: caller is not token owner nor approved");
        if (msg.value > 0) {
            _totalDonations[to] = _totalDonations[to] + msg.value;
        }
        _transfer(from, to, tokenId);
    }

    function safeTransferFromWithDonation(
        address from,
        address to,
        uint256 tokenId
    ) external payable {
        safeTransferFromWithDonation(from, to, tokenId, "");
    }

    function safeTransferFromWithDonation(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public payable {
        require(_isApprovedOrOwner(_msgSender(), tokenId), "ERC721: caller is not token owner nor approved");
        if (msg.value > 0) {
            _totalDonations[to] = _totalDonations[to] + msg.value;
        }
        _safeTransfer(from, to, tokenId, data);
    }

    function transferFromWithCashback(
        address from,
        address to,
        uint256 tokenId
    ) external payable {
        require(_isApprovedOrOwner(_msgSender(), tokenId), "ERC721: caller is not token owner nor approved");
        require(msg.value > 0, "No value sent");

        uint256 donation = (msg.value * 90) / 100;
        uint256 cashback = msg.value - donation;

        _totalDonations[to] = _totalDonations[to] + donation;

        if (cashback > 0) {
            payable(to).transfer(cashback);
        }

        _transfer(from, to, tokenId);
    }

    /*
        extra method
     */
    function config(
        uint256 maxFeeRate,
        uint256 mintFee,
        string memory newName,
        string memory newSymbol
    ) external {
        require(_owner == msg.sender, "Can't set. owner only");
        _maxFeeRate = maxFeeRate;
        _mintFee = mintFee;
        _name = newName;
        _symbol = newSymbol;
    }

    function withdraw() external {
        require(_owner == msg.sender, "Can't withdraw. owner only");
        require(address(this).balance > 0, "No balance to withdraw");
        payable(msg.sender).transfer(address(this).balance);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override {
        if (from != address(0) && to != address(0) && to != 0x000000000000000000000000000000000000dEaD) {
            require(!_sbtFlag[tokenId], "SBT: Token transfer not allowed");
        }
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function _burn(uint256 tokenId) internal virtual override {
        super._safeTransfer(ownerOf(tokenId), 0x000000000000000000000000000000000000dEaD, tokenId, "");
        super._burn(tokenId);
        _totalBurned++;
    }

    function name() public view virtual override returns (string memory) {
        return _name;
    }

    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    function getCreators() external view returns (address[] memory) {
        return _creators;
    }

    function getCreatorTokens(address creator) external view returns (uint256[] memory) {
        return _creatorTokens[creator];
    }

    function getTokenCreator(uint256 tokenId) external view returns (address) {
        return _tokenCreator[tokenId];
    }

    function getCreatorCount() external view returns (uint256) {
        return _creators.length;
    }

    function getCreatorTokenCount(address creator) external view returns (uint256) {
        return _creatorTokens[creator].length;
    }

    function setCreatorName(string memory creatorName) external {
        require(_isCreator[msg.sender] || msg.sender == _owner, "Not a creator or owner");
        _creatorNames[msg.sender] = creatorName;
    }

    function getCreatorName(address creator) external view returns (string memory) {
        return _creatorNames[creator];
    }

    function getTotalBurned() external view returns (uint256) {
        return _totalBurned;
    }

    function setImporter(address importer, bool status) external {
        require(msg.sender == _owner, "Owner only");
        _importers[importer] = status;
    }

    // Import function for external use (called by DonatableNFTImporter)
    function mintImported(
        address to,
        string memory metaUrl,
        uint16 feeRate,
        bool sbtFlag,
        address creator,
        string memory originalInfo
    ) external returns (uint256) {
        require(msg.sender == _owner || _importers[msg.sender], "Not authorized");

        _lastId++;
        uint256 tokenId = _lastId;
        _metaUrl[tokenId] = metaUrl;
        _sbtFlag[tokenId] = sbtFlag;
        _originalTokenInfo[tokenId] = originalInfo;

        _mint(to, tokenId);
        _setTokenRoyalty(tokenId, creator, feeRate * 100);

        // Track creator
        if (!_isCreator[creator]) {
            _isCreator[creator] = true;
            _creators.push(creator);
        }
        _creatorTokens[creator].push(tokenId);
        _tokenCreator[tokenId] = creator;

        return tokenId;
    }
}
