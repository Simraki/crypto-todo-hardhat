import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "ethers"

module.exports = async function (hre: HardhatRuntimeEnvironment, walletAddress: string) {
    console.log(`ChainId: ${await hre.getChainId()}`)

    const { deployments, getNamedAccounts } = hre
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const dec16 = ethers.utils.parseUnits("1", 16) // 1% fee

    const wallet = await deploy("MultiSigWallet", {
        args: [[deployer], 1],
        from: deployer,
        log: true,
    })

    await deploy("TicTacToe", {
        from: deployer,
        log: true,
        proxy: {
            proxyContract: "OpenZeppelinTransparentProxy",
            execute: {
                methodName: "initialize",
                args: [dec16, false, wallet.address],
            },
        },
    })
}

module.exports.tags = ["TicTacToe"]
