// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC1155 } from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import {
    ERC1155Burnable
} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import { ERC1155Supply } from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import { MazeConstants } from "./MazeConstants.sol";
import { IBadgeAwarder } from "./IBadgeAwarder.sol";
import { MazeRenderer } from "./MazeRenderer.sol";

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

    // Pluggable badge-awarding strategy (updatable; address(0) disables awards)
    address public badgeAwarder;

    // Maze registry: seed hash -> official maze token ID
    mapping(bytes32 => uint256) public officialMazes;

    /// @notice Compact maze layout per tokenId, stored once on first mint
    /// @dev Format: [w(2)|h(2)|kx(2)|ky(2)|kex(2)|key(2)|gx(2)|gy(2)|cells...]
    ///      Cells are 4 bits each, packed 2 per byte (high nibble first).
    mapping(uint256 => bytes) public layouts;

    // Stats tracking: tokenId => user => Stats
    mapping(uint256 => mapping(address => Stats)) public stats;

    // Per-maze admin state (keyed by tokenId / maze hash)
    mapping(uint256 => uint32) public optimalMoves;
    mapping(uint256 => bool) public registered;
    mapping(uint256 => bool) public registrarApproved;

    // Stats struct for tracking user achievements per maze
    struct Stats {
        uint16 minMoves; // Minimum moves achieved
        uint16 timesSolved; // Number of times solved
        uint32 badges; // Bitfield for 32 badge types
        uint128 usdcDonated; // USDC donated (future use)
    }

    // Badge constants (bitfield positions)
    uint32 public constant BADGE_REGISTERED = 1 << 0; // 0. Maze is officially registered
    uint32 public constant BADGE_ROBOT = 1 << 1; // 1. Robot/Perfect (optimal moves)
    uint32 public constant BADGE_GOLD = 1 << 2; // 2. Gold (<1.05x optimal)
    uint32 public constant BADGE_SILVER = 1 << 3; // 3. Silver (<1.15x optimal)
    uint32 public constant BADGE_COPPER = 1 << 4; // 4. Copper (<1.25x optimal)
    uint32 public constant BADGE_STONE = 1 << 5; // 5. Stone (max possible moves)
    // Badges 6-31 reserved for future use (placement, special achievements, etc.)

    error WithdrawalFailed();
    error NoBalance();

    event Withdrawal(address indexed to, uint256 amount);
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
    event BadgeAwarderUpdated(address indexed oldAwarder, address indexed newAwarder);
    event MazeRegistered(bytes32 indexed seedHash, string seed, uint256 indexed tokenId);
    event OptimalMovesSet(uint256 indexed tokenId, uint32 optimalMoves);
    event RegisteredSet(uint256 indexed tokenId, bool value);
    event RegistrarApprovedSet(uint256 indexed tokenId, bool value);
    event ProofVerified(address indexed solver, uint256 indexed tokenId, uint16 moveCount);
    event LayoutStored(uint256 indexed tokenId, uint16 width, uint16 height, uint256 byteSize);
    event FirstSolve(address indexed solver, uint256 indexed tokenId, uint16 moveCount);
    event NewBestScore(address indexed solver, uint256 indexed tokenId, uint16 newBest);
    event BadgesAwarded(address indexed solver, uint256 indexed tokenId, uint32 newBadges);

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
    /// @param publicInputs Array of PUBLIC_INPUTS_LENGTH public inputs (8 params + packed_cells + moveCount)
    /// @param moveCount Number of moves taken
    function mintWithProof(bytes calldata proof, bytes32[] calldata publicInputs, uint16 moveCount)
        external
    {
        require(verifierContract != address(0), "Verifier not set");
        require(publicInputs.length == MazeConstants.PUBLIC_INPUTS_LENGTH, "Invalid input length");

        // 1. Verify proof on-chain
        IVerifier verifier = IVerifier(verifierContract);
        bool isValid = verifier.verify(proof, publicInputs);
        require(isValid, "Invalid proof");

        // 2. Calculate tokenId from maze definition (excludes move_count at last index)
        uint256 mazeDataLen = MazeConstants.MAZE_DATA_LENGTH;
        bytes memory mazeData = new bytes(mazeDataLen * 32);
        for (uint256 i = 0; i < mazeDataLen; i++) {
            bytes32 val = publicInputs[i];
            assembly {
                mstore(add(mazeData, add(32, mul(i, 32))), val)
            }
        }
        uint256 tokenId = uint256(keccak256(mazeData));

        // 2b. Store compact layout the first time this maze is seen (any user).
        //     Skipping when bytes already exist keeps re-mints cheap and the layout immutable.
        if (layouts[tokenId].length == 0) {
            bytes memory packed = _packLayout(publicInputs);
            if (packed.length > 0) {
                layouts[tokenId] = packed;
                uint16 w = uint16(uint256(publicInputs[0]));
                uint16 h = uint16(uint256(publicInputs[1]));
                emit LayoutStored(tokenId, w, h, packed.length);
            }
        }

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
            emit FirstSolve(msg.sender, tokenId, moveCount);
        } else {
            if (moveCount < userStats.minMoves) {
                userStats.minMoves = moveCount;
                emit NewBestScore(msg.sender, tokenId, moveCount);
            }
            userStats.timesSolved++;
        }

        // 6. Delegate badge awards to the configured strategy
        if (badgeAwarder != address(0)) {
            uint32 newBadges =
                IBadgeAwarder(badgeAwarder).awardBadges(msg.sender, tokenId, uint32(moveCount));
            if (newBadges != 0) {
                userStats.badges |= newBadges;
                emit BadgesAwarded(msg.sender, tokenId, newBadges);
            }
        }

        emit ProofVerified(msg.sender, tokenId, moveCount);
    }

    /// @notice Per-token data URI built fully on-chain from the stored maze layout
    /// @dev Returns a data:application/json;base64 payload with an embedded SVG image.
    ///      Reverts if the layout hasn't been recorded yet (token never minted).
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        bytes memory layout = layouts[tokenId];
        require(layout.length > 0, "Unknown token");
        return MazeRenderer.tokenURI(tokenId, layout);
    }

    /// @notice ERC-1155 metadata URI; falls back to the static base when no layout is stored
    function uri(uint256 tokenId) public view override returns (string memory) {
        bytes memory layout = layouts[tokenId];
        if (layout.length == 0) {
            return super.uri(tokenId);
        }
        return MazeRenderer.tokenURI(tokenId, layout);
    }

    /// @notice Pack the public-input maze description into our compact layout format
    /// @dev Returns empty bytes if dimensions are obviously invalid.
    function _packLayout(bytes32[] calldata publicInputs) internal pure returns (bytes memory) {
        uint256 width = uint256(publicInputs[0]);
        uint256 height = uint256(publicInputs[1]);
        if (width == 0 || height == 0) return "";
        uint256 totalCells = width * height;
        if (totalCells > MazeConstants.MAX_MAZE_CELLS) return "";

        uint256 cellBytes = (totalCells + 1) / 2;
        bytes memory out = new bytes(16 + cellBytes);

        // Header: 8 uint16s big-endian
        for (uint256 i = 0; i < 8; i++) {
            uint256 v = uint256(publicInputs[i]);
            out[i * 2] = bytes1(uint8((v >> 8) & 0xff));
            out[i * 2 + 1] = bytes1(uint8(v & 0xff));
        }

        // Cells: copy the low byte of each packed input directly.
        // Each publicInputs[8 + i] holds one packed byte (high nibble = even cell, low = odd).
        for (uint256 i = 0; i < cellBytes; i++) {
            uint256 v = uint256(publicInputs[8 + i]);
            out[16 + i] = bytes1(uint8(v & 0xff));
        }

        return out;
    }

    /// @notice Update the pluggable badge-awarding strategy
    /// @param _awarder New awarder contract address (address(0) disables awards)
    function setBadgeAwarder(address _awarder) external onlyRole(OWNER_ROLE) {
        address oldAwarder = badgeAwarder;
        badgeAwarder = _awarder;
        emit BadgeAwarderUpdated(oldAwarder, _awarder);
    }

    /// @notice Record the optimal (minimum) move count for a maze
    /// @param tokenId The maze tokenId
    /// @param moves Optimal move count (0 = unknown)
    function setOptimalMoves(uint256 tokenId, uint32 moves) external onlyRole(REGISTRAR_ROLE) {
        optimalMoves[tokenId] = moves;
        emit OptimalMovesSet(tokenId, moves);
    }

    /// @notice Mark a maze as registered (officially recognized)
    /// @param tokenId The maze tokenId
    /// @param value Registered flag
    function setRegistered(uint256 tokenId, bool value) external onlyRole(REGISTRAR_ROLE) {
        registered[tokenId] = value;
        emit RegisteredSet(tokenId, value);
    }

    /// @notice Mark a maze as approved by the registrar for award eligibility
    /// @dev The default badge awarder grants BADGE_REGISTERED based on this flag
    /// @param tokenId The maze tokenId
    /// @param value Approval flag
    function setRegistrarApproved(uint256 tokenId, bool value) external onlyRole(REGISTRAR_ROLE) {
        registrarApproved[tokenId] = value;
        emit RegistrarApprovedSet(tokenId, value);
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
    function registerMaze(string calldata seed, uint256 tokenId) external onlyRole(REGISTRAR_ROLE) {
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

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Supply)
    {
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
