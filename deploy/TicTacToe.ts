import { HardhatRuntimeEnvironment } from "hardhat/types"
import { ethers } from "ethers"

module.exports = async function (hre: HardhatRuntimeEnvironment, walletAddress: string) {
    console.log(`ChainId: ${await hre.getChainId()}`)

    const { deployments, getNamedAccounts } = hre
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    const dec16 = ethers.utils.parseUnits("1", 16) // 1% fee

    await deploy("TicTacToe", {
        args: [dec16, false, walletAddress],
        from: deployer,
        log: true,
    })
}

module.exports.tags = ["TicTacToe"]
