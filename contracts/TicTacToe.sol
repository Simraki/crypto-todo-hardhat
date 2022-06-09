// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";

import "hardhat/console.sol";

import "./MultiSigWallet.sol";

/// @author YeapCool
/// @title A Solidity implementation of Tic-Tac-Toe game (Xs and Os) with stakes AND upgrade ability
contract TicTacToe is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable, EIP712Upgradeable {
    using SafeMathUpgradeable for uint256;
    using ECDSAUpgradeable for bytes32;

    string private constant SIGNATURE_DOMAIN = "TicTacToe";
    string private constant SIGNATURE_VERSION = "1";

    enum Players {
        None,
        P1,
        P2,
        Both
    }
    enum Phase {
        Join,
        P1Turn,
        P2Turn,
        Finished
    }

    struct Game {
        address payable p1;
        address payable p2;
        uint256 createdAt;
        uint256 turnAt;
        Phase phase;
        Players winner;
        Players[3][3] board;
        uint256 turnNum;
        // If it is zero, use ETH
        address tokenAddress;
        // Use when isAbsFee = true
        uint256 tokenDecimals;
        uint256 amount;
        uint256 stake;
    }

    struct Stats {
        uint256 gameNum;
        uint256 drawNum;
        uint256 winNum;
    }

    uint256 decimals;

    mapping(uint256 => Game) private games;
    mapping(address => Stats) private playerStats;

    uint256 private totalGames;
    uint256 turnTimeout;

    uint256 fee;
    bool isAbsFee;

    MultiSigWallet wallet;

    event GameCreated(uint256 indexed gameId, address indexed creator, uint256 stake, address token, uint256 tokenDecimals);
    event PlayerJoinedGame(uint256 indexed gameId, address player, uint8 playerNum);
    event PlayerMove(uint256 indexed gameId, address player, uint8 x, uint8 y);
    event GameOver(uint256 indexed gameId, Players indexed winner);

    event FeeChanged(uint256 fee, bool isAbsFee);
    event WalletChanged(address wallet);

    /// @dev no constructor in upgradable contracts. Instead we have initializers
    /// @param _fee Absolute amount or percentage of a player's stake
    /// @param _isAbsFee Bool indicating fee is a percentage
    /// @param _walletAddress Payable address of MultiSigWallet
    function initialize(
        uint256 _fee,
        bool _isAbsFee,
        address payable _walletAddress
    ) public initializer {
        decimals = 18;
        turnTimeout = 1 days;

        require(_isAbsFee || (!_isAbsFee && _fee <= 10**decimals), "TicTacToe: Invalid Fee");
        require(_walletAddress != address(0), "TicTacToe: Invalid wallet address");
        fee = _fee;
        isAbsFee = _isAbsFee;
        wallet = MultiSigWallet(_walletAddress);

        /// @dev as there is no constructor, we need to initialise another contracts explicitly
        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        __EIP712_init(SIGNATURE_DOMAIN, SIGNATURE_VERSION);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    modifier exists(uint256 _id) {
        require(_id <= totalGames, "TicTacToe: game does not exists");
        _;
    }

    modifier onlyActiveGame(uint256 _id) {
        Game storage game = games[_id];
        require(game.phase != Phase.Join, "TicTacToe: game has not started yet");
        require(game.phase != Phase.Finished, "TicTacToe: game has already been finished");
        _;
    }

    /// @notice Create a new game
    /// @return gameId ID of the new game
    function newGame(
        uint256 stake,
        address tokenAddress,
        uint256 tokenDecimals
    ) external returns (uint256 gameId) {
        totalGames++;
        uint256 id = totalGames;

        Game memory game;
        game.createdAt = block.timestamp;
        game.stake = stake;
        game.tokenAddress = tokenAddress;
        game.tokenDecimals = tokenAddress == address(0) ? 18 : tokenDecimals;
        games[id] = game;

        emit GameCreated(id, msg.sender, stake, tokenAddress, tokenDecimals);
        return id;
    }

    /// @notice Create a new game with sender as the first player
    /// @return gameId ID of the new game
    function newMyGame(
        uint256 stake,
        address tokenAddress,
        uint256 tokenDecimals
    ) external payable returns (uint256 gameId) {
        totalGames++;
        uint256 id = totalGames;

        Game memory game;
        game.p1 = payable(msg.sender);
        game.createdAt = block.timestamp;
        game.tokenAddress = tokenAddress;
        game.tokenDecimals = tokenAddress == address(0) ? 18 : tokenDecimals;
        game.stake = stake;

        games[id] = game;
        playerStats[msg.sender].gameNum++;

        addStake(games[id]);

        emit GameCreated(id, msg.sender, stake, tokenAddress, tokenDecimals);
        return id;
    }

    /// @notice Join the game
    /// @param _id The id of a necessary game
    function join(uint256 _id) external payable exists(_id) {
        Game storage game = games[_id];

        require(game.phase == Phase.Join, "TicTacToe: game is full");
        require(msg.sender != game.p1, "TicTacToe: you are already in the game");

        address payable player = payable(msg.sender);
        playerStats[msg.sender].gameNum++;

        if (game.p1 == address(0)) {
            game.p1 = player;
            addStake(game);
            emit PlayerJoinedGame(_id, player, 1);
        } else {
            game.p2 = player;

            addStake(game);

            game.phase = Phase.P1Turn;
            game.turnAt = block.timestamp + turnTimeout;

            emit PlayerJoinedGame(_id, player, 2);
        }
    }

    /// @notice Move to cell on the board in the game as player
    /// @param _id The id of a necessary game
    /// @param _x Coordinate X (horizontally, from left to right)
    /// @param _y Coordinate Y (vertically, from top to bottom)
    function move(
        uint256 _id,
        uint8 _x,
        uint8 _y
    ) external exists(_id) onlyActiveGame(_id) {
        require(_x < 3 && _y < 3, "TicTacToe: coordinates off the board");

        Game storage game = games[_id];

        require(msg.sender == getCurrentPlayer(game), "TicTacToe: there is not your turn");
        require(game.board[_x][_y] == Players.None, "TicTacToe: cell on the board is already taken");
        require(game.turnAt > block.timestamp, "TicTacToe: the time for turn is over");

        game.board[_x][_y] = game.phase == Phase.P1Turn ? Players.P1 : Players.P2;
        game.turnAt = block.timestamp + turnTimeout;
        game.turnNum = game.turnNum + 1;
        emit PlayerMove(_id, msg.sender, _x, _y);

        if (game.turnNum >= 5) {
            if (getWinner(_id) != Players.None) {
                return;
            }
        }

        game.phase = game.phase == Phase.P1Turn ? Phase.P2Turn : Phase.P1Turn;
    }

    /// @notice Get a game data
    /// @param _id The id of a necessary game
    /// @return game Game data
    function gameById(uint256 _id) external view exists(_id) returns (Game memory game) {
        return games[_id];
    }

    /// @notice Get a stats data
    /// @param _user The address of a necessary user
    /// @return stats Stats data
    function statsBy(address _user) external view returns (Stats memory stats) {
        return playerStats[_user];
    }

    /// @notice Get a win rate
    /// @param _user The address of a necessary user
    /// @return winRate Percentage of wins
    function winRateBy(address _user) external view returns (uint256 winRate) {
        uint256 win = playerStats[_user].winNum;
        uint256 all = playerStats[_user].gameNum;
        return (100 * win) / all;
    }

    /// @notice Change fee of the contract
    /// @param _fee Absolute amount or percentage of a player's stake
    /// @param _isAbsFee Bool indicating fee is a percentage
    function changeFee(
        uint256 _fee,
        bool _isAbsFee,
        bytes memory _signature
    ) external {
        require(_isAbsFee || (!_isAbsFee && _fee <= 10**decimals), "TicTacToe: Invalid Fee");
        bytes32 msgHash = EIP712Upgradeable._hashTypedDataV4(keccak256(abi.encode(keccak256("changeFee(uint256 _fee,bool _isAbsFee)"), _fee, _isAbsFee)));
        require(recoverAddress(msgHash, _signature) == owner(), "TicTacToe: invalid signer (non-owner)");
        fee = _fee;
        isAbsFee = _isAbsFee;
        emit FeeChanged(_fee, _isAbsFee);
    }

    /// @notice Change fee of the contract
    /// @param _walletAddress Payable address of MultiSigWallet
    function changeWallet(address payable _walletAddress) external onlyOwner {
        require(_walletAddress != address(0), "TicTacToe: Invalid wallet address");
        wallet = MultiSigWallet(_walletAddress);
        emit WalletChanged(_walletAddress);
    }

    /// @notice Send a prize(s) from the game
    /// @param _id The id of a necessary game
    function sendPrize(uint256 _id) external payable nonReentrant exists(_id) {
        Game storage game = games[_id];

        require(game.p1 == msg.sender || game.p2 == msg.sender, "TicTacToe: you are not player of the game");
        require(game.phase == Phase.Finished, "TicTacToe: game is not finished yet");

        uint256 share = game.amount;

        if (game.winner == Players.Both) {
            uint256 share1 = share.div(2);
            uint256 share2 = share.sub(share1);
            if (game.tokenAddress == address(0)) {
                bool sent;
                (sent, ) = game.p1.call{value: share1}("");
                require(sent, "TicTacToe: Failed to send Ether to Player 1");
                (sent, ) = game.p2.call{value: share2}("");
                require(sent, "TicTacToe: Failed to send Ether to Player 2");
            } else {
                IERC20 token = IERC20(game.tokenAddress);
                token.transfer(game.p1, share1);
                token.transfer(game.p2, share2);
            }
        } else if (game.winner == Players.P1) {
            if (game.tokenAddress == address(0)) {
                (bool sent, ) = game.p1.call{value: share}("");
                require(sent, "TicTacToe: Failed to send Ether to Player 1");
            } else {
                IERC20(game.tokenAddress).transfer(game.p1, share);
            }
        } else if (game.winner == Players.P2) {
            if (game.tokenAddress == address(0)) {
                (bool sent, ) = game.p2.call{value: share}("");
                require(sent, "TicTacToe: Failed to send Ether to Player 2");
            } else {
                IERC20(game.tokenAddress).transfer(game.p2, share);
            }
        }
    }

    /// @notice Get winner of the game
    /// @param _id The id of a necessary game
    /// @return winner The player (including None) who won
    function getWinner(uint256 _id) public exists(_id) onlyActiveGame(_id) returns (Players winner) {
        Game storage game = games[_id];

        if (game.turnAt < block.timestamp) {
            if (game.phase == Phase.P1Turn) {
                game.winner = Players.P2;
                playerStats[game.p2].winNum++;
                game.phase = Phase.Finished;
                emit GameOver(_id, game.winner);
                return Players.P2;
            }
            game.winner = Players.P1;
            playerStats[game.p1].winNum++;
            game.phase = Phase.Finished;
            emit GameOver(_id, game.winner);
            return Players.P1;
        }

        Players player = calculateWinner(game.board);

        if (player != Players.None) {
            game.phase = Phase.Finished;
            game.winner = player;
            emit GameOver(_id, game.winner);
        }
        if (player == Players.Both) {
            playerStats[game.p1].drawNum++;
            playerStats[game.p2].drawNum++;
        } else if (player == Players.P1) {
            playerStats[game.p1].winNum++;
        } else if (player == Players.P2) {
            playerStats[game.p2].winNum++;
        }

        return player;
    }

    /// @notice Add a stake to the game
    /// @param _game Necessary game
    function addStake(Game storage _game) private {
        uint256 _fee;
        if (isAbsFee) {
            if (_game.tokenDecimals > decimals) {
                _fee = fee.mul(10**(_game.tokenDecimals - decimals));
            } else {
                _fee = fee.div(10**(decimals - _game.tokenDecimals));
            }
            require(_game.stake >= _fee, "TicTacToe: Not enough for stake payment");
        } else {
            _fee = _game.stake.mul(fee).div(10**decimals);
        }

        if (_game.tokenAddress == address(0)) {
            require(msg.value == _game.stake, "TicTacToe: Invalid ETH for stake");
            // Pay fee
            (bool sent, ) = address(wallet).call{value: _fee}("");
            require(sent, "TicTacToe: Failed to send Ether to Wallet");
        } else {
            IERC20 token = IERC20(_game.tokenAddress);
            uint256 allowance = token.allowance(msg.sender, address(this));
            require(allowance >= _game.stake, "TicTacToe: Check the token allowance");
            token.transferFrom(msg.sender, address(this), _game.stake);
            // Pay fee
            token.transfer(address(wallet), _fee);
        }
        _game.amount = _game.amount.add(_game.stake.sub(_fee));
    }

    /// @notice Get a current player in the turn of the game
    /// @param _game Necessary game
    /// @return player The player who has a turn
    function getCurrentPlayer(Game storage _game) private view returns (address player) {
        if (_game.phase == Phase.P1Turn) {
            return _game.p1;
        }
        if (_game.phase == Phase.P2Turn) {
            return _game.p2;
        }
        return address(0);
    }

    /// @notice Calculate winner via parsing board
    /// @param _board The board of the game
    /// @return winner The player (including None) who won
    function calculateWinner(Players[3][3] memory _board) private pure returns (Players winner) {
        Players player = checkRow(_board);
        if (player != Players.None) {
            return player;
        }

        player = checkColumn(_board);
        if (player != Players.None) {
            return player;
        }

        player = checkDiagonal(_board);
        if (player != Players.None) {
            return player;
        }

        if (isBoardFull(_board)) {
            return Players.Both;
        }

        return Players.None;
    }

    /// @notice Calculate winner in a row via parsing board rows
    /// @param _board The board of the game
    /// @return winner The player (including None) who won in row
    function checkRow(Players[3][3] memory _board) private pure returns (Players winner) {
        for (uint8 x = 0; x < 3; x++) {
            if (_board[x][0] == _board[x][1] && _board[x][1] == _board[x][2] && _board[x][0] != Players.None) {
                return _board[x][0];
            }
        }

        return Players.None;
    }

    /// @notice Calculate winner in a column via parsing board columns
    /// @param _board The board of the game
    /// @return winner The player (including None) who won in column
    function checkColumn(Players[3][3] memory _board) private pure returns (Players winner) {
        for (uint8 y = 0; y < 3; y++) {
            if (_board[0][y] == _board[1][y] && _board[1][y] == _board[2][y] && _board[0][y] != Players.None) {
                return _board[0][y];
            }
        }

        return Players.None;
    }

    /// @notice Calculate winner in a diagonal via parsing board diagonals
    /// @param _board The board of the game
    /// @return winner The player (including None) who won in diagonal
    function checkDiagonal(Players[3][3] memory _board) private pure returns (Players winner) {
        if (_board[0][0] == _board[1][1] && _board[1][1] == _board[2][2] && _board[0][0] != Players.None) {
            return _board[0][0];
        }

        if (_board[0][2] == _board[1][1] && _board[1][1] == _board[2][0] && _board[0][2] != Players.None) {
            return _board[0][2];
        }

        return Players.None;
    }

    /// @notice Check if board is already full
    /// @param _board The board of the game
    /// @return isFull Bool true if the board is full
    function isBoardFull(Players[3][3] memory _board) private pure returns (bool isFull) {
        for (uint8 x = 0; x < 3; x++) {
            for (uint8 y = 0; y < 3; y++) {
                if (_board[x][y] == Players.None) {
                    return false;
                }
            }
        }

        return true;
    }

    /// @notice Recover signer address
    /// @param _msgHash Hashed message
    /// @param _signature Signature
    /// @return recovered Signer address
    function recoverAddress(bytes32 _msgHash, bytes memory _signature) internal pure returns (address recovered) {
        return ECDSAUpgradeable.recover(_msgHash, _signature);
    }
}
