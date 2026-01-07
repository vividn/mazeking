

Roles
Owner/Admin: owns the contract, can reassign roles, change verifier contract address
Withdrawer: can withdraw funds from the contract
Registrar: can officially assign a string to a particular maze

mapping(uint256 => mapping(address => uint8 )) public stats // mazeId => user address => stats

struct Stats {
  uint16 minMoves;
  uint16 timesSolved;
  uint32 badges;
  uint128 usdcDonated;
}

# Badges???
1. Robot (Perfect)
2. Gold (<x1.05)
3. Silver (<x1.15)
4. Copper (<x1.25)
5. Stone (max possible moves)
6. 1st place?
7. 2nd place?
8. 3rd place?
9. Speedy (solve before registrar)
10. Scribe (all words tiles)
11. Zero (all zk tiles)
12. Left hand?
13. Right hand?
14-15. Up to 3 crowns?


