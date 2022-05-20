import { task } from "hardhat/config"

task("task", "get task")
    .addParam("id", "id of a necessary task")
    .addParam("address", "contract address")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("CryptoTodo", taskArgs.address)

        const res = await contract.task(taskArgs.id)
        console.log(res)
    })

task("personal", "get personal task")
    .addParam("expired", "filter for returning expired tasks (true - return)")
    .addParam("removed", "filter for returning soft-removed tasks (true - return)")
    .addParam("address", "contract address")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("CryptoTodo", taskArgs.address)

        const res = await contract.personalTasks(taskArgs.expires, taskArgs.removed)
        console.log(res)
    })

task("percentages", "get percentage of on-time completed tasks for each owner")
    .addParam("address", "contract address")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("CryptoTodo", taskArgs.address)

        const res = await contract.onTimeTaskPercents()
        console.log(res)
    })

task("create", "create task with description and expiration date")
    .addParam("name", "description")
    .addParam("date", "expiration date (timestamp)")
    .addParam("address", "contract address")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("CryptoTodo", taskArgs.address)

        const tx = await contract.create(taskArgs.name, taskArgs.date)
        const rc = await tx.wait()
        const event = rc.events.find((e: any) => e.event === "TaskCreated")
        console.log(event.args.id.toString())
    })

task("toggle", "toggle task")
    .addParam("id", "id of a necessary task")
    .addParam("address", "contract address")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("CryptoTodo", taskArgs.address)

        await contract.toggle(taskArgs.id)
    })

task("remove", "soft remove task")
    .addParam("id", "id of a necessary task")
    .addParam("address", "contract address")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("CryptoTodo", taskArgs.address)

        await contract.softRemove(taskArgs.id)
    })

task("restore", "restore soft-removed task")
    .addParam("id", "id of a necessary task")
    .addParam("address", "contract address")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("CryptoTodo", taskArgs.address)

        await contract.restore(taskArgs.id)
    })
