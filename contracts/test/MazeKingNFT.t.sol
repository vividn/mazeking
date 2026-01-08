// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MazeKingNFT } from "../src/MazeKingNFT.sol";

/// @title MockVerifier
/// @notice Mock verifier for testing
contract MockVerifier {
    bool public shouldPass;

    constructor(bool _shouldPass) {
        shouldPass = _shouldPass;
    }

    function verify(bytes calldata, bytes32[] calldata) external view returns (bool) {
        return shouldPass;
    }

    function setShouldPass(bool _shouldPass) external {
        shouldPass = _shouldPass;
    }
}

contract MazeKingNFTTest is Test {
    MazeKingNFT public nft;
    MockVerifier public verifier;
    address public owner = address(1);
    address public user = address(2);

    function setUp() public {
        // Deploy mock verifier
        verifier = new MockVerifier(true);

        // Deploy NFT with verifier
        vm.prank(owner);
        nft = new MazeKingNFT(
            "MazeKing",
            "MAZE",
            "https://api.mazeking.xyz/token/",
            owner,
            address(verifier)
        );
    }

    function test_InitialSetup() public view {
        assertEq(nft.name(), "MazeKing");
        assertEq(nft.symbol(), "MAZE");
        assertEq(nft.verifierContract(), address(verifier));
        assertTrue(nft.hasRole(nft.OWNER_ROLE(), owner));
        assertTrue(nft.hasRole(nft.WITHDRAWER_ROLE(), owner));
        assertTrue(nft.hasRole(nft.REGISTRAR_ROLE(), owner));
        assertTrue(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), owner));
    }

    function test_SetURI() public {
        vm.prank(owner);
        nft.setURI("https://new.uri/");
    }

    function test_RevertSetURIWithoutRole() public {
        vm.prank(user);
        vm.expectRevert();
        nft.setURI("https://new.uri/");
    }

    function test_Withdraw() public {
        vm.deal(address(nft), 1 ether);

        vm.prank(owner);
        nft.withdraw(payable(owner));

        assertEq(address(nft).balance, 0);
        assertEq(owner.balance, 1 ether);
    }

    function test_RevertWithdrawWithoutRole() public {
        vm.deal(address(nft), 1 ether);

        vm.prank(user);
        vm.expectRevert();
        nft.withdraw(payable(user));
    }

    function test_RevertWithdrawNoBalance() public {
        vm.prank(owner);
        vm.expectRevert(MazeKingNFT.NoBalance.selector);
        nft.withdraw(payable(owner));
    }

    function test_ReceiveETH() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        (bool success,) = address(nft).call{ value: 0.5 ether }("");
        assertTrue(success);
        assertEq(address(nft).balance, 0.5 ether);
    }

    // ==================================================
    // ZK Proof Minting Tests
    // ==================================================

    function _createMockPublicInputs() internal pure returns (bytes32[] memory) {
        bytes32[] memory publicInputs = new bytes32[](2509);
        // Fill with mock data: maze params + packed cells + move count
        publicInputs[0] = bytes32(uint256(10)); // width
        publicInputs[1] = bytes32(uint256(10)); // height
        publicInputs[2] = bytes32(uint256(0));  // start_x
        publicInputs[3] = bytes32(uint256(0));  // start_y
        publicInputs[4] = bytes32(uint256(5));  // key_x
        publicInputs[5] = bytes32(uint256(5));  // key_y
        publicInputs[6] = bytes32(uint256(9));  // goal_x
        publicInputs[7] = bytes32(uint256(9));  // goal_y
        // Indices 8-2507: packed_cells (filled with zeros for mock)
        publicInputs[2508] = bytes32(uint256(100)); // move_count
        return publicInputs;
    }

    function test_MintWithProof() public {
        bytes32[] memory publicInputs = _createMockPublicInputs();
        bytes memory proof = hex"1234567890"; // Mock proof

        vm.prank(user);
        nft.mintWithProof(proof, publicInputs, 100);

        // Calculate expected tokenId (same way contract does)
        bytes memory mazeData = new bytes(2508 * 32);
        for (uint256 i = 0; i < 2508; i++) {
            bytes32 val = publicInputs[i];
            assembly {
                mstore(add(mazeData, add(32, mul(i, 32))), val)
            }
        }
        uint256 expectedTokenId = uint256(keccak256(mazeData));

        // Verify NFT minted
        assertEq(nft.balanceOf(user, expectedTokenId), 1);

        // Verify stats
        (uint16 minMoves, uint16 timesSolved, uint32 badges,) = nft.stats(expectedTokenId, user);
        assertEq(minMoves, 100);
        assertEq(timesSolved, 1);
        assertEq(badges, nft.BADGE_VERIFIED());
    }

    function test_MintWithProof_InvalidProof() public {
        // Set verifier to reject
        verifier.setShouldPass(false);

        bytes32[] memory publicInputs = _createMockPublicInputs();
        bytes memory proof = hex"1234567890";

        vm.prank(user);
        vm.expectRevert("Invalid proof");
        nft.mintWithProof(proof, publicInputs, 100);
    }

    function test_MintWithProof_InvalidInputLength() public {
        bytes32[] memory publicInputs = new bytes32[](100); // Wrong length
        bytes memory proof = hex"1234567890";

        vm.prank(user);
        vm.expectRevert("Invalid input length");
        nft.mintWithProof(proof, publicInputs, 100);
    }

    function test_MintWithProof_TwiceUpdatesBest() public {
        bytes32[] memory publicInputs = _createMockPublicInputs();
        bytes memory proof = hex"1234567890";

        // First mint with 100 moves
        vm.prank(user);
        nft.mintWithProof(proof, publicInputs, 100);

        // Calculate tokenId
        bytes memory mazeData = new bytes(2508 * 32);
        for (uint256 i = 0; i < 2508; i++) {
            bytes32 val = publicInputs[i];
            assembly {
                mstore(add(mazeData, add(32, mul(i, 32))), val)
            }
        }
        uint256 tokenId = uint256(keccak256(mazeData));

        // Verify initial stats
        (uint16 minMoves1, uint16 timesSolved1,,) = nft.stats(tokenId, user);
        assertEq(minMoves1, 100);
        assertEq(timesSolved1, 1);

        // Second mint with 80 moves (better)
        vm.prank(user);
        nft.mintWithProof(proof, publicInputs, 80);

        // Verify updated stats
        (uint16 minMoves2, uint16 timesSolved2,,) = nft.stats(tokenId, user);
        assertEq(minMoves2, 80); // Updated to better score
        assertEq(timesSolved2, 2); // Incremented
        assertEq(nft.balanceOf(user, tokenId), 1); // Still only 1 NFT

        // Third mint with 90 moves (worse than current best)
        vm.prank(user);
        nft.mintWithProof(proof, publicInputs, 90);

        // Verify stats unchanged except timesSolved
        (uint16 minMoves3, uint16 timesSolved3,,) = nft.stats(tokenId, user);
        assertEq(minMoves3, 80); // Kept best score
        assertEq(timesSolved3, 3); // Incremented
    }

    function test_SetVerifier() public {
        MockVerifier newVerifier = new MockVerifier(true);

        vm.prank(owner);
        nft.setVerifier(address(newVerifier));

        assertEq(nft.verifierContract(), address(newVerifier));
    }

    function test_RevertSetVerifierWithoutRole() public {
        MockVerifier newVerifier = new MockVerifier(true);

        vm.prank(user);
        vm.expectRevert();
        nft.setVerifier(address(newVerifier));
    }

    function test_RegisterMaze() public {
        string memory seed = "test-maze-seed";
        uint256 tokenId = 12345;

        vm.prank(owner);
        nft.registerMaze(seed, tokenId);

        bytes32 seedHash = keccak256(bytes(seed));
        assertEq(nft.officialMazes(seedHash), tokenId);
    }

    function test_RevertRegisterMazeTwice() public {
        string memory seed = "test-maze-seed";
        uint256 tokenId = 12345;

        vm.prank(owner);
        nft.registerMaze(seed, tokenId);

        vm.prank(owner);
        vm.expectRevert("Already registered");
        nft.registerMaze(seed, tokenId);
    }

    function test_RevertRegisterMazeWithoutRole() public {
        string memory seed = "test-maze-seed";
        uint256 tokenId = 12345;

        vm.prank(user);
        vm.expectRevert();
        nft.registerMaze(seed, tokenId);
    }
}
