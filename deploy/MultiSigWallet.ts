import { HardhatRuntimeEnvironment } from "hardhat/types"

module.exports = async function (hre: HardhatRuntimeEnvironment, owners: string[]) {
    console.log(`ChainId: ${await hre.getChainId()}`)

    const { deployments, getNamedAccounts } = hre
    const { deploy } = deployments

    const { deployer } = await getNamedAccounts()

    await deploy("MultiSigWallet", {
        args: [owners, 2],
        from: deployer,
        log: true,
    })
}

module.exports.tags = ["MultiSigWallet"]
