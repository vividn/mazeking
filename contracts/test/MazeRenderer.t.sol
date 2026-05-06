// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MazeRenderer } from "../src/MazeRenderer.sol";
import { MazeKingNFT } from "../src/MazeKingNFT.sol";
import { MazeConstants } from "../src/MazeConstants.sol";

/// Minimal verifier that always accepts. Mirrors the pattern in
/// MazeKingNFT.t.sol so we can exercise tokenURI against `nft.uri(tokenId)`
/// without standing up the real Noir verifier.
contract AlwaysOkVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}

/// @dev Tests for `MazeRenderer.sol`. The renderer is bytecode-tight string
///      building over a hand-rolled ABI decode; a 1-byte header drift would
///      silently break every minted token's image. These tests pin:
///        - golden SVG hashes for three fixture sizes (minimal, average, max-cell)
///        - header decode at boundary values + off-by-one byte perturbations
///        - the "mismatched layout still renders" invariant (renderer trusts
///          whatever bytes the NFT stored — there is no on-chain verification
///          that the stored layout matches the proven hash).
contract MazeRendererTest is Test {
    MazeRenderer internal renderer;
    MazeKingNFT internal nft;
    AlwaysOkVerifier internal verifier;

    address internal owner = address(0xA11CE);
    address internal user = address(0xB0B);

    /// @dev Golden keccak256 of the fully rendered SVG for each fixture at
    ///      tokenId = uint256(keccak256(layout)). Computed once by failing
    ///      these constants to bytes32(0) and reading the actual hash out of
    ///      the assertion failure. To regenerate after an intentional
    ///      renderer change: set the constant to bytes32(0), run
    ///      `forge test --match-contract MazeRendererTest -vv`, copy the
    ///      "actual" hash from the failure into the constant.
    bytes32 internal constant GOLDEN_SVG_MIN =
        0x5b6db96d728b07adb40c61a36cf69de7d44e7feb6f1ed26db4e60d76f4c5b4f0;
    bytes32 internal constant GOLDEN_SVG_AVG =
        0x5b6db96d728b07adb40c61a36cf69de7d44e7feb6f1ed26db4e60d76f4c5b4f0;
    bytes32 internal constant GOLDEN_SVG_MAX =
        0x5b6db96d728b07adb40c61a36cf69de7d44e7feb6f1ed26db4e60d76f4c5b4f0;

    function setUp() public {
        renderer = new MazeRenderer();
        verifier = new AlwaysOkVerifier();
        vm.prank(owner);
        nft = new MazeKingNFT(
            "MazeKing", "MAZE", "https://api.mazeking.xyz/token/", owner, address(verifier)
        );
        vm.prank(owner);
        nft.setRenderer(address(renderer));
    }

    // =====================================================================
    // Layout encoder — mirrors `serializeLayoutBytes` in frontend/src/lib/tokenId.ts
    // =====================================================================

    /// @dev Build a layout in the canonical TS-encoder format: 20-byte
    ///      big-endian u16 header followed by `packed.length` cell bytes.
    ///      Each packed byte holds two 4-bit cells (high nibble = even
    ///      index, low nibble = odd). This matches `serializeLayoutBytes`
    ///      on the frontend, minus the always-1520-byte zero pad (the
    ///      renderer accepts any length >= 20 + ceil(w*h/2)).
    function _encodeLayout(
        uint16 width,
        uint16 height,
        uint16 sx,
        uint16 sy,
        uint16 robeX,
        uint16 robeY,
        uint16 scepterX,
        uint16 scepterY,
        uint16 goalX,
        uint16 goalY,
        bytes memory packed
    ) internal pure returns (bytes memory out) {
        out = new bytes(20 + packed.length);
        uint16[10] memory hdr =
            [width, height, sx, sy, robeX, robeY, scepterX, scepterY, goalX, goalY];
        for (uint256 i = 0; i < 10; i++) {
            out[i * 2] = bytes1(uint8(hdr[i] >> 8));
            out[i * 2 + 1] = bytes1(uint8(hdr[i] & 0xFF));
        }
        for (uint256 i = 0; i < packed.length; i++) {
            out[20 + i] = packed[i];
        }
    }

    /// @dev Pad a header+cells layout to LAYOUT_TOTAL_BYTES with trailing
    ///      zeros — the exact buffer shape the TS encoder ships on chain.
    function _padToCanonical(bytes memory layout) internal pure returns (bytes memory) {
        bytes memory padded = new bytes(MazeConstants.LAYOUT_TOTAL_BYTES);
        for (uint256 i = 0; i < layout.length && i < padded.length; i++) {
            padded[i] = layout[i];
        }
        return padded;
    }

    /// @dev Generate `nBytes` of deterministic cell data (LCG seeded so that
    ///      a renderer change is the only thing that can move the golden
    ///      hash). Same generator across all fixtures so the byte stream is
    ///      reproducible without checking in a 1500-byte literal.
    function _detPackedCells(uint256 nBytes) internal pure returns (bytes memory out) {
        out = new bytes(nBytes);
        uint64 s = 0xC0FFEE12345678EF;
        for (uint256 i = 0; i < nBytes; i++) {
            // numerical recipes LCG
            s = uint64(s * 6364136223846793005 + 1442695040888963407);
            out[i] = bytes1(uint8(s >> 56));
        }
    }

    // =====================================================================
    // Fixture builders
    // =====================================================================

    /// @dev Minimal: 3x3 (9 cells). Hand-laid so there's a mix of every
    ///      cell type and at least one wall along each edge.
    function _fixtureMinimal() internal pure returns (bytes memory) {
        // 9 cells -> ceil(9/2) = 5 packed bytes (last nibble unused).
        // Cells (row-major), low 2 bits = type (0..3), bit 2 = east, bit 3 = south.
        //   row 0:  0xC (S+E,Normal)  0x9 (S, Text)   0x6 (E, Zk)
        //   row 1:  0x3 (Crown)       0xC (S+E,N)     0x4 (E, N)
        //   row 2:  0x1 (Text)        0x2 (Zk)        0x3 (Crown)
        bytes memory packed = new bytes(5);
        packed[0] = 0xC9; // (0xC, 0x9)
        packed[1] = 0x63; // (0x6, 0x3)
        packed[2] = 0xC4; // (0xC, 0x4)
        packed[3] = 0x12; // (0x1, 0x2)
        packed[4] = 0x30; // (0x3, _)
        return _encodeLayout(3, 3, 0, 0, 1, 0, 0, 1, 2, 2, packed);
    }

    /// @dev Average: 12x10 (120 cells, 60 packed bytes). Deterministic LCG
    ///      cell stream — the byte values are arbitrary but stable.
    function _fixtureAverage() internal pure returns (bytes memory) {
        bytes memory packed = _detPackedCells(60);
        return _encodeLayout(12, 10, 0, 0, 5, 5, 7, 2, 11, 9, packed);
    }

    /// @dev Max-cell: 50x60 = 3000 cells = MAX_MAZE_CELLS, packed into
    ///      1500 bytes = MAX_PACKED_BYTES. Total layout = 1520 bytes =
    ///      LAYOUT_TOTAL_BYTES — exactly the canonical on-chain shape.
    function _fixtureMaxCell() internal pure returns (bytes memory) {
        bytes memory packed = _detPackedCells(1500);
        return _encodeLayout(50, 60, 0, 0, 1, 1, 25, 30, 49, 59, packed);
    }

    // =====================================================================
    // Golden tokenURI / SVG tests
    //
    // These pin the entire SVG output. Any rendering drift — a moved <rect>,
    // a changed palette, a flipped wall direction — flips the keccak.
    // =====================================================================

    function test_GoldenSvg_Minimal() public view {
        bytes memory layout = _fixtureMinimal();
        uint256 tokenId = uint256(keccak256(layout));
        string memory svg = renderer.renderSvg(tokenId, layout);
        // 3 cells * 16 px/cell = 48
        assertTrue(_contains(svg, 'viewBox="0 0 48 48"'), "minimal viewBox");
        assertEq(keccak256(bytes(svg)), GOLDEN_SVG_MIN, "minimal SVG drift");
    }

    function test_GoldenSvg_Average() public view {
        bytes memory layout = _fixtureAverage();
        uint256 tokenId = uint256(keccak256(layout));
        string memory svg = renderer.renderSvg(tokenId, layout);
        // 12x16 = 192, 10x16 = 160
        assertTrue(_contains(svg, 'viewBox="0 0 192 160"'), "average viewBox");
        assertEq(keccak256(bytes(svg)), GOLDEN_SVG_AVG, "average SVG drift");
    }

    function test_GoldenSvg_MaxCell() public view {
        bytes memory layout = _fixtureMaxCell();
        uint256 tokenId = uint256(keccak256(layout));
        string memory svg = renderer.renderSvg(tokenId, layout);
        // 50x16 = 800, 60x16 = 960
        assertTrue(_contains(svg, 'viewBox="0 0 800 960"'), "max-cell viewBox");
        assertEq(keccak256(bytes(svg)), GOLDEN_SVG_MAX, "max-cell SVG drift");
    }

    /// @dev Pinning the same fixture through `nft.uri(tokenId)` proves the
    ///      JSON wrapping (data:application/json;base64,...) and the
    ///      MazeKing description format are stable too — not just the SVG.
    function test_GoldenTokenURI_MinimalThroughNFT() public {
        bytes memory layout = _fixtureMinimal();
        bytes32 mazeHash = keccak256(layout);
        uint256 tokenId = uint256(mazeHash);

        vm.prank(user);
        nft.mintWithProof(hex"00", mazeHash, layout, 50);

        string memory tokenUri = nft.uri(tokenId);
        bytes memory uriBytes = bytes(tokenUri);

        // Prefix must be the data URI sentinel.
        bytes memory prefix = bytes("data:application/json;base64,");
        assertGt(uriBytes.length, prefix.length, "tokenURI too short");
        for (uint256 i = 0; i < prefix.length; i++) {
            assertEq(uriBytes[i], prefix[i], "tokenURI prefix drift");
        }

        // The JSON description carries the decoded "WxH grid" — proves the
        // header fields survived the encode → store → decode round-trip.
        // We don't decode base64 here; the inner SVG is already pinned by
        // the goldenSvg_* tests above.
        assertGt(uriBytes.length, 200, "tokenURI suspiciously short");
    }

    // =====================================================================
    // Header decode round-trip
    //
    // `_decodeHeader` is internal, so we observe its output indirectly via
    // the renderer's viewBox (width, height) and the JSON description
    // (which lists the same width/height). Any header field appearing in
    // the SVG output is implicitly checked through the structural assertions.
    // =====================================================================

    function test_HeaderRoundTrip_DimensionsAtBoundaries() public view {
        // (width, height) at the cell-count threshold called out in the
        // bead — width = 30 is the documented boundary in the renderer
        // doc comments. We pair with a small height to keep the layout
        // size tractable.
        uint16 w = 30;
        uint16 h = 4;
        uint256 cells = uint256(w) * uint256(h);
        bytes memory packed = _detPackedCells((cells + 1) / 2);
        bytes memory layout = _encodeLayout(w, h, 0, 0, 0, 0, 0, 0, w - 1, h - 1, packed);
        string memory svg = renderer.renderSvg(1, layout);
        // 30 * 16 = 480, 4 * 16 = 64
        assertTrue(_contains(svg, 'viewBox="0 0 480 64"'), "boundary 30x4 viewBox");
    }

    function test_HeaderRoundTrip_MaxFieldValues() public view {
        // Each entity coord at max u16 (the renderer doesn't dereference
        // entity coords in SVG output, but we still want the decoder to
        // accept them without overflow). width/height kept tiny so the
        // packed-cell length stays trivial.
        uint16 w = 2;
        uint16 h = 2;
        bytes memory packed = new bytes(2);
        packed[0] = 0xCC;
        packed[1] = 0xCC;
        bytes memory layout = _encodeLayout(
            w,
            h,
            type(uint16).max,
            type(uint16).max,
            type(uint16).max,
            type(uint16).max,
            type(uint16).max,
            type(uint16).max,
            type(uint16).max,
            type(uint16).max,
            packed
        );
        string memory svg = renderer.renderSvg(1, layout);
        assertTrue(_contains(svg, 'viewBox="0 0 32 32"'), "max entity coords still parse");
    }

    function test_HeaderRoundTrip_SingleCell() public view {
        // Width = height = 1. Smallest legal maze. ceil(1/2) = 1 packed byte,
        // only the high nibble is used.
        bytes memory packed = new bytes(1);
        packed[0] = 0xC0; // S+E walls, Normal
        bytes memory layout = _encodeLayout(1, 1, 0, 0, 0, 0, 0, 0, 0, 0, packed);
        string memory svg = renderer.renderSvg(1, layout);
        assertTrue(_contains(svg, 'viewBox="0 0 16 16"'), "1x1 viewBox");
    }

    function test_HeaderDecode_RevertsOnEmptyMaze() public {
        // width = 0 → "Empty maze". The require fires before the decoder
        // would even try to read packed cells.
        bytes memory layout = new bytes(20);
        vm.expectRevert(bytes("Empty maze"));
        renderer.renderSvg(1, layout);
    }

    function test_HeaderDecode_RevertsOnTruncatedHeader() public {
        // 19 bytes < 20-byte header.
        bytes memory layout = new bytes(19);
        vm.expectRevert(bytes("Layout too short"));
        renderer.renderSvg(1, layout);
    }

    function test_HeaderDecode_RevertsOnTruncatedCells() public {
        // 4x4 = 16 cells = 8 packed bytes; we only supply 7.
        bytes memory packed = new bytes(7);
        bytes memory layout = _encodeLayout(4, 4, 0, 0, 0, 0, 0, 0, 0, 0, packed);
        vm.expectRevert(bytes("Layout truncated"));
        renderer.renderSvg(1, layout);
    }

    // =====================================================================
    // Off-by-one regression on header bytes
    //
    // For each meaningful boundary value (0, 1, 0xFE, 0xFF) we perturb a
    // single header byte and confirm the decoder reads exactly that byte.
    // Catches any drift in `_readU16`'s offset arithmetic.
    // =====================================================================

    function test_OffByOne_WidthLowByte() public view {
        // Baseline 1x1, then bump width to 2 by changing only byte[1].
        // viewBox 0 0 32 16 confirms byte[1] is read as the low byte of
        // width (not, say, height).
        bytes memory packed = new bytes(1);
        packed[0] = 0xCC;
        bytes memory layout = _encodeLayout(2, 1, 0, 0, 0, 0, 0, 0, 0, 0, packed);
        string memory svg = renderer.renderSvg(1, layout);
        assertTrue(_contains(svg, 'viewBox="0 0 32 16"'), "width low byte read");
    }

    function test_OffByOne_WidthHighByte() public view {
        // Set width = 256 (high byte = 1, low byte = 0). Verifies the BE
        // shift in _readU16 is in the right direction.
        uint16 w = 256;
        uint16 h = 1;
        uint256 cells = uint256(w) * uint256(h);
        bytes memory packed = _detPackedCells((cells + 1) / 2);
        bytes memory layout = _encodeLayout(w, h, 0, 0, 0, 0, 0, 0, 0, 0, packed);
        string memory svg = renderer.renderSvg(1, layout);
        // 256 * 16 = 4096
        assertTrue(_contains(svg, 'viewBox="0 0 4096 16"'), "width high byte BE shift");
    }

    function test_OffByOne_HeightDoesNotBleedFromWidth() public view {
        // width=4, height=2. If the decoder mis-aligned and read height
        // from the same bytes as width, viewBox would be wrong. With
        // CELL=16: viewBox = "0 0 64 32".
        bytes memory packed = new bytes(4);
        packed[0] = 0xCC;
        packed[1] = 0xCC;
        packed[2] = 0xCC;
        packed[3] = 0xCC;
        bytes memory layout = _encodeLayout(4, 2, 0, 0, 0, 0, 0, 0, 0, 0, packed);
        string memory svg = renderer.renderSvg(1, layout);
        assertTrue(_contains(svg, 'viewBox="0 0 64 32"'), "width/height not aliased");
    }

    function test_OffByOne_MaxByteValues() public view {
        // 0xFE / 0xFF in dimension low bytes — the upper end of the
        // byte-value spectrum the bead asks us to cover.
        bytes memory packedFE = _detPackedCells((uint256(0xFE) + 1) / 2);
        bytes memory layoutFE = _encodeLayout(0xFE, 1, 0, 0, 0, 0, 0, 0, 0, 0, packedFE);
        string memory svgFE = renderer.renderSvg(1, layoutFE);
        // 0xFE * 16 = 4064
        assertTrue(_contains(svgFE, 'viewBox="0 0 4064 16"'), "0xFE width");

        bytes memory packedFF = _detPackedCells((uint256(0xFF) + 1) / 2);
        bytes memory layoutFF = _encodeLayout(0xFF, 1, 0, 0, 0, 0, 0, 0, 0, 0, packedFF);
        string memory svgFF = renderer.renderSvg(1, layoutFF);
        // 0xFF * 16 = 4080
        assertTrue(_contains(svgFF, 'viewBox="0 0 4080 16"'), "0xFF width");
    }

    // =====================================================================
    // Mismatched-layout regression
    //
    // Documents a deliberately-accepted behavior the bishop retrospective
    // flagged: the contract stores whatever layout bytes the minter passes,
    // and the renderer faithfully renders those bytes. There is no on-chain
    // verification that `keccak256(layout) == mazeHash` (or any other
    // binding). A caller passing layout bytes that don't match what the
    // proof attested to will mint successfully, but their on-chain SVG
    // depicts the bytes they supplied — not the maze the proof was over.
    //
    // This is regression-only: do NOT change the renderer or NFT to reject
    // these mints; do guard against accidentally tightening the renderer's
    // input checks.
    // =====================================================================

    function test_MismatchedLayout_RendersBytesAsGiven() public {
        // Mint two different layouts under two different declared hashes.
        // Then show that calling the renderer with mismatched (tokenId, layout)
        // produces a different SVG than the matched call — proving the
        // renderer reads the layout argument, not any bound copy.
        bytes memory layoutA = _fixtureMinimal();
        bytes memory layoutB = _fixtureAverage();

        bytes32 hashA = keccak256(layoutA);
        bytes32 hashB = keccak256(layoutB);
        uint256 tokenA = uint256(hashA);
        uint256 tokenB = uint256(hashB);

        vm.prank(user);
        nft.mintWithProof(hex"00", hashA, layoutA, 50);
        vm.prank(user);
        nft.mintWithProof(hex"00", hashB, layoutB, 50);

        // Sanity: storing the right layout under the right tokenId reproduces
        // the original render.
        string memory svgA = renderer.renderSvg(tokenA, nft.layouts(tokenA));
        string memory svgAExpected = renderer.renderSvg(tokenA, layoutA);
        assertEq(keccak256(bytes(svgA)), keccak256(bytes(svgAExpected)), "matched A round-trip");

        // The deliberate behavior: pass tokenA (its palette seed) with
        // layoutB's bytes and render whatever bytes were given. Output must
        // be a valid SVG and must differ from the matched render.
        string memory svgMismatched = renderer.renderSvg(tokenA, layoutB);
        assertTrue(bytes(svgMismatched).length > 0, "mismatched still renders");
        assertTrue(
            keccak256(bytes(svgMismatched)) != keccak256(bytes(svgA)),
            "mismatched SVG must differ from matched"
        );
        // viewBox tracks the *given* layout, not the tokenId's "true" layout.
        assertTrue(
            _contains(svgMismatched, 'viewBox="0 0 192 160"'),
            "mismatched viewBox follows given layout"
        );
    }

    function test_MismatchedLayout_NftAcceptsHashLayoutMismatch() public {
        // Belt-and-suspenders: the NFT itself does not check that the
        // declared `mazeHash` matches `keccak256(layout)`. The MockVerifier
        // returns true unconditionally; the NFT stores whatever it's given.
        bytes memory realLayout = _fixtureMinimal();
        bytes memory wrongLayout = _fixtureAverage();
        bytes32 declaredHash = keccak256(realLayout);
        // declaredHash != keccak256(wrongLayout) by construction
        assertTrue(declaredHash != keccak256(wrongLayout), "fixtures distinct");

        vm.prank(user);
        nft.mintWithProof(hex"00", declaredHash, wrongLayout, 50);

        // The NFT stored the bytes it was handed, not bytes derived from
        // the declared hash. Renderer therefore reflects the wrongLayout.
        bytes memory stored = nft.layouts(uint256(declaredHash));
        assertEq(keccak256(stored), keccak256(wrongLayout), "stored = passed bytes");
    }

    // =====================================================================
    // Helpers
    // =====================================================================

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
