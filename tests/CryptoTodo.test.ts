import { expect, use } from "chai"
import { waffle } from "hardhat"
import { revert, snapshot } from "./utils/network"
import { prepareCryptoTodo, prepareSigners } from "./utils/prepare"
import { duration, increase, latest } from "./utils/time"
import { BigNumber } from "ethers"

use(waffle.solidity)

describe("CryptoTodo contract", function () {
    let snapshotId: string

    beforeEach(async function () {
        await prepareSigners(this)
        await prepareCryptoTodo(this, this.bob)

        snapshotId = await snapshot()
    })

    afterEach(async function () {
        await revert(snapshotId)
    })

    describe("Transactions", function () {
        it("should create task", async function () {
            const text = "Test Task"
            const date = Math.floor((Date.now() + 1000 * 60 * 60 * 24) / 1000)

            await expect(this.CryptoTodo.connect(this.misha).create(text, date)).to.emit(this.CryptoTodo, "TaskCreated").withArgs(0, text, date)

            const task = await this.CryptoTodo.connect(this.misha).task(0)

            expect(task["0"].text).to.equal(text)
            expect(task["0"].expDate).to.equal(date)
            expect(task["0"].doneDate).to.equal(0)
            expect(task["0"].owner).to.equal(this.misha.address)
            expect(task["0"].isRemoved).to.be.false
            expect(task["1"]).to.be.false
        })

        it("should fail task creation if task description is empty", async function () {
            const date = Math.floor((Date.now() + 1000 * 60 * 60 * 24) / 1000)
            await expect(this.CryptoTodo.connect(this.misha).create("", date)).to.be.revertedWith("CryptoTodo: the text of task is empty")
        })

        it("should fail task creationif expiration date of task is in the past", async function () {
            await expect(this.CryptoTodo.connect(this.misha).create("Test", 0)).to.be.revertedWith(
                "CryptoTodo: the exp date of task is not in the future"
            )
        })

        it("should toggle task", async function () {
            const text = "Test Task"
            const date = Math.floor((Date.now() + 1000 * 60 * 60 * 24) / 1000)
            await this.CryptoTodo.connect(this.misha).create(text, date)

            await expect(await this.CryptoTodo.connect(this.misha).toggle(0))
                .to.emit(this.CryptoTodo, "TaskToggled")
                .withArgs(0, true)

            let task = await this.CryptoTodo.task(0)
            expect(task["0"].doneDate).to.not.equal(0)

            await expect(await this.CryptoTodo.connect(this.misha).toggle(0))
                .to.emit(this.CryptoTodo, "TaskToggled")
                .withArgs(0, false)

            task = await this.CryptoTodo.task(0)
            expect(task["0"].doneDate).to.equal(0)
        })

        it("should fail task toggle if task id is invalid", async function () {
            await expect(this.CryptoTodo.connect(this.misha).toggle(0)).to.be.revertedWith("CryptoTodo: there is no task with this id")
        })

        it("should fail task toggle if caller is non-owner", async function () {
            const text = "Test Task"
            const date = Math.floor((Date.now() + 1000 * 60 * 60 * 24) / 1000)
            await this.CryptoTodo.connect(this.misha).create(text, date)

            await expect(this.CryptoTodo.connect(this.alice).toggle(0)).to.be.revertedWith("CryptoTodo: caller is not the owner of the task")
        })

        it("should get task with expiration trigger", async function () {
            const text = "Test Task"
            const date = (await latest()).add(duration.days("2"))
            await this.CryptoTodo.connect(this.misha).create(text, date)

            await this.CryptoTodo.connect(this.misha).toggle(0)
            let task = await this.CryptoTodo.task(0)
            expect(task["1"]).to.be.false

            // Time jump
            await increase(duration.days("4"))
            task = await this.CryptoTodo.task(0)
            expect(task["1"]).to.be.false

            // Check task if it is not completed and the exp date is earlier than block.timestamp
            await this.CryptoTodo.connect(this.misha).toggle(0)
            task = await this.CryptoTodo.task(0)
            expect(task["1"]).to.be.true

            // Check task if the done date is later than the exp date
            await this.CryptoTodo.connect(this.misha).toggle(0)
            task = await this.CryptoTodo.task(0)
            expect(task["1"]).to.be.true
        })

        it("should soft remove task", async function () {
            const text = "Test Task"
            const date = Math.floor((Date.now() + 1000 * 60 * 60 * 24) / 1000)
            await this.CryptoTodo.connect(this.misha).create(text, date)

            await expect(this.CryptoTodo.connect(this.misha).softRemove(0)).to.emit(this.CryptoTodo, "TaskRemoved").withArgs(0)

            let task = await this.CryptoTodo.task(0)
            expect(task["0"].isRemoved).to.be.true
        })

        it("should fail removing a task if task id is invalid", async function () {
            await expect(this.CryptoTodo.connect(this.misha).softRemove(0)).to.be.revertedWith("CryptoTodo: there is no task with this id")
        })

        it("should fail removing a task if caller is non-owner", async function () {
            const text = "Test Task"
            const date = Math.floor((Date.now() + 1000 * 60 * 60 * 24) / 1000)
            await this.CryptoTodo.connect(this.misha).create(text, date)

            await expect(this.CryptoTodo.connect(this.alice).softRemove(0)).to.be.revertedWith("CryptoTodo: caller is not the owner of the task")
        })

        it("should fail removing a task if task has already been removed", async function () {
            const text = "Test Task"
            const date = Math.floor((Date.now() + 1000 * 60 * 60 * 24) / 1000)
            await this.CryptoTodo.connect(this.misha).create(text, date)
            await this.CryptoTodo.connect(this.misha).softRemove(0)

            await expect(this.CryptoTodo.connect(this.misha).softRemove(0)).to.be.revertedWith("CryptoTodo: the task has already been removed")
        })

        it("should restore task", async function () {
            const text = "Test Task"
            const date = Math.floor((Date.now() + 1000 * 60 * 60 * 24) / 1000)
            await this.CryptoTodo.connect(this.misha).create(text, date)
            await this.CryptoTodo.connect(this.misha).softRemove(0)

            await expect(this.CryptoTodo.connect(this.misha).restore(0)).to.emit(this.CryptoTodo, "TaskRestored").withArgs(0)

            let task = await this.CryptoTodo.task(0)
            expect(task["0"].isRemoved).to.be.false
        })

        it("should fail restoring a task if task id is invalid", async function () {
            await expect(this.CryptoTodo.connect(this.misha).restore(0)).to.be.revertedWith("CryptoTodo: there is no task with this id")
        })

        it("should fail restoring a task if caller is non-owner", async function () {
            const text = "Test Task"
            const date = Math.floor((Date.now() + 1000 * 60 * 60 * 24) / 1000)
            await this.CryptoTodo.connect(this.misha).create(text, date)
            await this.CryptoTodo.connect(this.misha).softRemove(0)

            await expect(this.CryptoTodo.connect(this.alice).restore(0)).to.be.revertedWith("CryptoTodo: caller is not the owner of the task")
        })

        it("should fail restoring a task if task has not been removed", async function () {
            const text = "Test Task"
            const date = Math.floor((Date.now() + 1000 * 60 * 60 * 24) / 1000)
            await this.CryptoTodo.connect(this.misha).create(text, date)

            await expect(this.CryptoTodo.connect(this.misha).restore(0)).to.be.revertedWith("CryptoTodo: the task was not deleted")
        })

        it("should get personal tasks", async function () {
            const date = (await latest()).add(duration.days("2"))

            let tasks = await this.CryptoTodo.personalTasks(true, true)
            expect(tasks["0"]).to.have.length(0)

            // Create tasks
            await this.CryptoTodo.connect(this.misha).create("Test 0", date)
            await this.CryptoTodo.connect(this.misha).create("Test 1", date)
            await this.CryptoTodo.connect(this.misha).create("Test 2", date)

            // Check tasks of another accounts
            tasks = await this.CryptoTodo.connect(this.alice).personalTasks(true, true)
            expect(tasks["0"]).to.have.length(0)

            // Check tasks
            tasks = await this.CryptoTodo.connect(this.misha).personalTasks(true, true)
            expect(tasks["0"]).to.have.length(3)

            // Toggle and remove some tasks
            await this.CryptoTodo.connect(this.misha).toggle(0)
            await this.CryptoTodo.connect(this.misha).toggle(1)
            await this.CryptoTodo.connect(this.misha).softRemove(1)

            // Check withRemoved = true
            tasks = await this.CryptoTodo.connect(this.misha).personalTasks(true, false)
            expect(tasks["0"]).to.have.length(2)
            expect(tasks["1"].map((bn: BigNumber) => bn.toNumber())).to.eql([0, 2])

            // Time jump
            await increase(duration.days("4"))

            // Check withExpired = false
            tasks = await this.CryptoTodo.connect(this.misha).personalTasks(false, true)
            expect(tasks["0"]).to.have.length(2)
            expect(tasks["1"].map((bn: BigNumber) => bn.toNumber())).to.eql([0, 1])

            // Check withRemoved = false AND withExpired = false
            tasks = await this.CryptoTodo.connect(this.misha).personalTasks(false, false)
            expect(tasks["0"]).to.have.length(1)
            expect(tasks["1"].map((bn: BigNumber) => bn.toNumber())).to.eql([0])
        })

        it("should get percents of on-time completed tasks", async function () {
            const date = (await latest()).add(duration.days("2"))

            let percents = await this.CryptoTodo.onTimeTaskPercents()
            expect(percents["0"]).to.have.length(0)

            // Create tasks
            await this.CryptoTodo.connect(this.misha).create("Test 0", date)
            await this.CryptoTodo.connect(this.misha).create("Test 1", date)
            await this.CryptoTodo.connect(this.misha).create("Test 2", date)
            await this.CryptoTodo.connect(this.alice).create("Test 3", date)
            await this.CryptoTodo.connect(this.alice).create("Test 4", date)
            await this.CryptoTodo.connect(this.alice).create("Test 5", date)

            // Check percents = [0, 0]
            percents = await this.CryptoTodo.onTimeTaskPercents()
            expect(percents["1"].map((bn: BigNumber) => bn.toNumber())).to.eql([0, 0])

            // Toggle tasks where id in [0, 3, 4]
            await this.CryptoTodo.connect(this.misha).toggle(0)
            await this.CryptoTodo.connect(this.alice).toggle(3)
            await this.CryptoTodo.connect(this.alice).toggle(4)

            // Check percents = [33, 66]
            percents = await this.CryptoTodo.onTimeTaskPercents()
            expect(percents["1"].map((bn: BigNumber) => bn.toNumber())).to.eql([33, 66])

            // Toggle all the rest of tasks
            await this.CryptoTodo.connect(this.misha).toggle(1)
            await this.CryptoTodo.connect(this.misha).toggle(2)
            await this.CryptoTodo.connect(this.alice).toggle(5)

            // Check percents = [100, 100]
            percents = await this.CryptoTodo.onTimeTaskPercents()
            expect(percents["1"].map((bn: BigNumber) => bn.toNumber())).to.eql([100, 100])
        })
    })
})
