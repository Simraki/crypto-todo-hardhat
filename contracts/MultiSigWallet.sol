// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract MultiSigWallet {
    event Deposit(address indexed sender, uint256 amount, uint256 balance);
    event SubmitTransaction(address indexed owner, uint256 indexed txIndex, address indexed to, uint256 value, bytes data);
    event ConfirmTransaction(address indexed owner, uint256 indexed txIndex);
    event RevokeConfirmation(address indexed owner, uint256 indexed txIndex);
    event ExecuteTransaction(address indexed owner, uint256 indexed txIndex);

    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public numConfirmationsRequired;

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        mapping(address => bool) isConfirmed;
        uint256 numConfirmations;
    }

    Transaction[] public transactions;

    constructor(address[] memory _owners, uint256 _numConfirmationsRequired) {
        require(_owners.length > 0, "MultiSigWallet: owners required");
        require(_numConfirmationsRequired > 0 && _numConfirmationsRequired <= _owners.length, "MultiSigWallet: invalid number of required confirmations");

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];

            require(owner != address(0), "MultiSigWallet: invalid owner");
            require(!isOwner[owner], "MultiSigWallet: owner not unique");

            isOwner[owner] = true;
            owners.push(owner);
        }

        numConfirmationsRequired = _numConfirmationsRequired;
    }

    modifier onlyOwner() {
        require(isOwner[msg.sender], "MultiSigWallet: not owner");
        _;
    }

    modifier txExists(uint256 _txIndex) {
        require(_txIndex < transactions.length, "MultiSigWallet: tx does not exist");
        _;
    }

    modifier notExecuted(uint256 _txIndex) {
        require(!transactions[_txIndex].executed, "MultiSigWallet: tx already executed");
        _;
    }

    modifier notConfirmed(uint256 _txIndex) {
        require(!transactions[_txIndex].isConfirmed[msg.sender], "MultiSigWallet: tx already confirmed");
        _;
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    /// @notice Submit a new transaction
    /// @param _to Recipient's address
    /// @param _value Number of wei
    /// @param _data Complete calldata
    function submitTransaction(
        address _to,
        uint256 _value,
        bytes memory _data
    ) public onlyOwner {
        uint256 txIndex = transactions.length;

        Transaction storage transaction = transactions.push();

        transaction.to = _to;
        transaction.value = _value;
        transaction.data = _data;

        emit SubmitTransaction(msg.sender, txIndex, _to, _value, _data);
    }

    /// @notice Confirm the transaction
    /// @param _txIndex The index of the necessary transaction
    function confirmTransaction(uint256 _txIndex) public onlyOwner txExists(_txIndex) notExecuted(_txIndex) notConfirmed(_txIndex) {
        Transaction storage transaction = transactions[_txIndex];

        transaction.isConfirmed[msg.sender] = true;
        transaction.numConfirmations += 1;

        emit ConfirmTransaction(msg.sender, _txIndex);
    }

    /// @notice Execute the transaction
    /// @param _txIndex The index of the necessary transaction
    function executeTransaction(uint256 _txIndex) public onlyOwner txExists(_txIndex) notExecuted(_txIndex) {
        Transaction storage transaction = transactions[_txIndex];

        require(transaction.numConfirmations >= numConfirmationsRequired, "MultiSigWallet: cannot execute tx");

        transaction.executed = true;

        (bool success, ) = transaction.to.call{value: transaction.value}(transaction.data);
        require(success, "MultiSigWallet: tx failed");

        emit ExecuteTransaction(msg.sender, _txIndex);
    }

    /// @notice Revoke the confirmation
    /// @param _txIndex The index of the necessary transaction
    function revokeConfirmation(uint256 _txIndex) public onlyOwner txExists(_txIndex) notExecuted(_txIndex) {
        Transaction storage transaction = transactions[_txIndex];

        require(transaction.isConfirmed[msg.sender], "MultiSigWallet: tx not confirmed");

        transaction.isConfirmed[msg.sender] = false;
        transaction.numConfirmations -= 1;

        emit RevokeConfirmation(msg.sender, _txIndex);
    }

    /// @notice Get all owners
    /// @return ownerArr Array of owner's addresses
    function getOwners() public view returns (address[] memory ownerArr) {
        return owners;
    }

    /// @notice Get transaction count
    /// @param count Number of transactions
    function getTransactionCount() public view returns (uint256 count) {
        return transactions.length;
    }

    /// @notice Get the transaction
    /// @param _txIndex The index of the necessary transaction
    /// @return to Recipient's address
    /// @return value Number of wei
    /// @return data Complete calldata
    /// @return executed Bool indicating transaction is executed
    /// @return numConfirmations Number of confirmations
    function getTransaction(uint256 _txIndex)
        public
        view
        returns (
            address to,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 numConfirmations
        )
    {
        Transaction storage transaction = transactions[_txIndex];

        return (transaction.to, transaction.value, transaction.data, transaction.executed, transaction.numConfirmations);
    }

    /// @notice Check if transaction is confirmed by owner
    /// @param _txIndex The index of the necessary transaction
    /// @param _owner Owner's address
    /// @return confirmed Bool indicating transaction is confirmed by owner
    function isConfirmed(uint256 _txIndex, address _owner) public view returns (bool confirmed) {
        return transactions[_txIndex].isConfirmed[_owner];
    }
}
