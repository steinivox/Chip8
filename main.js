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
    const game = window.location.search.replace("?", "").toUpperCase() || "TETRIS";
    document.title += " - " + title(game);
    document.querySelector("h1").textContent += " - " + title(game);
    const chip8 = new Chip8(await fetchGame(game));

    const canvas = document.querySelector("canvas");
    canvas.ondblclick = () => {
        if (!document.fullscreenElement) canvas.requestFullscreen();
        else document.exitFullscreen();
    };
})();