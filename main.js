import { Chip8 } from '/chip8.js';

/**
 * fetchGame gets game file from server
 */
async function fetchGame(game) {
    console.log("Loading " + game);
    const response = await fetch("games/" + game);
    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);

    return data;
}

// var freq = 4; //hz
// var period = 1 / freq * 1000; //ms

function title(str) {
    return str[0] + str.slice(1, str.length).toLowerCase();
}

(async () => {
    const game = window.location.search.replace("?", "") || "TETRIS";
    document.title += " - " + title(game);
    document.querySelector("h1").textContent += " - " + title(game);
    new Chip8(await fetchGame(game));

    const canvas = document.querySelector("canvas");
    canvas.ondblclick = () => {
        if (!document.fullscreenElement) canvas.requestFullscreen();
        else document.exitFullscreen();
    };

    const gamesSel = document.querySelector("#games");
    gamesSel.onchange = async e => {
        const hints = {
            "15PUZZLE": "",
            "BLINKY": "",
            "BLITZ": "W: drop bomb",
            "BRIX": "Q: left, E: right",
            "CONNECT4": "Q: left, E: right, W: drop",
            "GUESS": "",
            "HIDDEN": "Q: left, E: right, 2: up, S: down, W: select",
            "INVADERS": "Q: left, E: right, W: shoot",
            "KALEID": "Q: left, E: right, 2: up, S: down, W: toggle",
            "MAZE": "",
            "MERLIN": "Q W A S",
            "MISSILE": "",
            "PONG": "Player 1, 1: up, Q: down. Player 2: 4: up, R: down",
            "PONG2": "Player 1, 1: up, Q1: down. Player 2: 4: up, R: down",
            "PUZZLE": "Q: left, E: right, S: up, 2: down",
            "SYZYGY": "",
            "TANK": "Q: left, E: right, S: up, 2: down, W: shoot",
            "TETRIS": "Q: rotate, W: left, E: right, A: down",
            "TICTAC": "",
            "UFO": "",
            "VBRIX": "1: up, Q: down",
            "VERS": "",
            "WIPEOFF": "Q: left, E: right",
        };
        const game = e.srcElement.value;
        document.querySelector(".hints").textContent = hints[game];
        new Chip8(await fetchGame(game));
    };
})();