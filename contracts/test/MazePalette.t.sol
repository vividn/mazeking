// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MazePalette } from "../src/MazePalette.sol";

/// @title MazePaletteTest
/// @notice Golden test for the codegen'd palette library.
///         A matching frontend test (`paletteRecipe.test.ts`) asserts the
///         identical strings — together they catch silent drift in either
///         direction. See ma-fy3 / 2026-05-05 retrospective §11.A.
contract MazePaletteTest is Test {
    /// @dev Fixture seed: 127. Chosen so baseHue == seed (no wrap), making
    ///      the expected strings trivially auditable by hand.
    uint256 internal constant FIXTURE_SEED = 127;

    function test_FixtureSeedProducesExpectedHsl() public pure {
        MazePalette.Palette memory p = MazePalette.palette(FIXTURE_SEED);

        // baseHue = 127. Expected fields below must match
        // frontend/src/lib/__tests__/paletteRecipe.test.ts byte-for-byte.
        assertEq(p.wall, "hsl(127,25%,22%)", "wall");
        assertEq(p.mazeBg, "hsl(157,22%,80%)", "mazeBg"); // 127 + 30
        assertEq(p.textBg, "hsl(327,80%,60%)", "textBg"); // 127 + 200
        assertEq(p.zkBg, "hsl(87,80%,55%)", "zkBg"); // (127 + 320) % 360 = 87
        assertEq(p.crownBg, "hsl(48,85%,55%)", "crownBg"); // constant gold
    }

    function test_BaseHueWrapsAt360() public pure {
        // seed = 720 → baseHue = 0 (720 % 360). Verifies the modulo wrap
        // in palette() matches the TS implementation on overflow boundaries.
        MazePalette.Palette memory p = MazePalette.palette(720);
        assertEq(p.wall, "hsl(0,25%,22%)", "wall@base0");
        assertEq(p.mazeBg, "hsl(30,22%,80%)", "mazeBg@base0");
        assertEq(p.textBg, "hsl(200,80%,60%)", "textBg@base0");
        assertEq(p.zkBg, "hsl(320,80%,55%)", "zkBg@base0");
        assertEq(p.crownBg, "hsl(48,85%,55%)", "crownBg@base0");
    }
}
