import type { HardhatUserConfig } from "hardhat/config";
import toolbox from "@nomicfoundation/hardhat-toolbox-viem";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  // @ts-ignore
  plugins: [toolbox],
  solidity: "0.8.24",
  networks: {
    galileo: {
      type: "http",
      chainType: "l1",
      url: process.env.ZG_RPC_URL || "https://evmrpc-testnet.0g.ai",
      ...(process.env.PRIVATE_KEY ? { accounts: [process.env.PRIVATE_KEY] } : {}),
      chainId: 16602,
    },
  },
};

export default config;
