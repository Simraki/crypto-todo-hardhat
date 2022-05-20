import { expect, use } from "chai"
import { waffle } from "hardhat"
import { revert, snapshot } from "./utils/network"
import { prepareSigners, prepareTicTacToe } from "./utils/prepare"
import { ZERO_ADDRESS } from "./utils/constants"
import { duration, increase } from "./utils/time"

use(waffle.solidity)

describe("TicTacToe contract", function () {
    let snapshotId: string

    beforeEach(async function () {
        await prepareSigners(this)
        await prepareTicTacToe(this, this.bob)

        snapshotId = await snapshot()
    })

    afterEach(async function () {
        await revert(snapshotId)
    })

    describe("Creating and starting", function () {
        it("should create empty game", async function () {
            await expect(this.TTT.connect(this.misha).newGame()).to.emit(this.TTT, "GameCreated").withArgs(1, this.misha.address)

            const game = await this.TTT.gameById(1)

            expect(game.p1).to.equal(ZERO_ADDRESS)
            expect(game.p2).to.equal(ZERO_ADDRESS)
            expect(game.createdAt).to.not.equal(0)
            expect(game.turnAt).to.equal(0)
            expect(game.phase).to.equal(0)
            expect(game.state).to.equal(0)
            expect(game.board).to.deep.equal([
                [0, 0, 0],
                [0, 0, 0],
                [0, 0, 0],
            ])
        })

        it("should create own game", async function () {
            await expect(this.TTT.connect(this.misha).newMyGame()).to.emit(this.TTT, "GameCreated").withArgs(1, this.misha.address)

            const game = await this.TTT.gameById(1)

            expect(game.p1).to.equal(this.misha.address)
            expect(game.p2).to.equal(ZERO_ADDRESS)
            expect(game.createdAt).to.not.equal(0)
            expect(game.turnAt).to.equal(0)
            expect(game.phase).to.equal(0)
            expect(game.state).to.equal(0)
            expect(game.board).to.deep.equal([
                [0, 0, 0],
                [0, 0, 0],
                [0, 0, 0],
            ])
        })

        it("should join the game", async function () {
            await this.TTT.newGame()

            await expect(this.TTT.connect(this.misha).join(1)).to.emit(this.TTT, "PlayerJoinedGame").withArgs(1, this.misha.address, 1)

            await expect(this.TTT.connect(this.bob).join(1)).to.emit(this.TTT, "PlayerJoinedGame").withArgs(1, this.bob.address, 2)

            const game = await this.TTT.gameById(1)

            expect(game.p1).to.equal(this.misha.address)
            expect(game.p2).to.equal(this.bob.address)
            expect(game.phase).to.equal(1)
            expect(game.state).to.equal(1)
        })

        it("should fail joining the game if game id is invalid", async function () {
            await this.TTT.newGame()
            await expect(this.TTT.connect(this.misha).join(10)).to.be.revertedWith("TicTacToe: game does not exists")
        })

        it("should fail joining the game if user is already in the game", async function () {
            await this.TTT.newGame()
            await this.TTT.connect(this.misha).join(1)
            await expect(this.TTT.connect(this.misha).join(1)).to.be.revertedWith("TicTacToe: you are already in the game")
        })

        it("should fail joining the game if game is full", async function () {
            await this.TTT.newGame()
            await this.TTT.connect(this.misha).join(1)
            await this.TTT.connect(this.bob).join(1)
            await expect(this.TTT.connect(this.alice).join(1)).to.be.revertedWith("TicTacToe: game is full")
        })
    })

    describe("Moving", function () {
        beforeEach(async function () {
            await this.TTT.newGame()
            await this.TTT.connect(this.misha).join(1)
            await this.TTT.connect(this.bob).join(1)
        })

        it("should make player's move", async function () {
            await expect(this.TTT.connect(this.misha).move(1, 0, 0)).to.emit(this.TTT, "PlayerMove").withArgs(1, this.misha.address, 0, 0)

            const game = await this.TTT.gameById(1)
            expect(game.phase).to.equal(2)

            await expect(this.TTT.connect(this.bob).move(1, 1, 0)).to.emit(this.TTT, "PlayerMove").withArgs(1, this.bob.address, 1, 0)
        })

        it("should win game after player's move", async function () {
            await this.TTT.connect(this.misha).move(1, 0, 0)
            await this.TTT.connect(this.bob).move(1, 0, 1)
            await this.TTT.connect(this.misha).move(1, 1, 0)
            await this.TTT.connect(this.bob).move(1, 1, 1)

            await expect(this.TTT.connect(this.misha).move(1, 2, 0)).to.emit(this.TTT, "GameOver").withArgs(1, 2)

            const game = await this.TTT.gameById(1)
            expect(game.phase).to.equal(3)
            expect(game.state).to.equal(2)
        })

        it("should win game after turn timeout has expired", async function () {
            await this.TTT.connect(this.misha).move(1, 0, 0)

            // Time jump
            await increase(duration.days("2"))

            await expect(this.TTT.connect(this.misha).move(1, 2, 0)).to.emit(this.TTT, "GameOver").withArgs(1, 2)

            const game = await this.TTT.gameById(1)
            expect(game.phase).to.equal(3)
            expect(game.state).to.equal(2)
        })

        it("should draw game after player's move", async function () {
            await this.TTT.connect(this.misha).move(1, 0, 0)
            await this.TTT.connect(this.bob).move(1, 1, 0)
            await this.TTT.connect(this.misha).move(1, 2, 0)
            await this.TTT.connect(this.bob).move(1, 1, 1)
            await this.TTT.connect(this.misha).move(1, 1, 2)
            await this.TTT.connect(this.bob).move(1, 0, 2)
            await this.TTT.connect(this.misha).move(1, 0, 1)
            await this.TTT.connect(this.bob).move(1, 2, 2)

            await expect(this.TTT.connect(this.misha).move(1, 2, 1)).to.emit(this.TTT, "GameOver").withArgs(1, 4)

            const game = await this.TTT.gameById(1)
            expect(game.phase).to.equal(3)
            expect(game.state).to.equal(4)
        })

        it("should fail making move if game id is invalid", async function () {
            await expect(this.TTT.connect(this.misha).move(10, 0, 0)).to.be.revertedWith("TicTacToe: game does not exists")
        })

        it("should fail making move if game has not stated", async function () {
            await this.TTT.newGame()
            await this.TTT.connect(this.misha).join(2)
            await expect(this.TTT.connect(this.misha).move(2, 0, 0)).to.be.revertedWith("TicTacToe: game has not started yet")
        })

        it("should fail making move if it is not sender's turn", async function () {
            await expect(this.TTT.connect(this.bob).move(1, 0, 0)).to.be.revertedWith("TicTacToe: there is not your turn")
        })

        it("should fail making move if coordinates off the board", async function () {
            await expect(this.TTT.connect(this.misha).move(1, 10, 0)).to.be.revertedWith("TicTacToe: coordinates off the board")
            await expect(this.TTT.connect(this.misha).move(1, 0, 10)).to.be.revertedWith("TicTacToe: coordinates off the board")
            await expect(this.TTT.connect(this.misha).move(1, 10, 10)).to.be.revertedWith("TicTacToe: coordinates off the board")
        })

        it("should fail making move if cell is already taken", async function () {
            await this.TTT.connect(this.misha).move(1, 0, 0)
            await expect(this.TTT.connect(this.bob).move(1, 0, 0)).to.be.revertedWith("TicTacToe: cell on the board is already taken")
        })

        it("should fail making move if game has already been finished", async function () {
            await this.TTT.connect(this.misha).move(1, 0, 0)
            await this.TTT.connect(this.bob).move(1, 0, 1)
            await this.TTT.connect(this.misha).move(1, 1, 0)
            await this.TTT.connect(this.bob).move(1, 1, 1)
            await this.TTT.connect(this.misha).move(1, 2, 0)

            await expect(this.TTT.connect(this.bob).move(1, 2, 2)).to.be.revertedWith("TicTacToe: game has already been finished")
        })
    })

    describe("Stats", function () {
        beforeEach(async function () {
            await this.TTT.newGame()
            await this.TTT.connect(this.misha).join(1)
            await this.TTT.connect(this.bob).join(1)
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
})
