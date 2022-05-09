const { ethers } = require("hardhat")

export async function snapshot(): Promise<string> {
    return ethers.provider.send("evm_snapshot", [])
}

export async function revert(id: string): Promise<boolean> {
    return ethers.provider.send("evm_revert", [id])
}
