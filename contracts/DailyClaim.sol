// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IndelibleToken} from "./IndelibleToken.sol";

contract DailyClaim is AccessControl {
    IndelibleToken public immutable token;
    uint256 public constant CLAIM_AMOUNT = 3 ether;
    uint256 public constant CLAIM_INTERVAL = 24 hours;

    mapping(address user => uint256 lastClaimTimestamp) private _lastClaimTime;

    error AlreadyClaimed();

    constructor(address tokenAddress, address admin) {
        token = IndelibleToken(tokenAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function claim() external {
        if (block.timestamp < _lastClaimTime[msg.sender] + CLAIM_INTERVAL) {
            revert AlreadyClaimed();
        }

        _lastClaimTime[msg.sender] = block.timestamp;
        token.mint(msg.sender, CLAIM_AMOUNT);
    }

    function lastClaimTime(address user) external view returns (uint256) {
        return _lastClaimTime[user];
    }

    function canClaim(address user) external view returns (bool) {
        return block.timestamp >= _lastClaimTime[user] + CLAIM_INTERVAL;
    }
}
