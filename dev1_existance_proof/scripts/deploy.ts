import hre from "hardhat";

async function main() {
  console.log("Starting deployment...");

  const connectedNetwork = await hre.network.connect();

  // Getting the deployer client
  const [deployer] = await connectedNetwork.viem.getWalletClients();
  const publicClient = await connectedNetwork.viem.getPublicClient();

  console.log(`Deploying from account: ${deployer.account.address}`);
  const balance = await publicClient.getBalance({ address: deployer.account.address });
  console.log(`Account balance: ${balance} wei`);

  // Helper function to handle slow testnet deployments resiliently
  const deployWithExtendedTimeout = async (contractName: string, args: any[] = []) => {
    console.log(`\nDeploying ${contractName}...`);
    const { contract, deploymentTransaction } = await connectedNetwork.viem.sendDeploymentTransaction(contractName, args);
    const hash = deploymentTransaction.hash;
    console.log(`Tx submitted: ${hash}`);
    console.log(`Waiting for confirmation... (polling manually to bypass flaky RPCs)`);
    
    // Custom polling loop
    const startTime = Date.now();
    let receipt;
    while (true) {
      if (Date.now() - startTime > 180_000) {
        throw new Error(`Timeout waiting for ${contractName} deployment.`);
      }
      try {
        receipt = await publicClient.getTransactionReceipt({ hash });
        if (receipt) break;
      } catch (err: any) {
        // Ignore TransactionReceiptNotFoundError or other RPC lookup errors while we wait
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    console.log(`${contractName} deployed to: ${receipt.contractAddress}`);
    return Object.assign(contract, { address: receipt.contractAddress });
  };

  // 1. Deploy SourceRequestRegistry
  const requestRegistry = await deployWithExtendedTimeout("SourceRequestRegistry");

  // 2. Deploy SourceAttestationRegistry
  const attestationRegistry = await deployWithExtendedTimeout("SourceAttestationRegistry", [
    deployer.account.address, // oracleWriter = deployer
  ]);

  console.log("\nDeployment completed successfully!");
  console.log("-----------------------------------------");
  console.log("Save these addresses in your .env or script:");
  console.log(`REQUEST_REGISTRY=${requestRegistry.address}`);
  console.log(`ATTESTATION_REGISTRY=${attestationRegistry.address}`);
  console.log("-----------------------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
