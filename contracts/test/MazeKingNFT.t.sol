// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MazeKingNFT } from "../src/MazeKingNFT.sol";
import { MazeConstants } from "../src/MazeConstants.sol";
import { IBadgeAwarder } from "../src/IBadgeAwarder.sol";
import { DefaultBadgeAwarder } from "../src/DefaultBadgeAwarder.sol";

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
            "MazeKing", "MAZE", "https://api.mazeking.xyz/token/", owner, address(verifier)
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
        bytes32[] memory publicInputs = new bytes32[](MazeConstants.PUBLIC_INPUTS_LENGTH);
        // Fill with mock data: maze params + packed cells + move count
        publicInputs[0] = bytes32(uint256(10)); // width
        publicInputs[1] = bytes32(uint256(10)); // height
        publicInputs[2] = bytes32(uint256(0)); // start_x
        publicInputs[3] = bytes32(uint256(0)); // start_y
        publicInputs[4] = bytes32(uint256(5)); // key_x
        publicInputs[5] = bytes32(uint256(5)); // key_y
        publicInputs[6] = bytes32(uint256(9)); // goal_x
        publicInputs[7] = bytes32(uint256(9)); // goal_y
        // Indices 8 to MAZE_DATA_LENGTH-1: packed_cells (filled with zeros for mock)
        publicInputs[MazeConstants.MAZE_DATA_LENGTH] = bytes32(uint256(100)); // move_count
        return publicInputs;
    }

    function _tokenIdFromInputs(bytes32[] memory publicInputs) internal pure returns (uint256) {
        uint256 mazeDataLen = MazeConstants.MAZE_DATA_LENGTH;
        bytes memory mazeData = new bytes(mazeDataLen * 32);
        for (uint256 i = 0; i < mazeDataLen; i++) {
            bytes32 val = publicInputs[i];
            assembly {
                mstore(add(mazeData, add(32, mul(i, 32))), val)
            }
        }
        return uint256(keccak256(mazeData));
    }

    function test_MintWithProof() public {
        bytes32[] memory publicInputs = _createMockPublicInputs();
        bytes memory proof = hex"1234567890"; // Mock proof

        vm.prank(user);
        nft.mintWithProof(proof, publicInputs, 100);

        uint256 expectedTokenId = _tokenIdFromInputs(publicInputs);

        // Verify NFT minted
        assertEq(nft.balanceOf(user, expectedTokenId), 1);

        // Verify stats — no awarder configured by default, so badges stay 0
        (uint16 minMoves, uint16 timesSolved, uint32 badges,) = nft.stats(expectedTokenId, user);
        assertEq(minMoves, 100);
        assertEq(timesSolved, 1);
        assertEq(badges, 0);
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

        uint256 tokenId = _tokenIdFromInputs(publicInputs);

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

    // ==================================================
    // Badge Awarder Integration Tests
    // ==================================================

    function test_SetBadgeAwarder() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));

        vm.prank(owner);
        nft.setBadgeAwarder(address(awarder));

        assertEq(nft.badgeAwarder(), address(awarder));
    }

    function test_RevertSetBadgeAwarderWithoutRole() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));

        vm.prank(user);
        vm.expectRevert();
        nft.setBadgeAwarder(address(awarder));
    }

    function test_RegistrarSetters() public {
        uint256 tokenId = 42;

        vm.startPrank(owner);
        nft.setOptimalMoves(tokenId, 50);
        nft.setRegistered(tokenId, true);
        nft.setRegistrarApproved(tokenId, true);
        vm.stopPrank();

        assertEq(nft.optimalMoves(tokenId), 50);
        assertTrue(nft.registered(tokenId));
        assertTrue(nft.registrarApproved(tokenId));
    }

    function test_RevertSetOptimalMovesWithoutRole() public {
        vm.prank(user);
        vm.expectRevert();
        nft.setOptimalMoves(1, 10);
    }

    function test_RevertSetRegisteredWithoutRole() public {
        vm.prank(user);
        vm.expectRevert();
        nft.setRegistered(1, true);
    }

    function test_RevertSetRegistrarApprovedWithoutRole() public {
        vm.prank(user);
        vm.expectRevert();
        nft.setRegistrarApproved(1, true);
    }

    function test_MintWithProof_AwardsRegisteredBadge() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes32[] memory publicInputs = _createMockPublicInputs();
        uint256 tokenId = _tokenIdFromInputs(publicInputs);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setRegistrarApproved(tokenId, true);
        vm.stopPrank();

        vm.prank(user);
        nft.mintWithProof(hex"00", publicInputs, 100);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges, nft.BADGE_REGISTERED());
    }

    function test_MintWithProof_AwardsRobotOnPerfect() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes32[] memory publicInputs = _createMockPublicInputs();
        uint256 tokenId = _tokenIdFromInputs(publicInputs);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setOptimalMoves(tokenId, 100);
        vm.stopPrank();

        vm.prank(user);
        nft.mintWithProof(hex"00", publicInputs, 100);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges & nft.BADGE_ROBOT(), nft.BADGE_ROBOT());
        assertEq(badges & nft.BADGE_GOLD(), 0);
        assertEq(badges & nft.BADGE_SILVER(), 0);
        assertEq(badges & nft.BADGE_COPPER(), 0);
    }

    function test_MintWithProof_AwardsGold() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes32[] memory publicInputs = _createMockPublicInputs();
        uint256 tokenId = _tokenIdFromInputs(publicInputs);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setOptimalMoves(tokenId, 100);
        vm.stopPrank();

        // 104 < 105 (1.04x) -> GOLD
        vm.prank(user);
        nft.mintWithProof(hex"00", publicInputs, 104);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges & nft.BADGE_GOLD(), nft.BADGE_GOLD());
        assertEq(badges & nft.BADGE_ROBOT(), 0);
        assertEq(badges & nft.BADGE_SILVER(), 0);
    }

    function test_MintWithProof_AwardsSilver() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes32[] memory publicInputs = _createMockPublicInputs();
        uint256 tokenId = _tokenIdFromInputs(publicInputs);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setOptimalMoves(tokenId, 100);
        vm.stopPrank();

        // 110 (1.10x) is in [1.05x, 1.15x) -> SILVER
        vm.prank(user);
        nft.mintWithProof(hex"00", publicInputs, 110);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges & nft.BADGE_SILVER(), nft.BADGE_SILVER());
        assertEq(badges & nft.BADGE_GOLD(), 0);
        assertEq(badges & nft.BADGE_COPPER(), 0);
    }

    function test_MintWithProof_AwardsCopper() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes32[] memory publicInputs = _createMockPublicInputs();
        uint256 tokenId = _tokenIdFromInputs(publicInputs);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setOptimalMoves(tokenId, 100);
        vm.stopPrank();

        // 120 (1.20x) is in [1.15x, 1.25x) -> COPPER
        vm.prank(user);
        nft.mintWithProof(hex"00", publicInputs, 120);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges & nft.BADGE_COPPER(), nft.BADGE_COPPER());
        assertEq(badges & nft.BADGE_SILVER(), 0);
    }

    function test_MintWithProof_NoMedalAtOrAboveCopperThreshold() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes32[] memory publicInputs = _createMockPublicInputs();
        uint256 tokenId = _tokenIdFromInputs(publicInputs);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setOptimalMoves(tokenId, 100);
        vm.stopPrank();

        // 125 (1.25x) is at the COPPER ceiling — no medal (strict <)
        vm.prank(user);
        nft.mintWithProof(hex"00", publicInputs, 125);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges & nft.BADGE_COPPER(), 0);
        assertEq(badges & nft.BADGE_SILVER(), 0);
        assertEq(badges & nft.BADGE_GOLD(), 0);
    }

    function test_MintWithProof_AwardsStoneAtMaxMoves() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes32[] memory publicInputs = _createMockPublicInputs();
        publicInputs[MazeConstants.MAZE_DATA_LENGTH] = bytes32(uint256(MazeConstants.MAX_MOVES));
        uint256 tokenId = _tokenIdFromInputs(publicInputs);

        vm.prank(owner);
        nft.setBadgeAwarder(address(awarder));

        vm.prank(user);
        nft.mintWithProof(hex"00", publicInputs, uint16(MazeConstants.MAX_MOVES));

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges & nft.BADGE_STONE(), nft.BADGE_STONE());
    }

    function test_MintWithProof_BadgesAccumulateAcrossSolves() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes32[] memory publicInputs = _createMockPublicInputs();
        uint256 tokenId = _tokenIdFromInputs(publicInputs);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setOptimalMoves(tokenId, 100);
        vm.stopPrank();

        // First solve at 110 -> SILVER
        vm.prank(user);
        nft.mintWithProof(hex"00", publicInputs, 110);
        (,, uint32 b1,) = nft.stats(tokenId, user);
        assertEq(b1, nft.BADGE_SILVER());

        // Second solve at 100 -> ROBOT (OR-accumulates)
        vm.prank(user);
        nft.mintWithProof(hex"00", publicInputs, 100);
        (,, uint32 b2,) = nft.stats(tokenId, user);
        assertEq(b2, nft.BADGE_SILVER() | nft.BADGE_ROBOT());

        // Now flip on registrarApproved and solve again -> add REGISTERED
        vm.prank(owner);
        nft.setRegistrarApproved(tokenId, true);
        vm.prank(user);
        nft.mintWithProof(hex"00", publicInputs, 100);
        (,, uint32 b3,) = nft.stats(tokenId, user);
        assertEq(b3, nft.BADGE_SILVER() | nft.BADGE_ROBOT() | nft.BADGE_REGISTERED());
    }

    function test_MintWithProof_NoAwarderConfigured() public {
        // Default state — no awarder set, no badges should be granted
        bytes32[] memory publicInputs = _createMockPublicInputs();
        uint256 tokenId = _tokenIdFromInputs(publicInputs);

        vm.prank(user);
        nft.mintWithProof(hex"00", publicInputs, 100);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges, 0);
    }
}
