// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MazePalette } from "../src/MazePalette.sol";

/// @title MazePaletteTest
/// @notice Golden tests for the codegen'd palette. The structural fixtures
///         here MUST match the TypeScript-side fixtures in
///         frontend/src/lib/__tests__/paletteRecipe.test.ts byte-for-byte.
///         Drift between the two test files indicates the codegen has gone
///         out of sync — exactly what this whole machinery (ma-fy3) is
///         meant to prevent.
contract MazePaletteTest is Test {
    // -----------------------------------------------------------------
    // Format check — ensure on-chain emits the no-space form that the TS
    // side now consumes byte-for-byte.
    // -----------------------------------------------------------------

    function test_HslFormat_NoSpaces_MatchesTsHslString() public pure {
        MazePalette.Palette memory p = MazePalette.palette(0);
        assertEq(p.wall, "hsl(0,25%,22%)");
        assertEq(p.mazeBg, "hsl(30,22%,80%)");
    }

    // -----------------------------------------------------------------
    // Fixture A — seed=12345, baseHue=105. No wraparound.
    // -----------------------------------------------------------------

    function test_Palette_FixtureA_seed12345() public pure {
        MazePalette.Palette memory p = MazePalette.palette(12345);
        assertEq(p.wall, "hsl(105,25%,22%)");
        assertEq(p.mazeBg, "hsl(135,22%,80%)");
        assertEq(p.textBg, "hsl(305,80%,60%)");
        assertEq(p.zkBg, "hsl(65,80%,55%)");
        assertEq(p.crownBg, "hsl(48,85%,55%)");
    }

    // -----------------------------------------------------------------
    // Fixture B — seed=180, baseHue=180. textBg AND zkBg wrap around 360.
    // -----------------------------------------------------------------

    function test_Palette_FixtureB_seed180_WrapAround() public pure {
        MazePalette.Palette memory p = MazePalette.palette(180);
        assertEq(p.wall, "hsl(180,25%,22%)");
        assertEq(p.mazeBg, "hsl(210,22%,80%)");
        assertEq(p.textBg, "hsl(20,80%,60%)"); // (180 + 200) mod 360
        assertEq(p.zkBg, "hsl(140,80%,55%)"); // (180 + 320) mod 360
        assertEq(p.crownBg, "hsl(48,85%,55%)");
    }

    // -----------------------------------------------------------------
    // Fixture C — seed=0, baseHue=0. Corner case.
    // -----------------------------------------------------------------

    function test_Palette_FixtureC_seed0() public pure {
        MazePalette.Palette memory p = MazePalette.palette(0);
        assertEq(p.wall, "hsl(0,25%,22%)");
        assertEq(p.mazeBg, "hsl(30,22%,80%)");
        assertEq(p.textBg, "hsl(200,80%,60%)");
        assertEq(p.zkBg, "hsl(320,80%,55%)");
        assertEq(p.crownBg, "hsl(48,85%,55%)");
    }

    // -----------------------------------------------------------------
    // Fixture D — seed=0xabcdef = 11259375, baseHue=15. Sanity check
    // that the same hash interpreted as a uint256 lands on the same
    // baseHue the TS side derives via BigInt(mazeHash) % 360n.
    // -----------------------------------------------------------------

    function test_Palette_FixtureD_seed0xabcdef() public pure {
        MazePalette.Palette memory p = MazePalette.palette(0xabcdef);
        assertEq(p.wall, "hsl(15,25%,22%)");
        assertEq(p.mazeBg, "hsl(45,22%,80%)");
        assertEq(p.textBg, "hsl(215,80%,60%)");
        assertEq(p.zkBg, "hsl(335,80%,55%)");
        assertEq(p.crownBg, "hsl(48,85%,55%)");
    }

    // -----------------------------------------------------------------
    // Fixture E — type(uint256).max. Mirrors the TS 256-bit overflow check.
    // (2^256 - 1) % 360 = 15.
    // -----------------------------------------------------------------

    function test_Palette_FixtureE_uintMax_NoOverflow() public pure {
        MazePalette.Palette memory p = MazePalette.palette(type(uint256).max);
        assertEq(p.wall, "hsl(15,25%,22%)");
        assertEq(p.mazeBg, "hsl(45,22%,80%)");
    }

    // -----------------------------------------------------------------
    // Fuzz — for any seed, baseHue is always within [0, 360). The five
    // structural fields are non-empty strings that start with `hsl(`.
    // -----------------------------------------------------------------

    function testFuzz_PaletteFieldsAreWellFormed(uint256 seed) public pure {
        MazePalette.Palette memory p = MazePalette.palette(seed);
        _assertHslShape(p.wall);
        _assertHslShape(p.mazeBg);
        _assertHslShape(p.textBg);
        _assertHslShape(p.zkBg);
        _assertHslShape(p.crownBg);
    }

    function _assertHslShape(string memory s) internal pure {
        bytes memory b = bytes(s);
        require(b.length > 0, "empty hsl string");
        // Cheap shape check: starts with "hsl(", ends with "%)".
        require(b[0] == "h" && b[1] == "s" && b[2] == "l" && b[3] == "(", "bad prefix");
        require(b[b.length - 2] == "%" && b[b.length - 1] == ")", "bad suffix");
    }
}
