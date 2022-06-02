import { HardhatRuntimeEnvironment } from "hardhat/types"

module.exports = async function (hre: HardhatRuntimeEnvironment) {
    console.log(`ChainId: ${await hre.getChainId()}`)

    const { deployments, getNamedAccounts } = hre
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    await deploy("MultiSigWallet", {
        args: [[deployer], 1],
        from: deployer,
        log: true,
    })
}

module.exports.tags = ["MultiSigWallet"]
