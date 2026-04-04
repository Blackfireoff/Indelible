// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {IndelibleToken} from "./IndelibleToken.sol";

contract TokenSale is AccessControl {
    IndelibleToken public immutable token;
    AggregatorV3Interface public immutable priceFeed;

    uint256 public constant INDL_PRICE_CENTS = 100;

    constructor(address tokenAddress) {
        token = IndelibleToken(tokenAddress);
        priceFeed = AggregatorV3Interface(0x694AA1769357215DE4FAC081bf1f309aDC325306);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function getEthPrice() public view returns (int256) {
        (, int256 answer,,,) = priceFeed.latestRoundData();
        return answer;
    }

    function getIndlAmount(uint256 ethAmount) public view returns (uint256) {
        int256 ethPrice = getEthPrice();
        return (ethAmount * uint256(ethPrice) * 100) / (1e8 * INDL_PRICE_CENTS);
    }

    function withdrawEth() external onlyRole(DEFAULT_ADMIN_ROLE) {
        payable(msg.sender).transfer(address(this).balance);
    }

    receive() external payable {
        uint256 indlAmount = getIndlAmount(msg.value);
        require(indlAmount > 0, "Must send ETH");
        token.mint(msg.sender, indlAmount);
    }
}
