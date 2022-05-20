import { task } from "hardhat/config"

task("game", "get game")
    .addParam("id", "id of a necessary game")
    .addParam("address", "contract address")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("TicTacToe", taskArgs.address)

        const res = await contract.gameById(taskArgs.id)
        console.log(res)
    })

task("stats", "get stats by user address")
    .addParam("user", "user address")
    .addParam("address", "contract address")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("TicTacToe", taskArgs.address)

        const res = await contract.statsBy(taskArgs.user)
        console.log(res)
    })

task("win-rate", "get win rate by user address")
    .addParam("user", "user address")
    .addParam("address", "contract address")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("TicTacToe", taskArgs.address)

        const res = await contract.winRateBy(taskArgs.user)
        console.log(res)
    })

task("new", "create new game")
    .addParam("own", "if true - use me as the first player")
    .addParam("address", "contract address")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("TicTacToe", taskArgs.address)

        let tx
        if (taskArgs.own) {
            tx = await contract.newMyGame()
        } else {
            tx = await contract.newGame()
        }

        const rc = await tx.wait()
        const event = rc.events.find((e: any) => e.event === "GameCreated")
        console.log(event.args.gameId.toString())
    })

task("join", "join the game")
    .addParam("id", "id of a necessary game")
    .addParam("address", "contract address")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("TicTacToe", taskArgs.address)

        await contract.join(taskArgs.id)
    })

task("move", "move to the position in the game")
    .addParam("id", "id of a necessary game")
    .addParam("x", "Coordinate X (horizontally, from left to right)")
    .addParam("y", "Coordinate Y (vertically, from top to bottom)")
    .addParam("address", "contract address")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("TicTacToe", taskArgs.address)

        await contract.move(taskArgs.id, taskArgs.x, taskArgs.y)
    })
