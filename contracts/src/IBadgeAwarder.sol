// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IBadgeAwarder
/// @notice Pluggable badge-awarding strategy for MazeKingNFT
/// @dev Implementations compute the bitfield of badges to OR into a user's stats
///      after a successful proof-verified mint. Future strategies (e.g. ZK
///      letter-trace, leaderboard placement, "Speedy") can be deployed and wired
///      via MazeKingNFT.setBadgeAwarder without redeploying the NFT contract.
interface IBadgeAwarder {
    /// @notice Compute badges to award for a verified solve
    /// @param user The solver
    /// @param mazeHash The maze tokenId (keccak of maze data)
    /// @param moveCount The verified move count for this solve
    /// @return newBadges Bitfield of badges to OR into the user's stats
    function awardBadges(address user, uint256 mazeHash, uint32 moveCount)
        external
        returns (uint32 newBadges);
}
