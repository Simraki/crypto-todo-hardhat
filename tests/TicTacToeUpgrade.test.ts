import { expect, use } from "chai"
import { ethers, upgrades, waffle } from "hardhat"
import { prepareMultiSigWallet, prepareSigners } from "./utils/prepare"
import { getImplementationAddress } from "@openzeppelin/upgrades-core"

use(waffle.solidity)

describe("upgrade TicTacToe contract", function () {
    const fee = ethers.utils.parseUnits("1", 16) // 1% fee

    before(async function () {
        await prepareSigners(this)
        await prepareMultiSigWallet(this, this.owner)
    })

    it("upgrade to V2 and test function", async function () {
        const TTT: any = await ethers.getContractFactory("TicTacToe")
        const instance = await upgrades.deployProxy(TTT, [fee, false, this.MSW.address], { kind: "uups" })
        await instance.deployed()

        const implementationAddressBefore = await getImplementationAddress(ethers.provider, instance.address)
        const proxyAddressBefore = instance.address

        expect(instance.getDecimals).to.be.undefined

        const TTTV2: any = await ethers.getContractFactory("TicTacToeV2")
        const upgraded = await upgrades.upgradeProxy(instance.address, TTTV2)
        await upgraded.deployed()

        const implementationAddressAfter = await getImplementationAddress(ethers.provider, upgraded.address)
        const proxyAddressAfter = instance.address

        expect(implementationAddressAfter).not.to.equal(implementationAddressBefore)
        expect(proxyAddressAfter).to.equal(proxyAddressBefore)

        expect(upgraded.getDecimals).not.to.be.undefined
        expect(await upgraded.getDecimals()).to.equal(18)
    })
})
