import { expect, use } from "chai"
import { ethers, waffle } from "hardhat"
import { revert, snapshot } from "./utils/network"
import { prepareERC20Tokens, prepareMultiSigWallet, prepareSigners, prepareTicTacToe } from "./utils/prepare"
import { duration, increase } from "./utils/time"
import { TypedDataDomain } from "@ethersproject/abstract-signer"

use(waffle.solidity)

describe("TicTacToe contract", function () {
    const plainDec18 = ethers.utils.parseUnits("1", 18)

    let snapshotId: string

    beforeEach(async function () {
        await prepareSigners(this)
        await prepareERC20Tokens(this, this.owner)
        await prepareMultiSigWallet(this, this.owner)

        snapshotId = await snapshot()
    })

    afterEach(async function () {
        await revert(snapshotId)
    })

    describe("stake as ETH", function () {
        const stake = ethers.utils.parseEther("2")
        const tokenAddress = ethers.constants.AddressZero
        const tokenDecimals = 0

        describe("Creating and starting", function () {
            const testData = [
                // Relative way
                {
                    name: "With relative fee",
                    isAbsFee: false,
                    fee: ethers.utils.parseUnits("1", 16), // 1% fee
                    feePerStake: ethers.utils.parseUnits("1", 16).mul(stake).div(plainDec18),
                    amountPerUser: stake.sub(ethers.utils.parseUnits("1", 16).mul(stake).div(plainDec18)),
                },
                // Absolute way
                {
                    name: "With absolute fee",
                    isAbsFee: true,
                    fee: ethers.utils.parseUnits("1", 16),
                    feePerStake: ethers.utils.parseUnits("1", 16),
                    amountPerUser: stake.sub(ethers.utils.parseUnits("1", 16)),
                },
            ]

            testData.forEach((datum) => {
                const { name, isAbsFee, fee, feePerStake, amountPerUser } = datum

                describe(name, function () {
                    beforeEach(async function () {
                        await prepareTicTacToe(this, this.owner, fee, isAbsFee, this.MSW.address)
                    })

                    it("should create empty game", async function () {
                        await expect(this.TTT.connect(this.misha).newGame(stake, tokenAddress, tokenDecimals))
                            .to.emit(this.TTT, "GameCreated")
                            .withArgs(1, this.misha.address, stake, tokenAddress, tokenDecimals)

                        const game = await this.TTT.gameById(1)

                        expect(game.p1).to.equal(ethers.constants.AddressZero)
                        expect(game.p2).to.equal(ethers.constants.AddressZero)
                        expect(game.createdAt).to.not.equal(0)
                        expect(game.turnAt).to.equal(0)
                        expect(game.phase).to.equal(0)
                        expect(game.winner).to.equal(0)
                        expect(game.board).to.deep.equal([
                            [0, 0, 0],
                            [0, 0, 0],
                            [0, 0, 0],
                        ])
                        expect(game.turnNum).to.equal(0)
                        expect(game.tokenAddress).to.equal(tokenAddress)
                        expect(game.tokenDecimals).to.equal(18)
                        expect(game.amount).to.equal(0)
                        expect(game.stake).to.equal(stake)

                        // Check MultiSigWallet
                        const balanceMSW = await ethers.provider.getBalance(this.MSW.address)
                        expect(balanceMSW).to.equal(0)
                    })

                    it("should create own game", async function () {
                        const balanceBefore = await ethers.provider.getBalance(this.misha.address)

                        await expect(
                            this.TTT.connect(this.misha).newMyGame(stake, tokenAddress, tokenDecimals, { value: stake })
                        )
                            .to.emit(this.TTT, "GameCreated")
                            .withArgs(1, this.misha.address, stake, tokenAddress, tokenDecimals)

                        const balanceAfter = await ethers.provider.getBalance(this.misha.address)

                        expect(balanceAfter.add(stake)).to.equal(balanceBefore)

                        const game = await this.TTT.gameById(1)

                        expect(game.p1).to.equal(this.misha.address)
                        expect(game.p2).to.equal(ethers.constants.AddressZero)
                        expect(game.createdAt).to.not.equal(0)
                        expect(game.turnAt).to.equal(0)
                        expect(game.phase).to.equal(0)
                        expect(game.winner).to.equal(0)
                        expect(game.board).to.deep.equal([
                            [0, 0, 0],
                            [0, 0, 0],
                            [0, 0, 0],
                        ])
                        expect(game.turnNum).to.equal(0)
                        expect(game.tokenAddress).to.equal(tokenAddress)
                        expect(game.tokenDecimals).to.equal(18)
                        expect(game.amount).to.equal(amountPerUser)
                        expect(game.stake).to.equal(stake)

                        // Check MultiSigWallet
                        const balanceMSW = await ethers.provider.getBalance(this.MSW.address)
                        expect(balanceMSW).to.equal(feePerStake)
                    })

                    it("should fail creating own game if stake by user is invalid", async function () {
                        const balanceBefore = await ethers.provider.getBalance(this.misha.address)

                        await expect(
                            this.TTT.connect(this.misha).newMyGame(stake, tokenAddress, tokenDecimals, {
                                value: stake.mul(2),
                            })
                        ).to.be.revertedWith("TicTacToe: Invalid ETH for stake")

                        const balanceAfter = await ethers.provider.getBalance(this.misha.address)
                        expect(balanceAfter).to.equal(balanceBefore)

                        // Check MultiSigWallet
                        const balanceMSW = await ethers.provider.getBalance(this.MSW.address)
                        expect(balanceMSW).to.equal(0)
                    })

                    it("should join the game", async function () {
                        const balanceMishaBefore = await ethers.provider.getBalance(this.misha.address)
                        const balanceBobBefore = await ethers.provider.getBalance(this.bob.address)

                        await this.TTT.newGame(stake, tokenAddress, tokenDecimals)

                        await expect(this.TTT.connect(this.misha).join(1, { value: stake }))
                            .to.emit(this.TTT, "PlayerJoinedGame")
                            .withArgs(1, this.misha.address, 1)

                        await expect(this.TTT.connect(this.bob).join(1, { value: stake }))
                            .to.emit(this.TTT, "PlayerJoinedGame")
                            .withArgs(1, this.bob.address, 2)

                        const balanceMishaAfter = await ethers.provider.getBalance(this.misha.address)
                        const balanceBobAfter = await ethers.provider.getBalance(this.bob.address)

                        expect(balanceMishaAfter.add(stake)).to.equal(balanceMishaBefore)
                        expect(balanceBobAfter.add(stake)).to.equal(balanceBobBefore)

                        const game = await this.TTT.gameById(1)
                        expect(game.p1).to.equal(this.misha.address)
                        expect(game.p2).to.equal(this.bob.address)
                        expect(game.phase).to.equal(1)
                        expect(game.amount).to.equal(amountPerUser.mul(2))

                        // Check MultiSigWallet
                        const balanceMSW = await ethers.provider.getBalance(this.MSW.address)
                        expect(balanceMSW).to.equal(feePerStake.mul(2))
                    })

                    it("should fail joining the game if game id is invalid", async function () {
                        const balanceBefore = await ethers.provider.getBalance(this.misha.address)
                        await this.TTT.newGame(stake, tokenAddress, tokenDecimals)
                        await expect(this.TTT.connect(this.misha).join(10, { value: stake })).to.be.revertedWith(
                            "TicTacToe: game does not exists"
                        )

                        const balanceAfter = await ethers.provider.getBalance(this.misha.address)
                        expect(balanceAfter).to.equal(balanceBefore)

                        // Check MultiSigWallet
                        const balanceMSW = await ethers.provider.getBalance(this.MSW.address)
                        expect(balanceMSW).to.equal(0)
                    })

                    it("should fail joining the game if user is already in the game", async function () {
                        await this.TTT.newGame(stake, tokenAddress, tokenDecimals)
                        await this.TTT.connect(this.misha).join(1, { value: stake })

                        const balanceBefore = await ethers.provider.getBalance(this.misha.address)

                        await expect(this.TTT.connect(this.misha).join(1, { value: stake })).to.be.revertedWith(
                            "TicTacToe: you are already in the game"
                        )

                        const balanceAfter = await ethers.provider.getBalance(this.misha.address)
                        expect(balanceAfter).to.equal(balanceBefore)

                        // Check MultiSigWallet
                        const balanceMSW = await ethers.provider.getBalance(this.MSW.address)
                        expect(balanceMSW).to.equal(feePerStake)
                    })

                    it("should fail joining the game if game is full", async function () {
                        const balanceBefore = await ethers.provider.getBalance(this.alice.address)

                        await this.TTT.newGame(stake, tokenAddress, tokenDecimals)
                        await this.TTT.connect(this.misha).join(1, { value: stake })
                        await this.TTT.connect(this.bob).join(1, { value: stake })
                        await expect(this.TTT.connect(this.alice).join(1, { value: stake })).to.be.revertedWith(
                            "TicTacToe: game is full"
                        )

                        const balanceAfter = await ethers.provider.getBalance(this.alice.address)
                        expect(balanceAfter).to.equal(balanceBefore)

                        // Check MultiSigWallet
                        const balanceMSW = await ethers.provider.getBalance(this.MSW.address)
                        expect(balanceMSW).to.equal(feePerStake.mul(2))
                    })

                    it("should fail joining the game if stake by user is invalid", async function () {
                        const balanceBefore = await ethers.provider.getBalance(this.bob.address)

                        await this.TTT.newGame(stake, tokenAddress, tokenDecimals)
                        await this.TTT.connect(this.misha).join(1, { value: stake })
                        await expect(this.TTT.connect(this.bob).join(1, { value: stake.div(2) })).to.be.revertedWith(
                            "TicTacToe: Invalid ETH for stake"
                        )

                        const balanceAfter = await ethers.provider.getBalance(this.bob.address)
                        expect(balanceAfter).to.equal(balanceBefore)

                        // Check MultiSigWallet
                        const balanceMSW = await ethers.provider.getBalance(this.MSW.address)
                        expect(balanceMSW).to.equal(feePerStake)
                    })
                })
            })
        })

        describe("Moving", function () {
            const fee = ethers.utils.parseUnits("1", 16) // 1% fee
            const feePerStake = fee.mul(stake).div(plainDec18)
            const amountPerUser = stake.sub(feePerStake)

            beforeEach(async function () {
                await prepareTicTacToe(this, this.owner, fee, false, this.MSW.address)

                await this.TTT.newGame(stake, tokenAddress, tokenDecimals)
                await this.TTT.connect(this.misha).join(1, { value: stake })
                await this.TTT.connect(this.bob).join(1, { value: stake })
            })

            it("should make player's move", async function () {
                await expect(this.TTT.connect(this.misha).move(1, 0, 0))
                    .to.emit(this.TTT, "PlayerMove")
                    .withArgs(1, this.misha.address, 0, 0)

                const game = await this.TTT.gameById(1)
                expect(game.phase).to.equal(2)

                await expect(this.TTT.connect(this.bob).move(1, 1, 0))
                    .to.emit(this.TTT, "PlayerMove")
                    .withArgs(1, this.bob.address, 1, 0)
            })

            it("should win game after player's move", async function () {
                const balanceMishaBefore = await ethers.provider.getBalance(this.misha.address)
                const balanceBobBefore = await ethers.provider.getBalance(this.bob.address)

                await this.TTT.connect(this.misha).move(1, 0, 0)
                await this.TTT.connect(this.bob).move(1, 0, 1)
                await this.TTT.connect(this.misha).move(1, 1, 0)
                await this.TTT.connect(this.bob).move(1, 1, 1)

                await expect(this.TTT.connect(this.misha).move(1, 2, 0)).to.emit(this.TTT, "GameOver").withArgs(1, 1)

                const game = await this.TTT.gameById(1)
                expect(game.phase).to.equal(3)
                expect(game.winner).to.equal(1)

                await this.TTT.connect(this.misha).sendPrize(1)

                const balanceMishaAfter = await ethers.provider.getBalance(this.misha.address)
                const balanceBobAfter = await ethers.provider.getBalance(this.bob.address)

                expect(balanceBobAfter).to.equal(balanceBobBefore)
                expect(balanceMishaAfter.sub(amountPerUser.mul(2))).to.equal(balanceMishaBefore)
            })

            it("should win game after turn timeout has expired", async function () {
                const balanceMishaBefore = await ethers.provider.getBalance(this.misha.address)
                const balanceBobBefore = await ethers.provider.getBalance(this.bob.address)

                await this.TTT.connect(this.misha).move(1, 0, 0)

                // Time jump
                await increase(duration.days("2"))

                await expect(this.TTT.connect(this.misha).getWinner(1)).to.emit(this.TTT, "GameOver").withArgs(1, 1)

                const game = await this.TTT.gameById(1)
                expect(game.phase).to.equal(3)
                expect(game.winner).to.equal(1)

                await this.TTT.connect(this.misha).sendPrize(1)

                const balanceMishaAfter = await ethers.provider.getBalance(this.misha.address)
                const balanceBobAfter = await ethers.provider.getBalance(this.bob.address)

                expect(balanceBobAfter).to.equal(balanceBobBefore)
                expect(balanceMishaAfter.sub(amountPerUser.mul(2))).to.equal(balanceMishaBefore)
            })

            it("should draw game after player's move", async function () {
                const balanceMishaBefore = await ethers.provider.getBalance(this.misha.address)
                const balanceBobBefore = await ethers.provider.getBalance(this.bob.address)

                await this.TTT.connect(this.misha).move(1, 0, 0)
                await this.TTT.connect(this.bob).move(1, 1, 0)
                await this.TTT.connect(this.misha).move(1, 2, 0)
                await this.TTT.connect(this.bob).move(1, 1, 1)
                await this.TTT.connect(this.misha).move(1, 1, 2)
                await this.TTT.connect(this.bob).move(1, 0, 2)
                await this.TTT.connect(this.misha).move(1, 0, 1)
                await this.TTT.connect(this.bob).move(1, 2, 2)

                await expect(this.TTT.connect(this.misha).move(1, 2, 1)).to.emit(this.TTT, "GameOver").withArgs(1, 3)

                const game = await this.TTT.gameById(1)
                expect(game.phase).to.equal(3)
                expect(game.winner).to.equal(3)

                await this.TTT.connect(this.misha).sendPrize(1)

                const balanceMishaAfter = await ethers.provider.getBalance(this.misha.address)
                const balanceBobAfter = await ethers.provider.getBalance(this.bob.address)

                expect(balanceBobAfter.sub(amountPerUser)).to.equal(balanceBobBefore)
                expect(balanceMishaAfter.sub(amountPerUser)).to.equal(balanceMishaBefore)
            })

            it("should fail making move if the time for turn is over", async function () {
                await this.TTT.connect(this.misha).move(1, 0, 0)

                // Time jump
                await increase(duration.days("2"))

                await expect(this.TTT.connect(this.bob).move(1, 2, 0)).to.be.revertedWith(
                    "TicTacToe: the time for turn is over"
                )
            })

            it("should fail making move if game id is invalid", async function () {
                await expect(this.TTT.connect(this.misha).move(10, 0, 0)).to.be.revertedWith(
                    "TicTacToe: game does not exists"
                )
            })

            it("should fail making move if game has not started", async function () {
                await this.TTT.newGame(stake, tokenAddress, tokenDecimals)
                await this.TTT.connect(this.misha).join(2, { value: stake })
                await expect(this.TTT.connect(this.misha).move(2, 0, 0)).to.be.revertedWith(
                    "TicTacToe: game has not started yet"
                )
            })

            it("should fail making move if it is not sender's turn", async function () {
                await expect(this.TTT.connect(this.bob).move(1, 0, 0)).to.be.revertedWith(
                    "TicTacToe: there is not your turn"
                )
            })

            it("should fail making move if coordinates off the board", async function () {
                await expect(this.TTT.connect(this.misha).move(1, 10, 0)).to.be.revertedWith(
                    "TicTacToe: coordinates off the board"
                )
                await expect(this.TTT.connect(this.misha).move(1, 0, 10)).to.be.revertedWith(
                    "TicTacToe: coordinates off the board"
                )
                await expect(this.TTT.connect(this.misha).move(1, 10, 10)).to.be.revertedWith(
                    "TicTacToe: coordinates off the board"
                )
            })

            it("should fail making move if cell is already taken", async function () {
                await this.TTT.connect(this.misha).move(1, 0, 0)
                await expect(this.TTT.connect(this.bob).move(1, 0, 0)).to.be.revertedWith(
                    "TicTacToe: cell on the board is already taken"
                )
            })

            it("should fail making move if game has already been finished", async function () {
                await this.TTT.connect(this.misha).move(1, 0, 0)
                await this.TTT.connect(this.bob).move(1, 0, 1)
                await this.TTT.connect(this.misha).move(1, 1, 0)
                await this.TTT.connect(this.bob).move(1, 1, 1)
                await this.TTT.connect(this.misha).move(1, 2, 0)

                await expect(this.TTT.connect(this.bob).move(1, 2, 2)).to.be.revertedWith(
                    "TicTacToe: game has already been finished"
                )
            })
        })
    })

    describe("stake as ERC20 token", function () {
        const stake = ethers.utils.parseUnits("10", 6)
        const tokenAmountPerUser = ethers.utils.parseUnits("10000", 6)
        const tokenDecimals = 6

        let tokenAddress: string

        beforeEach(async function () {
            tokenAddress = this.token1.address

            await this.token1.connect(this.owner).transfer(this.misha.address, tokenAmountPerUser)
            await this.token1.connect(this.owner).transfer(this.bob.address, tokenAmountPerUser)
            await this.token1.connect(this.owner).transfer(this.alice.address, tokenAmountPerUser)
        })

        describe("Creating and starting via ERC20", function () {
            const testData = [
                // Relative way
                {
                    name: "With relative fee",
                    isAbsFee: false,
                    fee: ethers.utils.parseUnits("1", 16), // 1% fee
                    feePerStake: ethers.utils.parseUnits("1", 16).mul(stake).div(plainDec18),
                    amountPerUser: stake.sub(ethers.utils.parseUnits("1", 16).mul(stake).div(plainDec18)),
                },
                // Absolute way
                {
                    name: "With absolute fee",
                    isAbsFee: true,
                    fee: ethers.utils.parseUnits("1", 18),
                    feePerStake: ethers.utils.parseUnits("1", tokenDecimals),
                    amountPerUser: stake.sub(ethers.utils.parseUnits("1", tokenDecimals)),
                },
            ]

            testData.forEach((datum) => {
                const { name, isAbsFee, fee, feePerStake, amountPerUser } = datum

                describe(name, function () {
                    beforeEach(async function () {
                        await prepareTicTacToe(this, this.owner, fee, isAbsFee, this.MSW.address)

                        await this.token1.connect(this.misha).approve(this.TTT.address, stake)
                        await this.token1.connect(this.bob).approve(this.TTT.address, stake)
                        await this.token1.connect(this.alice).approve(this.TTT.address, stake)
                    })

                    it("should create empty game", async function () {
                        await expect(this.TTT.connect(this.misha).newGame(stake, tokenAddress, tokenDecimals))
                            .to.emit(this.TTT, "GameCreated")
                            .withArgs(1, this.misha.address, stake, tokenAddress, tokenDecimals)

                        const game = await this.TTT.gameById(1)

                        expect(game.p1).to.equal(ethers.constants.AddressZero)
                        expect(game.p2).to.equal(ethers.constants.AddressZero)
                        expect(game.createdAt).to.not.equal(0)
                        expect(game.turnAt).to.equal(0)
                        expect(game.phase).to.equal(0)
                        expect(game.winner).to.equal(0)
                        expect(game.board).to.deep.equal([
                            [0, 0, 0],
                            [0, 0, 0],
                            [0, 0, 0],
                        ])
                        expect(game.turnNum).to.equal(0)
                        expect(game.tokenAddress).to.equal(tokenAddress)
                        expect(game.tokenDecimals).to.equal(tokenDecimals)
                        expect(game.amount).to.equal(0)
                        expect(game.stake).to.equal(stake)

                        // Check MultiSigWallet
                        const balanceMSW = await this.token1.balanceOf(this.MSW.address)
                        expect(balanceMSW).to.equal(0)
                    })

                    it("should create own game", async function () {
                        const balanceBefore = await this.token1.balanceOf(this.misha.address)

                        await expect(this.TTT.connect(this.misha).newMyGame(stake, tokenAddress, tokenDecimals))
                            .to.emit(this.TTT, "GameCreated")
                            .withArgs(1, this.misha.address, stake, tokenAddress, tokenDecimals)

                        const balanceAfter = await this.token1.balanceOf(this.misha.address)

                        expect(balanceAfter.add(stake)).to.equal(balanceBefore)

                        const game = await this.TTT.gameById(1)

                        expect(game.p1).to.equal(this.misha.address)
                        expect(game.p2).to.equal(ethers.constants.AddressZero)
                        expect(game.createdAt).to.not.equal(0)
                        expect(game.turnAt).to.equal(0)
                        expect(game.phase).to.equal(0)
                        expect(game.winner).to.equal(0)
                        expect(game.board).to.deep.equal([
                            [0, 0, 0],
                            [0, 0, 0],
                            [0, 0, 0],
                        ])
                        expect(game.turnNum).to.equal(0)
                        expect(game.tokenAddress).to.equal(tokenAddress)
                        expect(game.tokenDecimals).to.equal(tokenDecimals)
                        expect(game.amount).to.equal(amountPerUser)
                        expect(game.stake).to.equal(stake)

                        // Check MultiSigWallet
                        const balanceMSW = await this.token1.balanceOf(this.MSW.address)
                        expect(balanceMSW).to.equal(feePerStake)
                    })

                    it("should fail creating own game if stake by user is invalid", async function () {
                        const balanceBefore = await this.token1.balanceOf(this.misha.address)

                        await this.token1.connect(this.misha).decreaseAllowance(this.TTT.address, stake)

                        await expect(
                            this.TTT.connect(this.misha).newMyGame(stake, tokenAddress, tokenDecimals)
                        ).to.be.revertedWith("TicTacToe: Check the token allowance")

                        const balanceAfter = await this.token1.balanceOf(this.misha.address)
                        expect(balanceAfter).to.equal(balanceBefore)

                        // Check MultiSigWallet
                        const balanceMSW = await this.token1.balanceOf(this.MSW.address)
                        expect(balanceMSW).to.equal(0)
                    })

                    it("should join the game", async function () {
                        const balanceMishaBefore = await this.token1.balanceOf(this.misha.address)
                        const balanceBobBefore = await this.token1.balanceOf(this.bob.address)

                        await this.TTT.newGame(stake, tokenAddress, tokenDecimals)

                        await expect(this.TTT.connect(this.misha).join(1))
                            .to.emit(this.TTT, "PlayerJoinedGame")
                            .withArgs(1, this.misha.address, 1)

                        await expect(this.TTT.connect(this.bob).join(1))
                            .to.emit(this.TTT, "PlayerJoinedGame")
                            .withArgs(1, this.bob.address, 2)

                        const balanceMishaAfter = await this.token1.balanceOf(this.misha.address)
                        const balanceBobAfter = await this.token1.balanceOf(this.bob.address)

                        expect(balanceMishaAfter.add(stake)).to.equal(balanceMishaBefore)
                        expect(balanceBobAfter.add(stake)).to.equal(balanceBobBefore)

                        const game = await this.TTT.gameById(1)
                        expect(game.p1).to.equal(this.misha.address)
                        expect(game.p2).to.equal(this.bob.address)
                        expect(game.phase).to.equal(1)
                        expect(game.amount).to.equal(amountPerUser.mul(2))

                        // Check MultiSigWallet
                        const balanceMSW = await this.token1.balanceOf(this.MSW.address)
                        expect(balanceMSW).to.equal(feePerStake.mul(2))
                    })

                    it("should fail joining the game if game id is invalid", async function () {
                        const balanceBefore = await this.token1.balanceOf(this.misha.address)
                        await this.TTT.newGame(stake, tokenAddress, tokenDecimals)
                        await expect(this.TTT.connect(this.misha).join(10)).to.be.revertedWith(
                            "TicTacToe: game does not exists"
                        )

                        const balanceAfter = await this.token1.balanceOf(this.misha.address)
                        expect(balanceAfter).to.equal(balanceBefore)

                        // Check MultiSigWallet
                        const balanceMSW = await this.token1.balanceOf(this.MSW.address)
                        expect(balanceMSW).to.equal(0)
                    })

                    it("should fail joining the game if user is already in the game", async function () {
                        await this.TTT.newGame(stake, tokenAddress, tokenDecimals)
                        await this.TTT.connect(this.misha).join(1)

                        const balanceBefore = await this.token1.balanceOf(this.misha.address)

                        await expect(this.TTT.connect(this.misha).join(1)).to.be.revertedWith(
                            "TicTacToe: you are already in the game"
                        )

                        const balanceAfter = await this.token1.balanceOf(this.misha.address)
                        expect(balanceAfter).to.equal(balanceBefore)

                        // Check MultiSigWallet
                        const balanceMSW = await this.token1.balanceOf(this.MSW.address)
                        expect(balanceMSW).to.equal(feePerStake)
                    })

                    it("should fail joining the game if game is full", async function () {
                        const balanceBefore = await ethers.provider.getBalance(this.alice.address)

                        await this.TTT.newGame(stake, tokenAddress, tokenDecimals)
                        await this.TTT.connect(this.misha).join(1)
                        await this.TTT.connect(this.bob).join(1)
                        await expect(this.TTT.connect(this.alice).join(1)).to.be.revertedWith("TicTacToe: game is full")

                        const balanceAfter = await ethers.provider.getBalance(this.alice.address)
                        expect(balanceAfter).to.equal(balanceBefore)

                        // Check MultiSigWallet
                        const balanceMSW = await this.token1.balanceOf(this.MSW.address)
                        expect(balanceMSW).to.equal(feePerStake.mul(2))
                    })

                    it("should fail joining the game if stake by user is invalid", async function () {
                        const balanceBefore = await ethers.provider.getBalance(this.bob.address)

                        await this.token1.connect(this.bob).decreaseAllowance(this.TTT.address, stake)

                        await this.TTT.newGame(stake, tokenAddress, tokenDecimals)
                        await this.TTT.connect(this.misha).join(1)
                        await expect(this.TTT.connect(this.bob).join(1)).to.be.revertedWith(
                            "TicTacToe: Check the token allowance"
                        )

                        const balanceAfter = await ethers.provider.getBalance(this.bob.address)
                        expect(balanceAfter).to.equal(balanceBefore)

                        // Check MultiSigWallet
                        const balanceMSW = await this.token1.balanceOf(this.MSW.address)
                        expect(balanceMSW).to.equal(feePerStake)
                    })
                })
            })
        })

        describe("Moving", function () {
            const fee = ethers.utils.parseUnits("1", 18)
            const amountPerUser = stake.sub(ethers.utils.parseUnits("1", tokenDecimals))

            beforeEach(async function () {
                await prepareTicTacToe(this, this.owner, fee, true, this.MSW.address)

                await this.token1.connect(this.misha).approve(this.TTT.address, stake)
                await this.token1.connect(this.bob).approve(this.TTT.address, stake)
                await this.token1.connect(this.alice).approve(this.TTT.address, stake)

                await this.TTT.newGame(stake, tokenAddress, tokenDecimals)
                await this.TTT.connect(this.misha).join(1)
                await this.TTT.connect(this.bob).join(1)
            })

            it("should make player's move", async function () {
                await expect(this.TTT.connect(this.misha).move(1, 0, 0))
                    .to.emit(this.TTT, "PlayerMove")
                    .withArgs(1, this.misha.address, 0, 0)

                const game = await this.TTT.gameById(1)
                expect(game.phase).to.equal(2)

                await expect(this.TTT.connect(this.bob).move(1, 1, 0))
                    .to.emit(this.TTT, "PlayerMove")
                    .withArgs(1, this.bob.address, 1, 0)
            })

            it("should win game after player's move", async function () {
                const balanceMishaBefore = await this.token1.balanceOf(this.misha.address)
                const balanceBobBefore = await this.token1.balanceOf(this.bob.address)

                await this.TTT.connect(this.misha).move(1, 0, 0)
                await this.TTT.connect(this.bob).move(1, 0, 1)
                await this.TTT.connect(this.misha).move(1, 1, 0)
                await this.TTT.connect(this.bob).move(1, 1, 1)

                await expect(this.TTT.connect(this.misha).move(1, 2, 0)).to.emit(this.TTT, "GameOver").withArgs(1, 1)

                const game = await this.TTT.gameById(1)
                expect(game.phase).to.equal(3)
                expect(game.winner).to.equal(1)

                await this.TTT.connect(this.misha).sendPrize(1)

                const balanceMishaAfter = await this.token1.balanceOf(this.misha.address)
                const balanceBobAfter = await this.token1.balanceOf(this.bob.address)

                expect(balanceBobAfter).to.equal(balanceBobBefore)
                expect(balanceMishaAfter.sub(amountPerUser.mul(2))).to.equal(balanceMishaBefore)
            })

            it("should win game after turn timeout has expired", async function () {
                const balanceMishaBefore = await this.token1.balanceOf(this.misha.address)
                const balanceBobBefore = await this.token1.balanceOf(this.bob.address)

                await this.TTT.connect(this.misha).move(1, 0, 0)

                // Time jump
                await increase(duration.days("2"))

                await expect(this.TTT.connect(this.misha).getWinner(1)).to.emit(this.TTT, "GameOver").withArgs(1, 1)

                const game = await this.TTT.gameById(1)
                expect(game.phase).to.equal(3)
                expect(game.winner).to.equal(1)

                await this.TTT.connect(this.misha).sendPrize(1)

                const balanceMishaAfter = await this.token1.balanceOf(this.misha.address)
                const balanceBobAfter = await this.token1.balanceOf(this.bob.address)

                expect(balanceBobAfter).to.equal(balanceBobBefore)
                expect(balanceMishaAfter.sub(amountPerUser.mul(2))).to.equal(balanceMishaBefore)
            })

            it("should draw game after player's move", async function () {
                const balanceMishaBefore = await this.token1.balanceOf(this.misha.address)
                const balanceBobBefore = await this.token1.balanceOf(this.bob.address)

                await this.TTT.connect(this.misha).move(1, 0, 0)
                await this.TTT.connect(this.bob).move(1, 1, 0)
                await this.TTT.connect(this.misha).move(1, 2, 0)
                await this.TTT.connect(this.bob).move(1, 1, 1)
                await this.TTT.connect(this.misha).move(1, 1, 2)
                await this.TTT.connect(this.bob).move(1, 0, 2)
                await this.TTT.connect(this.misha).move(1, 0, 1)
                await this.TTT.connect(this.bob).move(1, 2, 2)

                await expect(this.TTT.connect(this.misha).move(1, 2, 1)).to.emit(this.TTT, "GameOver").withArgs(1, 3)

                const game = await this.TTT.gameById(1)
                expect(game.phase).to.equal(3)
                expect(game.winner).to.equal(3)

                await this.TTT.connect(this.misha).sendPrize(1)

                const balanceMishaAfter = await this.token1.balanceOf(this.misha.address)
                const balanceBobAfter = await this.token1.balanceOf(this.bob.address)

                expect(balanceBobAfter.sub(amountPerUser)).to.equal(balanceBobBefore)
                expect(balanceMishaAfter.sub(amountPerUser)).to.equal(balanceMishaBefore)
            })

            it("should fail making move if the time for turn is over", async function () {
                await this.TTT.connect(this.misha).move(1, 0, 0)

                // Time jump
                await increase(duration.days("2"))

                await expect(this.TTT.connect(this.bob).move(1, 2, 0)).to.be.revertedWith(
                    "TicTacToe: the time for turn is over"
                )
            })

            it("should fail making move if game id is invalid", async function () {
                await expect(this.TTT.connect(this.misha).move(10, 0, 0)).to.be.revertedWith(
                    "TicTacToe: game does not exists"
                )
            })

            it("should fail making move if game has not started", async function () {
                await this.token1.connect(this.misha).increaseAllowance(this.TTT.address, stake)

                await this.TTT.newGame(stake, tokenAddress, tokenDecimals)
                await this.TTT.connect(this.misha).join(2)

                await expect(this.TTT.connect(this.misha).move(2, 0, 0)).to.be.revertedWith(
                    "TicTacToe: game has not started yet"
                )
            })

            it("should fail making move if it is not sender's turn", async function () {
                await expect(this.TTT.connect(this.bob).move(1, 0, 0)).to.be.revertedWith(
                    "TicTacToe: there is not your turn"
                )
            })

            it("should fail making move if coordinates off the board", async function () {
                await expect(this.TTT.connect(this.misha).move(1, 10, 0)).to.be.revertedWith(
                    "TicTacToe: coordinates off the board"
                )
                await expect(this.TTT.connect(this.misha).move(1, 0, 10)).to.be.revertedWith(
                    "TicTacToe: coordinates off the board"
                )
                await expect(this.TTT.connect(this.misha).move(1, 10, 10)).to.be.revertedWith(
                    "TicTacToe: coordinates off the board"
                )
            })

            it("should fail making move if cell is already taken", async function () {
                await this.TTT.connect(this.misha).move(1, 0, 0)
                await expect(this.TTT.connect(this.bob).move(1, 0, 0)).to.be.revertedWith(
                    "TicTacToe: cell on the board is already taken"
                )
            })

            it("should fail making move if game has already been finished", async function () {
                await this.TTT.connect(this.misha).move(1, 0, 0)
                await this.TTT.connect(this.bob).move(1, 0, 1)
                await this.TTT.connect(this.misha).move(1, 1, 0)
                await this.TTT.connect(this.bob).move(1, 1, 1)
                await this.TTT.connect(this.misha).move(1, 2, 0)

                await expect(this.TTT.connect(this.bob).move(1, 2, 2)).to.be.revertedWith(
                    "TicTacToe: game has already been finished"
                )
            })
        })
    })

    describe("Stats", function () {
        const tokenDecimals = 0
        const stake = ethers.utils.parseEther("2")
        const tokenAddress = ethers.constants.AddressZero
        const fee = ethers.utils.parseUnits("1", 16) // 1% fee

        beforeEach(async function () {
            await prepareTicTacToe(this, this.owner, fee, false, this.MSW.address)

            await this.TTT.newGame(stake, tokenAddress, tokenDecimals)
            await this.TTT.connect(this.misha).join(1, { value: stake })
            await this.TTT.connect(this.bob).join(1, { value: stake })
        })

        it("should create stats for users", async function () {
            const stats1 = await this.TTT.statsBy(this.misha.address)
            expect(stats1.gameNum).to.equal(1)
            expect(stats1.drawNum).to.equal(0)
            expect(stats1.winNum).to.equal(0)

            const stats2 = await this.TTT.statsBy(this.bob.address)
            expect(stats2.gameNum).to.equal(1)
            expect(stats2.drawNum).to.equal(0)
            expect(stats2.winNum).to.equal(0)
        })

        it("should update stats when winning game", async function () {
            await this.TTT.connect(this.misha).move(1, 0, 0)
            await this.TTT.connect(this.bob).move(1, 0, 1)
            await this.TTT.connect(this.misha).move(1, 1, 0)
            await this.TTT.connect(this.bob).move(1, 1, 1)
            await this.TTT.connect(this.misha).move(1, 2, 0)

            const stats1 = await this.TTT.statsBy(this.misha.address)
            expect(stats1.gameNum).to.equal(1)
            expect(stats1.drawNum).to.equal(0)
            expect(stats1.winNum).to.equal(1)

            const stats2 = await this.TTT.statsBy(this.bob.address)
            expect(stats2.gameNum).to.equal(1)
            expect(stats2.drawNum).to.equal(0)
            expect(stats2.winNum).to.equal(0)
        })

        it("should update stats when game draw", async function () {
            await this.TTT.connect(this.misha).move(1, 0, 0)
            await this.TTT.connect(this.bob).move(1, 1, 0)
            await this.TTT.connect(this.misha).move(1, 2, 0)
            await this.TTT.connect(this.bob).move(1, 1, 1)
            await this.TTT.connect(this.misha).move(1, 1, 2)
            await this.TTT.connect(this.bob).move(1, 0, 2)
            await this.TTT.connect(this.misha).move(1, 0, 1)
            await this.TTT.connect(this.bob).move(1, 2, 2)
            await this.TTT.connect(this.misha).move(1, 2, 1)

            const stats1 = await this.TTT.statsBy(this.misha.address)
            expect(stats1.gameNum).to.equal(1)
            expect(stats1.drawNum).to.equal(1)
            expect(stats1.winNum).to.equal(0)

            const stats2 = await this.TTT.statsBy(this.bob.address)
            expect(stats2.gameNum).to.equal(1)
            expect(stats2.drawNum).to.equal(1)
            expect(stats2.winNum).to.equal(0)
        })

        it("should get win rate by sender", async function () {
            await this.TTT.connect(this.misha).move(1, 0, 0)
            await this.TTT.connect(this.bob).move(1, 0, 1)
            await this.TTT.connect(this.misha).move(1, 1, 0)
            await this.TTT.connect(this.bob).move(1, 1, 1)
            await this.TTT.connect(this.misha).move(1, 2, 0)

            const winRate = await this.TTT.winRateBy(this.misha.address)

            expect(winRate).to.equal(100)
        })
    })

    describe.only("admin methods", function () {
        const fee = ethers.utils.parseUnits("1", 16) // 1% fee

        let domain: TypedDataDomain

        beforeEach(async function () {
            await prepareTicTacToe(this, this.owner, fee, false, this.MSW.address)
            const { chainId } = await ethers.provider.getNetwork()
            domain = {
                name: "TicTacToe",
                version: "1",
                chainId: chainId,
                verifyingContract: this.TTT.address,
            }
        })

        it("should change wallet address", async function () {
            const walletFactory = await ethers.getContractFactory("MultiSigWallet")

            const MultiSigWallet = await walletFactory.deploy([this.misha.address, this.bob.address], 1)
            await MultiSigWallet.deployed()

            await expect(this.TTT.changeWallet(MultiSigWallet.address))
                .to.emit(this.TTT, "WalletChanged")
                .withArgs(MultiSigWallet.address)
        })

        it("should change fee amount and type with signature", async function () {
            const newFee = ethers.utils.parseUnits("2", 16) // 2% fee
            const newIsAbsFee = true

            const types = {
                changeFee: [
                    { name: "_fee", type: "uint256" },
                    { name: "_isAbsFee", type: "bool" },
                ],
            }
            const value = { _fee: newFee.toString(), _isAbsFee: newIsAbsFee }

            const validSignature = await this.owner._signTypedData(domain, types, value)

            await expect(this.TTT.connect(this.misha).changeFee(newFee, newIsAbsFee, validSignature))
                .to.emit(this.TTT, "FeeChanged")
                .withArgs(newFee, newIsAbsFee)

            const invalidSignature = await this.misha._signTypedData(domain, types, value)

            await expect(
                this.TTT.connect(this.owner).changeFee(newFee, newIsAbsFee, invalidSignature)
            ).to.be.revertedWith("TicTacToe: invalid signer (non-owner)")
        })
    })
})
