import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ethers } from "hardhat"
import { BigNumber } from "ethers"

export async function prepareSigners(thisObject: Mocha.Context) {
    thisObject.signers = await ethers.getSigners()
    thisObject.owner = thisObject.signers[0]
    thisObject.alice = thisObject.signers[1]
    thisObject.bob = thisObject.signers[2]
    thisObject.carol = thisObject.signers[3]
    thisObject.tema = thisObject.signers[4]
    thisObject.misha = thisObject.signers[5]
}

export async function prepareERC20Tokens(thisObject: Mocha.Context, signer: SignerWithAddress) {
    const tokenFactory = await ethers.getContractFactory("ERC20Mock")

    const token1 = await tokenFactory.connect(signer).deploy("Token1", "TKN1", ethers.utils.parseUnits("100000", 6))
    await token1.deployed()
    thisObject.token1 = token1

    const token2 = await tokenFactory.connect(signer).deploy("Token1", "TKN1", ethers.utils.parseUnits("100000", 6))
    await token2.deployed()
    thisObject.token2 = token2

    const token3 = await tokenFactory.connect(signer).deploy("Token1", "TKN1", ethers.utils.parseUnits("100000", 6))
    await token3.deployed()
    thisObject.token3 = token3
}

export async function prepareCryptoTodo(thisObject: Mocha.Context, signer: SignerWithAddress) {
    const tokenFactory = await ethers.getContractFactory("CryptoTodo")

    const CryptoTodo = await tokenFactory.connect(signer).deploy()
    await CryptoTodo.deployed()
    thisObject.CryptoTodo = CryptoTodo
}

export async function prepareTicTacToeAndMultiSigWallet(
    thisObject: Mocha.Context,
    signer: SignerWithAddress,
    fee: BigNumber,
    isAbsFee: boolean
) {
    const tokenFactory = await ethers.getContractFactory("TicTacToe")
    const walletFactory = await ethers.getContractFactory("MultiSigWallet")

    const MultiSigWallet = await walletFactory
        .connect(signer)
        .deploy([thisObject.signers[0].address, thisObject.signers[1].address], 1)
    await MultiSigWallet.deployed()

    const TicTacToe = await tokenFactory.connect(signer).deploy(fee, isAbsFee, MultiSigWallet.address)
    await TicTacToe.deployed()
    thisObject.MSG = MultiSigWallet
    thisObject.TTT = TicTacToe
}
