// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/// @author YeapCool
/// @title A Solidity implementation of Tic-Tac-Toe game (Xs and Os)
contract TicTacToe {
    enum Players {
        None,
        P1,
        P2
    }
    enum Phase {
        Join,
        P1Turn,
        P2Turn,
        Finished
    }
    enum State {
        None,
        Active,
        P1Wins,
        P2Wins,
        Draw
    }

    struct Game {
        address p1;
        address p2;
        uint256 createdAt;
        uint256 turnAt;
        Phase phase;
        State state;
        Players[3][3] board;
    }

    struct Stats {
        uint256 gameNum;
        uint256 drawNum;
        uint256 winNum;
    }

    mapping(uint256 => Game) private games;
    mapping(address => Stats) private playerStats;

    uint256 private totalGames;
    uint256 turnTimeout = 1 days;

    event GameCreated(uint256 indexed gameId, address indexed creator);
    event PlayerJoinedGame(uint256 indexed gameId, address player, uint8 playerNum);
    event PlayerMove(uint256 indexed gameId, address player, uint8 x, uint8 y);
    event GameOver(uint256 indexed gameId, State indexed state);

    constructor() {}

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
    function newGame() external returns (uint256 gameId) {
        totalGames++;
        uint256 id = totalGames;

        Game memory game;
        game.createdAt = block.timestamp;
        games[id] = game;

        emit GameCreated(id, msg.sender);
        return id;
    }

    /// @notice Create a new game with sender as the first player
    /// @return gameId ID of the new game
    function newMyGame() external returns (uint256 gameId) {
        totalGames++;
        uint256 id = totalGames;

        Game memory game;
        game.p1 = msg.sender;
        game.createdAt = block.timestamp;

        games[id] = game;
        playerStats[msg.sender].gameNum++;

        emit GameCreated(id, msg.sender);
        return id;
    }

    /// @notice Join the game
    /// @param _id The id of a necessary game
    function join(uint256 _id) external exists(_id) {
        Game storage game = games[_id];

        require(game.phase == Phase.Join, "TicTacToe: game is full");
        require(msg.sender != game.p1, "TicTacToe: you are already in the game");

        address player = msg.sender;
        playerStats[player].gameNum++;

        if (game.p1 == address(0)) {
            game.p1 = player;
            emit PlayerJoinedGame(_id, player, 1);
        } else {
            game.p2 = player;
            game.phase = Phase.P1Turn;
            game.state = State.Active;

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

        if (game.turnAt < block.timestamp) {
            if (game.phase == Phase.P1Turn) {
                game.state = State.P2Wins;
                playerStats[game.p2].winNum++;
            } else {
                game.state = State.P1Wins;
                playerStats[game.p1].winNum++;
            }
            game.phase = Phase.Finished;
            emit GameOver(_id, game.state);
            return;
        }

        require(msg.sender == getCurrentPlayer(game), "TicTacToe: there is not your turn");
        require(game.board[_x][_y] == Players.None, "TicTacToe: cell on the board is already taken");

        game.board[_x][_y] = game.phase == Phase.P1Turn ? Players.P1 : Players.P2;
        game.turnAt = block.timestamp + turnTimeout;
        emit PlayerMove(_id, msg.sender, _x, _y);

        Players winner;
        bool draw;
        (winner, draw) = calculateWinner(game.board);
        if (draw) {
            game.phase = Phase.Finished;
            game.state = State.Draw;
            playerStats[game.p1].drawNum++;
            playerStats[game.p2].drawNum++;
            emit GameOver(_id, game.state);
            return;
        }
        if (winner == Players.P1) {
            game.phase = Phase.Finished;
            game.state = State.P1Wins;
            playerStats[game.p1].winNum++;
            emit GameOver(_id, game.state);
            return;
        } else if (winner == Players.P2) {
            game.phase = Phase.Finished;
            game.state = State.P2Wins;
            playerStats[game.p2].winNum++;
            emit GameOver(_id, game.state);
            return;
        }

        game.phase = game.phase == Phase.P1Turn ? Phase.P2Turn : Phase.P1Turn;
    }

    /// @notice Get a game data
    /// @param _id The id of a necessary game
    /// @return game Game data
    function gameById(uint256 _id) external view returns (Game memory game) {
        require(_id <= totalGames, "TicTacToe: game does not exists");
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
    /// @return draw Bool indicating a draw in the game
    function calculateWinner(Players[3][3] memory _board) private pure returns (Players winner, bool draw) {
        Players player = checkRow(_board);
        if (player != Players.None) {
            return (player, false);
        }

        player = checkColumn(_board);
        if (player != Players.None) {
            return (player, false);
        }

        player = checkDiagonal(_board);
        if (player != Players.None) {
            return (player, false);
        }

        if (isBoardFull(_board)) {
            return (Players.None, true);
        }

        return (Players.None, false);
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
}
