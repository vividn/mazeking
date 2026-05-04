// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MazeKingNFT } from "../src/MazeKingNFT.sol";
import { MazeConstants } from "../src/MazeConstants.sol";
import { IBadgeAwarder } from "../src/IBadgeAwarder.sol";
import { DefaultBadgeAwarder } from "../src/DefaultBadgeAwarder.sol";
import { MazeRenderer } from "../src/MazeRenderer.sol";

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

    /// @dev Default mock layout: 10x10 maze, all zeros for packed cells (we
    ///      don't actually verify path validity here — the MockVerifier
    ///      always returns true).
    function _mockLayout() internal pure returns (bytes memory) {
        bytes memory layout = new bytes(MazeConstants.LAYOUT_HEADER_BYTES + 50);
        // BE u16 header: width=10, height=10, sx=0, sy=0, kx=5, ky=5, gx=9, gy=9
        uint16[8] memory hdr = [uint16(10), 10, 0, 0, 5, 5, 9, 9];
        for (uint256 i = 0; i < 8; i++) {
            layout[i * 2] = bytes1(uint8(hdr[i] >> 8));
            layout[i * 2 + 1] = bytes1(uint8(hdr[i] & 0xFF));
        }
        return layout;
    }

    /// @dev Deterministic stand-in for the off-chain Pedersen hash. The
    ///      MockVerifier ignores the actual hash, so any deterministic
    ///      function of the layout suffices to give each layout a stable
    ///      tokenId in tests.
    function _mockMazeHash(bytes memory layout) internal pure returns (bytes32) {
        return keccak256(layout);
    }

    function test_MintWithProof() public {
        bytes memory layout = _mockLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        bytes memory proof = hex"1234567890";

        vm.prank(user);
        nft.mintWithProof(proof, mazeHash, layout, 100);

        uint256 expectedTokenId = uint256(mazeHash);

        // Verify NFT minted
        assertEq(nft.balanceOf(user, expectedTokenId), 1);

        // Verify stats — no awarder configured by default, so badges stay 0
        (uint16 minMoves, uint16 timesSolved, uint32 badges,) = nft.stats(expectedTokenId, user);
        assertEq(minMoves, 100);
        assertEq(timesSolved, 1);
        assertEq(badges, 0);
    }

    function test_MintWithProof_InvalidProof() public {
        verifier.setShouldPass(false);

        bytes memory layout = _mockLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        bytes memory proof = hex"1234567890";

        vm.prank(user);
        vm.expectRevert("Invalid proof");
        nft.mintWithProof(proof, mazeHash, layout, 100);
    }

    function test_MintWithProof_TwiceUpdatesBest() public {
        bytes memory layout = _mockLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        bytes memory proof = hex"1234567890";

        vm.prank(user);
        nft.mintWithProof(proof, mazeHash, layout, 100);

        uint256 tokenId = uint256(mazeHash);

        (uint16 minMoves1, uint16 timesSolved1,,) = nft.stats(tokenId, user);
        assertEq(minMoves1, 100);
        assertEq(timesSolved1, 1);

        vm.prank(user);
        nft.mintWithProof(proof, mazeHash, layout, 80);

        (uint16 minMoves2, uint16 timesSolved2,,) = nft.stats(tokenId, user);
        assertEq(minMoves2, 80);
        assertEq(timesSolved2, 2);
        assertEq(nft.balanceOf(user, tokenId), 1);

        vm.prank(user);
        nft.mintWithProof(proof, mazeHash, layout, 90);

        (uint16 minMoves3, uint16 timesSolved3,,) = nft.stats(tokenId, user);
        assertEq(minMoves3, 80);
        assertEq(timesSolved3, 3);
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

    function test_DisqualifyMaze() public {
        uint256 tokenId = 7777;

        assertFalse(nft.disqualified(tokenId));

        vm.expectEmit(true, false, false, true);
        emit MazeKingNFT.MazeDisqualified(tokenId, true);
        vm.prank(owner);
        nft.disqualifyMaze(tokenId, true);
        assertTrue(nft.disqualified(tokenId));

        vm.expectEmit(true, false, false, true);
        emit MazeKingNFT.MazeDisqualified(tokenId, false);
        vm.prank(owner);
        nft.disqualifyMaze(tokenId, false);
        assertFalse(nft.disqualified(tokenId));
    }

    function test_RevertDisqualifyMazeWithoutRole() public {
        vm.prank(user);
        vm.expectRevert();
        nft.disqualifyMaze(1, true);
    }

    function test_MintWithProof_AwardsRegisteredBadge() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes memory layout = _mockLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setRegistrarApproved(tokenId, true);
        vm.stopPrank();

        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 100);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges, nft.BADGE_REGISTERED());
    }

    function test_MintWithProof_AwardsRobotOnPerfect() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes memory layout = _mockLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setOptimalMoves(tokenId, 100);
        vm.stopPrank();

        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 100);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges & nft.BADGE_ROBOT(), nft.BADGE_ROBOT());
        assertEq(badges & nft.BADGE_GOLD(), 0);
        assertEq(badges & nft.BADGE_SILVER(), 0);
        assertEq(badges & nft.BADGE_COPPER(), 0);
    }

    function test_MintWithProof_AwardsGold() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes memory layout = _mockLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setOptimalMoves(tokenId, 100);
        vm.stopPrank();

        // 104 < 105 (1.04x) -> GOLD
        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 104);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges & nft.BADGE_GOLD(), nft.BADGE_GOLD());
        assertEq(badges & nft.BADGE_ROBOT(), 0);
        assertEq(badges & nft.BADGE_SILVER(), 0);
    }

    function test_MintWithProof_AwardsSilver() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes memory layout = _mockLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setOptimalMoves(tokenId, 100);
        vm.stopPrank();

        // 110 (1.10x) is in [1.05x, 1.15x) -> SILVER
        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 110);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges & nft.BADGE_SILVER(), nft.BADGE_SILVER());
        assertEq(badges & nft.BADGE_GOLD(), 0);
        assertEq(badges & nft.BADGE_COPPER(), 0);
    }

    function test_MintWithProof_AwardsCopper() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes memory layout = _mockLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setOptimalMoves(tokenId, 100);
        vm.stopPrank();

        // 120 (1.20x) is in [1.15x, 1.25x) -> COPPER
        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 120);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges & nft.BADGE_COPPER(), nft.BADGE_COPPER());
        assertEq(badges & nft.BADGE_SILVER(), 0);
    }

    function test_MintWithProof_NoMedalAtOrAboveCopperThreshold() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes memory layout = _mockLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setOptimalMoves(tokenId, 100);
        vm.stopPrank();

        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 125);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges & nft.BADGE_COPPER(), 0);
        assertEq(badges & nft.BADGE_SILVER(), 0);
        assertEq(badges & nft.BADGE_GOLD(), 0);
    }

    function test_MintWithProof_AwardsStoneAtMaxMoves() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes memory layout = _mockLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.prank(owner);
        nft.setBadgeAwarder(address(awarder));

        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, uint16(MazeConstants.MAX_MOVES));

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges & nft.BADGE_STONE(), nft.BADGE_STONE());
    }

    function test_MintWithProof_BadgesAccumulateAcrossSolves() public {
        DefaultBadgeAwarder awarder = new DefaultBadgeAwarder(address(nft));
        bytes memory layout = _mockLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.startPrank(owner);
        nft.setBadgeAwarder(address(awarder));
        nft.setOptimalMoves(tokenId, 100);
        vm.stopPrank();

        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 110);
        (,, uint32 b1,) = nft.stats(tokenId, user);
        assertEq(b1, nft.BADGE_SILVER());

        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 100);
        (,, uint32 b2,) = nft.stats(tokenId, user);
        assertEq(b2, nft.BADGE_SILVER() | nft.BADGE_ROBOT());

        vm.prank(owner);
        nft.setRegistrarApproved(tokenId, true);
        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 100);
        (,, uint32 b3,) = nft.stats(tokenId, user);
        assertEq(b3, nft.BADGE_SILVER() | nft.BADGE_ROBOT() | nft.BADGE_REGISTERED());
    }

    function test_MintWithProof_NoAwarderConfigured() public {
        bytes memory layout = _mockLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 100);

        (,, uint32 badges,) = nft.stats(tokenId, user);
        assertEq(badges, 0);
    }

    // ==================================================
    // On-chain SVG Rendering Tests (ma-6cr.7)
    // ==================================================

    /// @dev Deterministic 4x4 layout (header + 8 packed bytes). We craft it
    ///      directly in canonical layout-bytes form (the same shape the
    ///      caller passes to `mintWithProof`). The renderer uses these
    ///      bytes, so the cell pattern matters; the proof verifier is mocked.
    function _smallMazeLayout() internal pure returns (bytes memory) {
        bytes memory layout = new bytes(16 + 8);
        // Header: width=4, height=4, sx=0, sy=0, kx=2, ky=1, gx=3, gy=3
        uint16[8] memory hdr = [uint16(4), 4, 0, 0, 2, 1, 3, 3];
        for (uint256 i = 0; i < 8; i++) {
            layout[i * 2] = bytes1(uint8(hdr[i] >> 8));
            layout[i * 2 + 1] = bytes1(uint8(hdr[i] & 0xFF));
        }
        // Packed cells (high nibble = even, low = odd; bits = south|east|type[2]):
        //   0xC = south+east walls, Normal
        //   0x9 = south wall, Text
        //   0x6 = east wall, ZkText
        //   0x3 = no walls, CrownText
        uint8[8] memory cells = [0xC9, 0x63, 0xC0, 0x49, 0xCC, 0x33, 0xC9, 0x66];
        for (uint256 i = 0; i < 8; i++) {
            layout[16 + i] = bytes1(cells[i]);
        }
        return layout;
    }

    function test_MintStoresLayout() public {
        bytes memory layout = _smallMazeLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 50);

        bytes memory stored = nft.layouts(tokenId);
        assertEq(stored.length, 24);

        assertEq(uint8(stored[0]), 0);
        assertEq(uint8(stored[1]), 4);
        assertEq(uint8(stored[2]), 0);
        assertEq(uint8(stored[3]), 4);

        assertEq(uint8(stored[16]), 0xC9);
    }

    function test_MintLayoutWrittenOnce() public {
        bytes memory layout = _smallMazeLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 50);
        bytes memory firstLayout = nft.layouts(tokenId);

        address user2 = address(0x2222);
        vm.prank(user2);
        nft.mintWithProof(hex"00", mazeHash, layout, 60);
        bytes memory secondLayout = nft.layouts(tokenId);

        assertEq(firstLayout.length, secondLayout.length);
        assertEq(keccak256(firstLayout), keccak256(secondLayout));
    }

    function test_UriFallsBackWithoutRenderer() public {
        bytes memory layout = _smallMazeLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 50);

        assertEq(nft.uri(tokenId), "https://api.mazeking.xyz/token/");
    }

    function test_UriRendersOnChainSVG() public {
        MazeRenderer rendererContract = new MazeRenderer();

        vm.prank(owner);
        nft.setRenderer(address(rendererContract));

        bytes memory layout = _smallMazeLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 50);

        string memory tokenUri = nft.uri(tokenId);
        bytes memory uriBytes = bytes(tokenUri);

        assertGt(uriBytes.length, 100);
        bytes memory prefix = bytes("data:application/json;base64,");
        for (uint256 i = 0; i < prefix.length; i++) {
            assertEq(uriBytes[i], prefix[i], "tokenURI prefix mismatch");
        }
    }

    function test_RendererRenderSvgContainsExpectedShape() public {
        MazeRenderer rendererContract = new MazeRenderer();
        bytes memory layout = _smallMazeLayout();
        bytes32 mazeHash = _mockMazeHash(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 50);
        bytes memory storedLayout = nft.layouts(tokenId);

        string memory svg = rendererContract.renderSvg(tokenId, storedLayout);
        bytes memory s = bytes(svg);

        // Must start with <svg ...
        assertTrue(s.length > 100);
        assertEq(s[0], "<");
        assertEq(s[1], "s");
        assertEq(s[2], "v");
        assertEq(s[3], "g");

        // Must end with </svg>
        bytes memory closing = bytes("</svg>");
        for (uint256 i = 0; i < closing.length; i++) {
            assertEq(s[s.length - closing.length + i], closing[i], "missing svg close");
        }

        // viewBox dimensions are width*16 = 64 by height*16 = 64.
        assertTrue(_contains(svg, "viewBox=\"0 0 64 64\""));
        // The wall group should be present.
        assertTrue(_contains(svg, "<g stroke="));
        // Text-cell fills should appear in the SVG (cellType 1/2/3 produce rects).
        assertTrue(_contains(svg, "<rect x="));
        // Player/key/goal circles.
        assertTrue(_contains(svg, "<circle"));
    }

    function test_SetRenderer() public {
        MazeRenderer r = new MazeRenderer();
        vm.prank(owner);
        nft.setRenderer(address(r));
        assertEq(nft.renderer(), address(r));
    }

    function test_RevertSetRendererWithoutRole() public {
        MazeRenderer r = new MazeRenderer();
        vm.prank(user);
        vm.expectRevert();
        nft.setRenderer(address(r));
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0) return true;
        if (h.length < n.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }
}
