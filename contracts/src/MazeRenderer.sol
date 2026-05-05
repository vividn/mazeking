// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Base64 } from "@openzeppelin/contracts/utils/Base64.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

/// @title MazeRenderer
/// @notice On-chain SVG renderer for MazeKing NFTs.
/// @dev Decodes a stored layout (maze + entity positions) and emits a JSON
///      tokenURI whose image field is a fully on-chain SVG. The SVG is the
///      static maze structure only — walls, cells, and embedded-text fills.
///      Character / pickup / goal overlays are intentionally omitted (ma-e7r);
///      the live game render (Canvas) handles mid-play state, while this
///      shareable / archived render is meant to be a clean depiction of the
///      maze itself. Entity coordinates remain in the header for layout
///      validation and to keep the format stable for any future consumers.
///
///      The layout format is produced by MazeKingNFT at mint time:
///
///      [0:2]   width  (uint16 BE)
///      [2:4]   height (uint16 BE)
///      [4:6]   startX
///      [6:8]   startY
///      [8:10]  robeX
///      [10:12] robeY
///      [12:14] scepterX
///      [14:16] scepterY
///      [16:18] goalX
///      [18:20] goalY
///      [20:]   packed_cells: ceil(width*height/2) bytes
///
///      Each packed-cells byte holds two 4-bit cells (high nibble = even index,
///      low nibble = odd index). Within a nibble:
///        bit 3: south wall, bit 2: east wall, bits 1-0: cell type.
///      Cell types: 0=Normal, 1=Text, 2=ZkText, 3=CrownText.
///
///      Colors are derived deterministically from tokenId and emitted as HSL
///      strings, so the SVG client does the HSL→RGB conversion (saving us a
///      Solidity HSL routine). Walls are emitted inside a single <g> group so
///      stroke attributes are shared, keeping the response under typical wallet
///      RPC limits even for the largest demo mazes.
contract MazeRenderer {
    using Strings for uint256;

    /// @dev SVG units per maze cell. Small enough to keep the response compact,
    ///      large enough to keep the embedded-text pixels visible after the
    ///      browser scales the SVG up.
    uint256 internal constant CELL = 16;

    struct Header {
        uint16 width;
        uint16 height;
        uint16 startX;
        uint16 startY;
        uint16 robeX;
        uint16 robeY;
        uint16 scepterX;
        uint16 scepterY;
        uint16 goalX;
        uint16 goalY;
    }

    struct Palette {
        string wall;
        string mazeBg;
        string textBg;
        string zkBg;
        string crownBg;
    }

    /// @notice Render a base64-encoded data URI for `tokenId`.
    /// @param tokenId Token id (used as the color seed).
    /// @param layout  Encoded layout bytes (see contract-level docs).
    function tokenURI(uint256 tokenId, bytes calldata layout)
        external
        pure
        returns (string memory)
    {
        Header memory h = _decodeHeader(layout);
        Palette memory p = _palette(tokenId);

        string memory svg = _renderSvg(h, layout, p);

        bytes memory json = abi.encodePacked(
            '{"name":"MazeKing #',
            _shortId(tokenId),
            '","description":"On-chain SVG maze rendered from a ZK-verified layout. ',
            _u(uint256(h.width)),
            "x",
            _u(uint256(h.height)),
            ' grid.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    /// @notice Render only the SVG (useful for tests / off-chain previews).
    function renderSvg(uint256 tokenId, bytes calldata layout)
        external
        pure
        returns (string memory)
    {
        Header memory h = _decodeHeader(layout);
        Palette memory p = _palette(tokenId);
        return _renderSvg(h, layout, p);
    }

    // ---------------------------------------------------------------------
    // Layout decoding
    // ---------------------------------------------------------------------

    function _decodeHeader(bytes calldata layout) internal pure returns (Header memory h) {
        require(layout.length >= 20, "Layout too short");
        h.width = _readU16(layout, 0);
        h.height = _readU16(layout, 2);
        h.startX = _readU16(layout, 4);
        h.startY = _readU16(layout, 6);
        h.robeX = _readU16(layout, 8);
        h.robeY = _readU16(layout, 10);
        h.scepterX = _readU16(layout, 12);
        h.scepterY = _readU16(layout, 14);
        h.goalX = _readU16(layout, 16);
        h.goalY = _readU16(layout, 18);
        require(h.width > 0 && h.height > 0, "Empty maze");
        uint256 totalCells = uint256(h.width) * uint256(h.height);
        uint256 expected = 20 + (totalCells + 1) / 2;
        require(layout.length >= expected, "Layout truncated");
    }

    function _readU16(bytes calldata layout, uint256 offset) internal pure returns (uint16) {
        return (uint16(uint8(layout[offset])) << 8) | uint16(uint8(layout[offset + 1]));
    }

    /// @dev Read a single 4-bit cell at row-major index `idx`. The packed bytes
    ///      live in `layout[20:]`; high nibble = even index, low nibble = odd.
    function _cellAt(bytes calldata layout, uint256 idx) internal pure returns (uint8) {
        uint256 byteIdx = 20 + (idx >> 1);
        uint8 b = uint8(layout[byteIdx]);
        return (idx & 1) == 0 ? (b >> 4) & 0x0F : b & 0x0F;
    }

    // ---------------------------------------------------------------------
    // SVG rendering
    // ---------------------------------------------------------------------

    function _renderSvg(Header memory h, bytes calldata layout, Palette memory p)
        internal
        pure
        returns (string memory)
    {
        uint256 svgW = uint256(h.width) * CELL;
        uint256 svgH = uint256(h.height) * CELL;

        bytes memory head = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ',
            _u(svgW),
            " ",
            _u(svgH),
            '" shape-rendering="crispEdges">',
            '<rect width="100%" height="100%" fill="',
            p.mazeBg,
            '"/>'
        );

        bytes memory cells = _renderCellFills(h, layout, p);
        bytes memory walls = _renderWalls(h, layout, p);

        return string(abi.encodePacked(head, cells, walls, "</svg>"));
    }

    /// @dev Emit a colored rect for every cell whose cellType is non-Normal.
    ///      These rects ARE the embedded-text pixels: the maze grid is the
    ///      canvas, and each text cell is one pixel of a letter glyph. So
    ///      coloring them per cellType reproduces the canvas's letter render
    ///      without us having to ship a pixel-font ROM in bytecode.
    function _renderCellFills(Header memory h, bytes calldata layout, Palette memory p)
        internal
        pure
        returns (bytes memory out)
    {
        uint256 width = uint256(h.width);
        uint256 height = uint256(h.height);
        for (uint256 y = 0; y < height; y++) {
            for (uint256 x = 0; x < width; x++) {
                uint8 cell = _cellAt(layout, y * width + x);
                uint8 cellType = cell & 0x03;
                if (cellType == 0) continue;

                string memory fill = cellType == 1 ? p.textBg : (cellType == 2 ? p.zkBg : p.crownBg);

                out = abi.encodePacked(
                    out,
                    '<rect x="',
                    _u(x * CELL),
                    '" y="',
                    _u(y * CELL),
                    '" width="',
                    _u(CELL),
                    '" height="',
                    _u(CELL),
                    '" fill="',
                    fill,
                    '"/>'
                );
            }
        }
    }

    /// @dev Walls rendered as <line> elements inside a single <g> so the stroke
    ///      attributes are shared once instead of repeated per line.
    ///
    ///      For each cell we draw east and south walls. To match the in-game
    ///      canvas — which closes the outer edges using the toroidal wrap —
    ///      we additionally draw the top edge from row (h-1) south walls and
    ///      the left edge from col (w-1) east walls.
    function _renderWalls(Header memory h, bytes calldata layout, Palette memory p)
        internal
        pure
        returns (bytes memory out)
    {
        uint256 width = uint256(h.width);
        uint256 height = uint256(h.height);

        out = abi.encodePacked('<g stroke="', p.wall, '" stroke-width="2" stroke-linecap="square">');

        for (uint256 y = 0; y < height; y++) {
            for (uint256 x = 0; x < width; x++) {
                uint8 cell = _cellAt(layout, y * width + x);
                if ((cell & 0x08) != 0) {
                    // south wall: bottom edge of cell
                    uint256 y1 = (y + 1) * CELL;
                    out = abi.encodePacked(out, _line(x * CELL, y1, (x + 1) * CELL, y1));
                }
                if ((cell & 0x04) != 0) {
                    // east wall: right edge of cell
                    uint256 x1 = (x + 1) * CELL;
                    out = abi.encodePacked(out, _line(x1, y * CELL, x1, (y + 1) * CELL));
                }
            }
        }

        // Top edge: south wall of bottom-row cell (toroidal wrap).
        for (uint256 x = 0; x < width; x++) {
            uint8 cell = _cellAt(layout, (height - 1) * width + x);
            if ((cell & 0x08) != 0) {
                out = abi.encodePacked(out, _line(x * CELL, 0, (x + 1) * CELL, 0));
            }
        }

        // Left edge: east wall of right-column cell.
        for (uint256 y = 0; y < height; y++) {
            uint8 cell = _cellAt(layout, y * width + (width - 1));
            if ((cell & 0x04) != 0) {
                out = abi.encodePacked(out, _line(0, y * CELL, 0, (y + 1) * CELL));
            }
        }

        out = abi.encodePacked(out, "</g>");
    }

    function _line(uint256 x1, uint256 y1, uint256 x2, uint256 y2)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(
            '<line x1="', _u(x1), '" y1="', _u(y1), '" x2="', _u(x2), '" y2="', _u(y2), '"/>'
        );
    }

    // ---------------------------------------------------------------------
    // Palette (LITE: derived from tokenId; FULL would derive from Poseidon).
    // ---------------------------------------------------------------------

    /// @dev Build an HSL palette deterministically from `seed`. We use HSL
    ///      strings rather than computing RGB so the SVG client does the
    ///      conversion — that's free for us and keeps the bytecode small.
    function _palette(uint256 seed) internal pure returns (Palette memory p) {
        uint256 baseHue = seed % 360;

        // Wall: dark, moderately saturated. Stays legible against any bg.
        p.wall = _hsl(baseHue, 25, 22);

        // Maze background: soft, lightly saturated complement to walls.
        uint256 mazeBgHue = (baseHue + 30) % 360;
        p.mazeBg = _hsl(mazeBgHue, 22, 80);

        // Text bg: vibrant complementary hue — letters jump out against bg.
        p.textBg = _hsl((baseHue + 200) % 360, 80, 60);

        // ZK highlight: triadic offset from text bg.
        p.zkBg = _hsl((baseHue + 200 + 120) % 360, 80, 55);

        // Crown highlight: always gold, regardless of seed (matches frontend).
        p.crownBg = _hsl(48, 85, 55);
    }

    function _hsl(uint256 h, uint256 s, uint256 l) internal pure returns (string memory) {
        return string(abi.encodePacked("hsl(", _u(h), ",", _u(s), "%,", _u(l), "%)"));
    }

    // ---------------------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------------------

    function _u(uint256 v) internal pure returns (string memory) {
        return v.toString();
    }

    /// @dev Short id for display: 0x prefix + first 8 hex chars of the id.
    function _shortId(uint256 tokenId) internal pure returns (string memory) {
        bytes16 hexChars = 0x30313233343536373839616263646566;
        bytes memory out = new bytes(10);
        out[0] = "0";
        out[1] = "x";
        // High 4 bytes (8 hex nibbles) of the 32-byte tokenId.
        for (uint256 i = 0; i < 4; i++) {
            uint8 b = uint8(tokenId >> (248 - i * 8));
            out[2 + i * 2] = hexChars[b >> 4];
            out[2 + i * 2 + 1] = hexChars[b & 0x0F];
        }
        return string(out);
    }
}
