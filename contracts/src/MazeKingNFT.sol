// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ERC1155Burnable } from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import { ERC1155Supply } from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";

/// @title MazeKingNFT
/// @notice ERC-1155 NFT contract for MazeKing game achievements
/// @dev Uses AccessControl for role-based permissions
contract MazeKingNFT is ERC1155, AccessControl, ERC1155Burnable, ERC1155Supply {
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
    bytes32 public constant WITHDRAWER_ROLE = keccak256("WITHDRAWER_ROLE");
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    string public name;
    string public symbol;

    // ZK Proof verifier contract address (updatable)
    address public verifierContract;

    // Maze registry: seed hash -> official maze token ID
    mapping(bytes32 => uint256) public officialMazes;

    // Stats tracking: tokenId => user => Stats
    mapping(uint256 => mapping(address => Stats)) public stats;

    // Stats struct for tracking user achievements per maze
    struct Stats {
        uint16 minMoves;      // Minimum moves achieved
        uint16 timesSolved;   // Number of times solved
        uint32 badges;        // Bitfield for 32 badge types
        uint128 usdcDonated;  // USDC donated (future use)
    }

    // Badge constants (bitfield positions)
    uint32 public constant BADGE_VERIFIED = 1 << 0;  // 0. Has ZK proof verification
    uint32 public constant BADGE_ROBOT = 1 << 1;     // 1. Robot/Perfect (optimal moves)
    uint32 public constant BADGE_GOLD = 1 << 2;      // 2. Gold (<1.05x optimal)
    uint32 public constant BADGE_SILVER = 1 << 3;    // 3. Silver (<1.15x optimal)
    uint32 public constant BADGE_COPPER = 1 << 4;    // 4. Copper (<1.25x optimal)
    uint32 public constant BADGE_STONE = 1 << 5;     // 5. Stone (max possible moves)
    // Badges 6-31 reserved for future use (placement, special achievements, etc.)

    error WithdrawalFailed();
    error NoBalance();

    event Withdrawal(address indexed to, uint256 amount);
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
    event MazeRegistered(bytes32 indexed seedHash, string seed, uint256 indexed tokenId);
    event ProofVerified(address indexed solver, uint256 indexed tokenId, uint16 moveCount);
    event FirstSolve(address indexed solver, uint256 indexed tokenId, uint16 moveCount);
    event NewBestScore(address indexed solver, uint256 indexed tokenId, uint16 newBest);

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _uri,
        address _owner,
        address _verifier
    ) ERC1155(_uri) {
        name = _name;
        symbol = _symbol;
        verifierContract = _verifier;

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
        _grantRole(OWNER_ROLE, _owner);
        _grantRole(WITHDRAWER_ROLE, _owner);
        _grantRole(REGISTRAR_ROLE, _owner);
    }

    /// @notice Update the base URI
    /// @param newuri New URI
    function setURI(string memory newuri) external onlyRole(OWNER_ROLE) {
        _setURI(newuri);
    }

    /// @notice Mint NFT by verifying ZK proof of maze completion
    /// @param proof The ZK proof bytes
    /// @param publicInputs Array of 2509 public inputs (8 params + 2500 cells + moveCount)
    /// @param moveCount Number of moves taken
    function mintWithProof(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        uint16 moveCount
    ) external {
        require(verifierContract != address(0), "Verifier not set");
        require(publicInputs.length == 1509, "Invalid input length");

        // 1. Verify proof on-chain
        IVerifier verifier = IVerifier(verifierContract);
        bool isValid = verifier.verify(proof, publicInputs);
        require(isValid, "Invalid proof");

        // 2. Calculate tokenId from maze definition (first 2508 inputs, exclude move_count at index 2508)
        bytes memory mazeData = new bytes(2508 * 32);
        for (uint256 i = 0; i < 2508; i++) {
            bytes32 val = publicInputs[i];
            assembly {
                mstore(add(mazeData, add(32, mul(i, 32))), val)
            }
        }
        uint256 tokenId = uint256(keccak256(mazeData));

        // 3. Check if first mint for this user
        bool isFirstMint = balanceOf(msg.sender, tokenId) == 0;

        // 4. Mint token only on first solve (amount = 1)
        if (isFirstMint) {
            _mint(msg.sender, tokenId, 1, "");
        }

        // 5. Update stats
        Stats storage userStats = stats[tokenId][msg.sender];

        if (isFirstMint) {
            userStats.minMoves = moveCount;
            userStats.timesSolved = 1;
            userStats.badges = BADGE_VERIFIED;
            emit FirstSolve(msg.sender, tokenId, moveCount);
        } else {
            if (moveCount < userStats.minMoves) {
                userStats.minMoves = moveCount;
                emit NewBestScore(msg.sender, tokenId, moveCount);
            }
            userStats.timesSolved++;
        }

        emit ProofVerified(msg.sender, tokenId, moveCount);
    }

    /// @notice Update the verifier contract address
    /// @param _verifier New verifier contract address
    function setVerifier(address _verifier) external onlyRole(OWNER_ROLE) {
        address oldVerifier = verifierContract;
        verifierContract = _verifier;
        emit VerifierUpdated(oldVerifier, _verifier);
    }

    /// @notice Register an official maze seed to its token ID
    /// @param seed The maze seed string
    /// @param tokenId The token ID for this maze
    function registerMaze(string calldata seed, uint256 tokenId)
        external
        onlyRole(REGISTRAR_ROLE)
    {
        // solhint-disable-next-line asm-keccak256
        bytes32 seedHash = keccak256(bytes(seed));
        require(officialMazes[seedHash] == 0, "Already registered");
        officialMazes[seedHash] = tokenId;
        emit MazeRegistered(seedHash, seed, tokenId);
    }

    /// @notice Withdraw contract balance
    /// @param to Recipient address
    function withdraw(address payable to) external onlyRole(WITHDRAWER_ROLE) {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoBalance();

        (bool success,) = to.call{ value: balance }("");
        if (!success) revert WithdrawalFailed();

        emit Withdrawal(to, balance);
    }

    /// @notice Receive ETH
    receive() external payable { }

    // Required overrides for multiple inheritance

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Supply) {
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}

/// @title IVerifier
/// @notice Interface for ZK proof verifier contract
interface IVerifier {
    /// @notice Verify a ZK proof
    /// @param proof The proof bytes
    /// @param publicInputs Array of public inputs
    /// @return True if proof is valid
    function verify(bytes calldata proof, bytes32[] calldata publicInputs)
        external
        view
        returns (bool);
}
