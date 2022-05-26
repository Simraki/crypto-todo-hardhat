import { HardhatRuntimeEnvironment } from "hardhat/types"

module.exports = async function (hre: HardhatRuntimeEnvironment, walletAddress: string) {
    console.log(`ChainId: ${await hre.getChainId()}`)

    const { deployments, getNamedAccounts } = hre
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    await deploy("TicTacToe", {
        args: ["1" + "0".repeat(18), true, walletAddress],
        from: deployer,
        log: true,
    })
}

module.exports.tags = ["TicTacToe"]
