// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Multicall3
/// @notice Local-only helper. Compiled here so its runtime bytecode can be
///         injected at the canonical Multicall3 address (0xcA11...CA11) on
///         Anvil via `anvil_setCode`. Real chains (Sepolia, mainnet) already
///         have the canonical Multicall3 deployed; do NOT deploy this in
///         production. Implements only the functions viem/wagmi need.
/// @dev Functionally equivalent to mds1/multicall's Multicall3, simplified to
///      drop inline assembly and unused helpers.
contract Multicall3 {
    struct Call {
        address target;
        bytes callData;
    }

    struct Call3 {
        address target;
        bool allowFailure;
        bytes callData;
    }

    struct Call3Value {
        address target;
        bool allowFailure;
        uint256 value;
        bytes callData;
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    function aggregate(Call[] calldata calls)
        external
        payable
        returns (uint256 blockNumber, bytes[] memory returnData)
    {
        blockNumber = block.number;
        uint256 length = calls.length;
        returnData = new bytes[](length);
        for (uint256 i = 0; i < length;) {
            (bool success, bytes memory data) = calls[i].target.call(calls[i].callData);
            require(success, "Multicall3: call failed");
            returnData[i] = data;
            unchecked {
                ++i;
            }
        }
    }

    function tryAggregate(bool requireSuccess, Call[] calldata calls)
        public
        payable
        returns (Result[] memory returnData)
    {
        uint256 length = calls.length;
        returnData = new Result[](length);
        for (uint256 i = 0; i < length;) {
            (bool success, bytes memory data) = calls[i].target.call(calls[i].callData);
            if (requireSuccess) {
                require(success, "Multicall3: call failed");
            }
            returnData[i] = Result({ success: success, returnData: data });
            unchecked {
                ++i;
            }
        }
    }

    function blockAndAggregate(Call[] calldata calls)
        external
        payable
        returns (uint256 blockNumber, bytes32 blockHash, Result[] memory returnData)
    {
        blockNumber = block.number;
        blockHash = blockhash(block.number);
        returnData = tryAggregate(true, calls);
    }

    function tryBlockAndAggregate(bool requireSuccess, Call[] calldata calls)
        external
        payable
        returns (uint256 blockNumber, bytes32 blockHash, Result[] memory returnData)
    {
        blockNumber = block.number;
        blockHash = blockhash(block.number);
        returnData = tryAggregate(requireSuccess, calls);
    }

    function aggregate3(Call3[] calldata calls)
        external
        payable
        returns (Result[] memory returnData)
    {
        uint256 length = calls.length;
        returnData = new Result[](length);
        for (uint256 i = 0; i < length;) {
            Call3 calldata c = calls[i];
            (bool success, bytes memory data) = c.target.call(c.callData);
            if (!success && !c.allowFailure) {
                revert("Multicall3: call failed");
            }
            returnData[i] = Result({ success: success, returnData: data });
            unchecked {
                ++i;
            }
        }
    }

    function aggregate3Value(Call3Value[] calldata calls)
        external
        payable
        returns (Result[] memory returnData)
    {
        uint256 valAccumulator;
        uint256 length = calls.length;
        returnData = new Result[](length);
        for (uint256 i = 0; i < length;) {
            Call3Value calldata c = calls[i];
            unchecked {
                valAccumulator += c.value;
            }
            (bool success, bytes memory data) = c.target.call{ value: c.value }(c.callData);
            if (!success && !c.allowFailure) {
                revert("Multicall3: call failed");
            }
            returnData[i] = Result({ success: success, returnData: data });
            unchecked {
                ++i;
            }
        }
        require(msg.value == valAccumulator, "Multicall3: value mismatch");
    }

    function getBlockNumber() external view returns (uint256) {
        return block.number;
    }

    function getBlockHash(uint256 blockNumber) external view returns (bytes32) {
        return blockhash(blockNumber);
    }

    function getLastBlockHash() external view returns (bytes32) {
        return blockhash(block.number - 1);
    }

    function getCurrentBlockTimestamp() external view returns (uint256) {
        return block.timestamp;
    }

    function getCurrentBlockGasLimit() external view returns (uint256) {
        return block.gaslimit;
    }

    function getCurrentBlockCoinbase() external view returns (address) {
        return block.coinbase;
    }

    function getChainId() external view returns (uint256) {
        return block.chainid;
    }

    function getBasefee() external view returns (uint256) {
        return block.basefee;
    }

    function getEthBalance(address addr) external view returns (uint256) {
        return addr.balance;
    }
}
