import {Chip8} from '/chip8.js';

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

(async () => {
    const game = window.location.search.replace("?", "").toUpperCase() || "TETRIS";
    document.querySelector(".game").textContent = game[0] + game.slice(1, game.length).toLowerCase();
    const chip8 = new Chip8(await fetchGame(game));
})();