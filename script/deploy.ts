import { Wallet } from 'zksync-web3'
import * as ethers from 'ethers'
import { Deployer } from '@matterlabs/hardhat-zksync-deploy'

export default async function deploy(args: any) {
    console.log(`Running deploy script for the permit2 contract`);

    const wallet = new Wallet(args.privateKey);

    const hre = require('hardhat')
    const deployer = new Deployer(hre, wallet);
    const artifact = await deployer.loadArtifact("Permit2");

    const deploymentFee = await deployer.estimateDeployFee(artifact, []);

    const parsedFee = ethers.utils.formatEther(deploymentFee.toString());
    console.log(`The deployment is estimated to cost ${parsedFee} ETH`);

    // TODO: create2
    const permit2 = await deployer.deploy(artifact);


    const contractAddress = permit2.address;
    console.log(`${artifact.contractName} was deployed to ${contractAddress}`);
}
