// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { MazeKingNFT } from "../src/MazeKingNFT.sol";

contract MazeKingNFTTest is Test {
    MazeKingNFT public nft;
    address public owner = address(1);
    address public user = address(2);
    address public minter = address(3);

    function setUp() public {
        vm.prank(owner);
        nft = new MazeKingNFT("MazeKing", "MAZE", "https://api.mazeking.xyz/token/", owner);
    }

    function test_InitialSetup() public view {
        assertEq(nft.name(), "MazeKing");
        assertEq(nft.symbol(), "MAZE");
        assertTrue(nft.hasRole(nft.OWNER_ROLE(), owner));
        assertTrue(nft.hasRole(nft.WITHDRAWER_ROLE(), owner));
        assertTrue(nft.hasRole(nft.MINTER_ROLE(), owner));
        assertTrue(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), owner));
    }

    function test_Mint() public {
        vm.prank(owner);
        nft.mint(user, 1, 10, "");

        assertEq(nft.balanceOf(user, 1), 10);
        assertEq(nft.totalSupply(1), 10);
    }

    function test_MintBatch() public {
        uint256[] memory ids = new uint256[](2);
        ids[0] = 1;
        ids[1] = 2;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 5;
        amounts[1] = 10;

        vm.prank(owner);
        nft.mintBatch(user, ids, amounts, "");

        assertEq(nft.balanceOf(user, 1), 5);
        assertEq(nft.balanceOf(user, 2), 10);
    }

    function test_RevertMintWithoutRole() public {
        vm.prank(user);
        vm.expectRevert();
        nft.mint(user, 1, 10, "");
    }

    function test_GrantMinterRole() public {
        // Owner has DEFAULT_ADMIN_ROLE, so can grant MINTER_ROLE
        vm.startPrank(owner);
        nft.grantRole(nft.MINTER_ROLE(), minter);
        vm.stopPrank();

        vm.prank(minter);
        nft.mint(user, 1, 5, "");

        assertEq(nft.balanceOf(user, 1), 5);
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

    function test_Burn() public {
        vm.prank(owner);
        nft.mint(user, 1, 10, "");

        vm.prank(user);
        nft.burn(user, 1, 5);

        assertEq(nft.balanceOf(user, 1), 5);
        assertEq(nft.totalSupply(1), 5);
    }
}
