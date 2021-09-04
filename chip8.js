// @ts-check

let DEBUG = false;
let TIME = false;

class Chip8 {
    constructor(program) {
        this.memory = new Uint8Array(4096);

        /**
         * CHIP-8 has 16 8-bit data registers named V0 to VF. 
         * The VF register doubles as a flag for some instructions;
         * thus, it should be avoided. 
         * In an addition operation, VF is the carry flag,
         * while in subtraction, it is the "no borrow" flag. 
         * In the draw instruction VF is set upon pixel collision.
         */
        this.V = new Uint8Array(16);

        this._I = 0;

        this.stackPointer = 0xEFF;

        // Load characters into memory
        let chars = [
            0xF0, 0x90, 0x90, 0x90, 0xF0,
            0x20, 0x60, 0x20, 0x20, 0x70,
            0xF0, 0x10, 0xF0, 0x80, 0xF0,
            0xF0, 0x10, 0xF0, 0x10, 0xF0,
            0x90, 0x90, 0xF0, 0x10, 0x10,
            0xF0, 0x80, 0xF0, 0x10, 0xF0,
            0xF0, 0x80, 0xF0, 0x90, 0xF0,
            0xF0, 0x10, 0x20, 0x40, 0x40,
            0xF0, 0x90, 0xF0, 0x90, 0xF0,
            0xF0, 0x90, 0xF0, 0x10, 0xF0,
            0xF0, 0x90, 0xF0, 0x90, 0x90,
            0xE0, 0x90, 0xE0, 0x90, 0xE0,
            0xF0, 0x80, 0x80, 0x80, 0xF0,
            0xE0, 0x90, 0x90, 0x90, 0xE0,
            0xF0, 0x80, 0xF0, 0x80, 0xF0,
            0xF0, 0x80, 0xF0, 0x80, 0x80
        ];
        for (let i = 0; i < chars.length; i++) {
            this.memory[i] = chars[i];
        }

        // load the game into memory, starting at address 0x200
        this.programCounter = 0x200;
        for (let i = 0; i < program.length; i++) {
            this.memory[i + this.programCounter] = program[i];
        }

        let audioCtx = new window.AudioContext();
        this.beeper = audioCtx.createOscillator();
        this.beeper.type = 'square';
        this.beeper.frequency.setValueAtTime(440, audioCtx.currentTime); // value in hertz
        this.gainNode = audioCtx.createGain();
        this.beeper.connect(this.gainNode);
        this.gainNode.connect(audioCtx.destination);
        this.beeper.start();

        this.gainNode.gain.value = 0;

        this.delayTimer = 0;
        this.soundTimer = 0;

        // decrement timers at 60hz
        setInterval(() => {
            if (this.delayTimer !== 0) this.delayTimer--;
            if (this.soundTimer !== 0) {
                this.soundTimer--;
                if (!this.gainNode.gain.value) {
                    if (this.beeper.context.state !== "running") {
                        this.beeper.start();
                    }
                    this.gainNode.gain.value = 0.05;
                }
            }
            else if (this.gainNode.gain.value) {
                this.gainNode.gain.value = 0;
            }
        }, 1 / 60 * 1000);

        this.canvas = document.querySelector("canvas");
        this.canvasCtx = this.canvas.getContext("2d");
        this.canvas.width = 64;
        this.canvas.height = 32;

        //qwerty to hex keyboard
        this.keyMap = {
            "1": 0x1,
            "2": 0x2,
            "3": 0x3,
            "4": 0xc,
            "q": 0x4,
            "w": 0x5,
            "e": 0x6,
            "r": 0xd,
            "a": 0x7,
            "s": 0x8,
            "d": 0x9,
            "f": 0xe,
            "z": 0xa,
            "x": 0x0,
            "c": 0xb,
            "v": 0xf,
        };

        this.keys = {};
        document.onkeydown = e => {
            this.keys[this.keyMap[e.key]] = true;
        };
        document.onkeyup = e => {
            delete this.keys[this.keyMap[e.key]];
        };

        // for FX0A
        this.halt = false;

        this.debugMsg = "";

        // 0.35 MHz at 10000 iterations
        // 60 MHz at 1000000000 iterations
        if (TIME) {
            const t0 = performance.now();
            let iterations = 10000;
            for (let i = 0; i < iterations; i++) {
                this.main();
            }
            const timeMs = (performance.now() - t0) / iterations;
            console.log("blocking main loop: " + timeMs + " ms per main");
            console.log((1 / (timeMs / 1000 * 1000000)) + " MHz");
        }
        console.log(this.programCounter);

        this.running = true;

        // draw loop
        this.lastTime = 0;
        this.draw = time => {
            this.updateCanvas();
            this.printRegisters();
            if (DEBUG) console.log(this.debugMsg);
            this.debugMsg = "";

            const framerate = 1 / ((time - this.lastTime) / 1000);

            // console.log("framerate:",framerate);
            this.lastTime = time;

            // 800 instructions per second
            for (let i = 0; i < 800 / framerate; i++) {
                if (!this.halt) this.main();
            }
            if (this.running) window.requestAnimationFrame(this.draw);
        };
        window.requestAnimationFrame(this.draw);
    }

    /**
     * The address register, which is named I, is 16 bits wide and is used with 
     * several opcodes that involve memory operations. 
     */
    set I(val) {
        // limit I to 16bits
        this._I = val & (1 << 16) - 1;
        if (DEBUG) if (val > 0xFFFF) console.warn("I overflow!");
    }
    get I() {
        return this._I;
    }

    /**
     * Main opcode decoder
     */
    main() {
        // main: 1.6ms
        const opcode = (this.memory[this.programCounter] << 8) | this.memory[this.programCounter + 1];
        const x = (opcode & 0x0F00) >> 8;
        const y = (opcode & 0x00F0) >> 4;
        const NNN = opcode & 0x0fff;
        const NN = opcode & 0x00ff;

        const upper = this.memory[this.programCounter];
        const lower = this.memory[this.programCounter + 1];

        if ((upper & 0xF0) === 0x00) {
            if (lower === 0xE0) {
                // 0x00E0 Clear the screen
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}` +
                    `: Clear the screen\n`;

                for (let i = 0xF00; i < this.memory.length; i++) {
                    this.memory[i] = 0;
                }
            }
            else if (lower === 0xEE) {
                // 0x00EE Return from a subroutine
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Return from a subroutine\n`;

                // get old address from stack
                this.programCounter = ((this.memory[this.stackPointer] << 8) | this.memory[this.stackPointer - 1]); // - 2;

                // move stack pointer up
                this.stackPointer += 2;
            }
        }
        else if ((upper & 0xF0) === 0x10) {
            // 0x1NNN Jump to address NNN            
            if (DEBUG) this.debugMsg +=
                `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                `Jump to address ${hexStr(NNN, 4)}\n`;

            this.programCounter = NNN - 2;
        }
        else if ((upper & 0xF0) === 0x20) {
            // 0x2NNN Execute subroutine starting at address NNN
            if (DEBUG) this.debugMsg +=
                `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                `Execute subroutine starting at address ${hexStr(NNN, 4)}\n`;

            // move stack pointer down to empty pos
            this.stackPointer -= 2;

            // save current address on stack
            this.memory[this.stackPointer] = (this.programCounter & 0xff00) >> 8; // high byte
            this.memory[this.stackPointer - 1] = (this.programCounter & 0x00ff); // high byte

            // jump to address NNN
            this.programCounter = NNN - 2;

        }
        else if ((upper & 0xF0) === 0x30) {
            // 0x3XNN Skip the following instruction if the value of register VX equals NN
            if (DEBUG) this.debugMsg +=
                `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                `Skip the following instruction if the value of register ` +
                `V${hexStr(x, 0, false)} (${hexStr(this.V[x], 2)}) equals ${hexStr(NN, 2)}\n`;

            if (this.V[x] === NN) {
                this.programCounter += 2;
            }
        }
        else if ((upper & 0xF0) === 0x40) {
            // 0x4XNN Skip the following instruction if the value of register VX is not equal to NN
            if (DEBUG) this.debugMsg +=
                `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                `Skip the following instruction if the value of register ` +
                `V${hexStr(x, 0, false)} (${hexStr(this.V[x], 2)}) is not equal to ${hexStr(NN, 2)}\n`;

            if (this.V[x] !== NN) {
                this.programCounter += 2;
            }
        }
        else if ((upper & 0xF0) === 0x50) {
            // 0x5XY0 Skip the following instruction if the value of register VX is equal to the value of register VY
            if (DEBUG) this.debugMsg +=
                `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                `Skip the following instruction if the value of register ` +
                `V${hexStr(x, 0, false)} (${hexStr(this.V[x], 2)}) ` +
                `is equal to the value of register V${hexStr(x, 0, false)}\n`;

            if (this.V[x] === this.V[y]) {
                this.programCounter += 2;
            }
        }
        else if ((upper & 0xF0) === 0x60) {
            // 0x6XNN Store number NN in register VX
            this.V[x] = NN;
            if (DEBUG) this.debugMsg +=
                `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                `Store number ${hexStr(NN)} in register V${hexStr(x, 0, false)}\n`;

        }
        else if ((upper & 0xF0) === 0x70) {
            // 0x7XNN Add the value NN to register VX
            this.V[x] += NN;
            if (DEBUG) this.debugMsg +=
                `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                `Add ${hexStr(NN)} to register V${hexStr(x, 0, false)}\n`;

        }

        else if ((upper & 0xF0) === 0x80) {
            if ((lower & 0x0F) === 0x00) {
                // 0x8XY0 Store the value of register VY in register VX
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Store the value of register V${hexStr(y, 0, false)} ` +
                    `in register V${hexStr(x, 0, false)}\n`;

                this.V[x] = this.V[y];
            }
            else if ((lower & 0x0F) === 0x01) {
                // 0x8XY1 Set VX to VX OR VY
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Set V${hexStr(x, 0, false)} to V${hexStr(x, 0, false)} ` +
                    `OR V${hexStr(y, 0, false)}\n`;
                this.V[x] |= this.V[y];
            }
            else if ((lower & 0x0F) === 0x02) {
                // 0x8XY2 Set VX to VX AND VY
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Set V${hexStr(x, 0, false)} to V${hexStr(x, 0, false)} ` +
                    `AND V${hexStr(y, 0, false)}\n`;
                this.V[x] &= this.V[y];
            }
            else if ((lower & 0x0F) === 0x03) {
                // 0x8XY3 Set VX to VX XOR VY
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Set V${hexStr(x, 0, false)} to V${hexStr(x, 0, false)} ` +
                    `XOR V${hexStr(y, 0, false)}\n`;
                this.V[x] ^= this.V[y];
            }
            else if ((lower & 0x0F) === 0x04) {
                // 0x8XY4 Add the value of register VY to register VX
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Add the value of register V${hexStr(y, 0, false)} ` +
                    `to register V${hexStr(x, 0, false)}\n`;

                // Set VF to 01 if a carry occurs
                // Set VF to 00 if a carry does not occur
                if ((this.V[x] + this.V[y]) > 0xFF) {
                    this.V[0xF] = 1;
                }
                else {
                    this.V[0xF] = 0;
                }

                this.V[x] += this.V[y];
            }
            else if ((lower & 0x0F) === 0x05) {
                // 0x8XY5 Subtract the value of register VY from register VX
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Subtract the value of register V${hexStr(y, 0, false)} ` +
                    `from register V${hexStr(x, 0, false)}\n`;

                // Set VF to 00 if a borrow occurs
                // Set VF to 01 if a borrow does not occur
                if (this.V[x] < this.V[y]) {
                    this.V[0xF] = 0;
                }
                else {
                    this.V[0xF] = 1;
                }

                this.V[x] -= this.V[y];
            }
            else if ((lower & 0x0F) === 0x06) {
                // // 0x8XY6 Store the value of register VY shifted right one bit in register VX
                // //        Set register VF to the least significant bit prior to the shift

                // this.V[0xF] = this.V[y] & 1;
                // this.V[x] = this.V[y] >> 1;

                // Stores the least significant bit of VX in VF and then shifts VX to the right by 1.
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    ` Stores the least significant bit of V${hexStr(x, 0, false)} ` +
                    `in VF and then shifts V${hexStr(x, 0, false)} to the right by 1.\n`;

                this.V[0xF] = this.V[y] & 1;
                this.V[x] >>= 1;
            }
            else if ((lower & 0x0F) === 0x07) {
                // 0x8XY7 Set register VX to the value of VY minus VX
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Set register V${hexStr(x, 0, false)} to the value of ` +
                    `V${hexStr(y, 0, false)} minus V${hexStr(x, 0, false)}\n`;

                // // Set VF to 00 if a borrow occurs
                // // Set VF to 01 if a borrow does not occur
                if ((this.V[y] < this.V[x])) {
                    this.V[0xF] = 0;
                }
                else {
                    this.V[0xF] = 1;
                }

                this.V[x] = this.V[y] - this.V[x];
            }
            else if ((lower & 0x0F) === 0x0E) {
                // // 0x8XYE Store the value of register VY shifted left one bit in register VX
                // //        Set register VF to the most significant bit prior to the shift

                // this.V[0xF] = (this.V[y] & 0x80) >> 7;
                // this.V[x] = this.V[y] << 1;

                // 0x8XYE Stores the most significant bit of VX in VF and then shifts VX to the left by 1.
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Stores the most significant bit of V${hexStr(y, 0, false)} ` +
                    `in VF and then shifts V${hexStr(y, 0, false)} to the left by 1\n`;

                this.V[0xF] = (this.V[y] & 0x80) >> 7;
                this.V[x] <<= 1;
            }
        }

        else if ((upper & 0xF0) === 0x90) {
            // 0x9XY0 Skip the following instruction if the value of 
            // register VX is not equal to the value of register VY
            if (DEBUG) this.debugMsg +=
                `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                `Skip the following instruction if the value of register ` +
                `V${hexStr(x, 0, false)} (${hexStr(this.V[x], 2)}) ` +
                `is not equal to the value of register ` +
                `V${hexStr(y, 0, false)} (${hexStr(this.V[y], 2)})\n`;

            if (this.V[x] !== this.V[y]) {
                this.programCounter += 2;
            }
        }
        else if ((upper & 0xF0) === 0xA0) {
            // 0xANNN Store memory address NNN in register I
            if (DEBUG) this.debugMsg +=
                `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                `Store memory address ${hexStr(NNN, 4)} in register I\n`;
            this.I = NNN;
        }
        else if ((upper & 0xF0) === 0xB0) {
            // 0xBNNN Jump to address NNN + V0
            if (DEBUG) this.debugMsg +=
                `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                `Jump to address ${hexStr(NNN, 4)} + ${hexStr(this.V[0], 4)}\n`;

            this.programCounter = NNN + this.V[0] - 2;
        }
        else if ((upper & 0xF0) === 0xC0) {
            // 0xCXNN Set VX to a random number with a mask of NN
            if (DEBUG) this.debugMsg +=
                `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                `Set V${hexStr(x, 0, false)} to a random number with a mask of ${hexStr(NN)}\n`;

            this.V[x] = Math.floor(Math.random() * 0xFF) & NN;
        }
        else if ((upper & 0xF0) === 0xD0) {
            // 0xDXYN Draw a sprite at position VX, VY with N bytes of sprite data starting at the address stored in I
            //        Set VF to 01 if any set pixels are changed to unset, and 00 otherwise

            const N = opcode & 0x000f;
            const startPos = this.V[x] + 64 * this.V[y];
            const byteNr = Math.floor(startPos / 8);
            const bitNr = startPos % 8;

            this.V[0xF] = 0;
            for (let i = 0; i < N; i++) {
                const orgByte = this.memory[0xF00 + byteNr + (i * 64 / 8)];
                const orgByte2 = this.memory[0xF00 + byteNr + (i * 64 / 8) + 1];

                this.memory[0xF00 + byteNr + (i * 64 / 8)] ^= this.memory[this.I + i] >> bitNr;
                this.memory[0xF00 + byteNr + (i * 64 / 8) + 1] ^= this.memory[this.I + i] << 8 - bitNr;

                // Set VF to 01 if any set pixels are changed to unset, and 00 otherwise
                if (((this.memory[0xF00 + byteNr + (i * 64 / 8)] & orgByte) < orgByte) ||
                    ((this.memory[0xF00 + byteNr + (i * 64 / 8) + 1] & orgByte2) < orgByte2)) {
                    this.V[0xF] = 1;
                }
            }

            if (DEBUG) this.debugMsg +=
                `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                `Draw a sprite at position ` +
                `x${this.V[x]} (V${hexStr(x, 0, false)}), ` +
                `y${this.V[y]} (V${hexStr(y, 0, false)}) ` +
                `with ${N} bytes of sprite data starting at the address stored in ` +
                `I (${this.I.toString(2)})\n`;
        }


        else if ((upper & 0xF0) === 0xE0) {
            if (lower === 0x9E) {
                // 0xEX9E Skip the following instruction 
                // if the key corresponding to the hex value 
                // currently stored in register VX is pressed
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Skip the following instruction if the key corresponding to the hex value ` +
                    `currently stored in register VX (${hexStr(this.V[x], 2)}) is pressed\n`;

                if (this.keys[this.V[x]]) {
                    this.programCounter += 2;
                }
            }
            if (lower === 0xA1) {
                // 0xEXA1 Skip the following instruction 
                // if the key corresponding to the hex value 
                // currently stored in register VX is not pressed
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Skip the following instruction if the key corresponding to the hex value ` +
                    `currently stored in register VX (${hexStr(this.V[x], 2)}) is not pressed\n`;

                if (!this.keys[this.V[x]]) {
                    this.programCounter += 2;
                }
            }
        }

        else if ((upper & 0xF0) === 0xF0) {
            // if ((opcode & 0xF0FF) === 0xF007) {
            if (lower === 0x07) {
                // 0xFX07 Store the current value of the delay timer in register VX
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Store the current value of the delay timer in register ` +
                    `V${hexStr(x, 0, false)}\n`;

                this.V[x] = this.delayTimer;
            }
            else if (lower === 0x0A) {
                // 0xFX0A Wait for a keypress and store the result in register VX
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Wait for a keypress and store the result in register ` +
                    `V${hexStr(x, 0, false)}\n`;

                this.halt = true;
                document.onkeypress = e => {
                    this.V[x] = this.keyMap[e.key];
                    this.halt = false;
                };
            }
            else if (lower === 0x15) {
                // 0xFX15 Set the delay timer to the value of register VX
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Set the delay timer to the value of register ` +
                    `V${hexStr(x, 0, false)}\n`;

                this.delayTimer = this.V[x];
            }
            else if (lower === 0x18) {
                // 0xFX18 Set the sound timer to the value of register VX
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Set the sound timer to the value of register ` +
                    `V${hexStr(x, 0, false)} (${hexStr(this.V[x], 2)})\n`;

                this.soundTimer = this.V[x];
            }
            else if (lower === 0x1E) {
                // 0xFX1E Add the value stored in register VX to register I
                // !!! should this sum VX and I or overwrite I with VX? !!!
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Add the value stored in register ` +
                    `V${hexStr(x, 0, false)} to register I\n`;

                this.I += this.V[x];
                // this.I = this.V[x];
            }
            else if (lower === 0x29) {
                // 0xFX29 Set I to the memory address of the sprite data corresponding to 
                //        the hexadecimal digit stored in register VX
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Set I to the memory address of the sprite data corresponding to ` +
                    `the hexadecimal digit stored in register V${hexStr(x, 0, false)}\n`;

                this.I = this.V[x] * 5;
            }
            else if (lower === 0x33) {
                // 0xFX33 Store the binary-coded decimal equivalent of the value 
                //        stored in register VX at addresses I, I+1, and I+2
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Store the binary-coded decimal equivalent of the value stored in register ` +
                    `V${hexStr(x, 0, false)} at addresses I (${hexStr(this.I, 4)}), I+1, and I+2\n`;

                let nr = this.V[x];
                for (let i = 2; i >= 0; i--) {
                    const a = nr % 10;
                    nr -= a;
                    nr /= 10;
                    this.memory[this.I + i] = a;
                }
            }
            else if (lower === 0x55) {
                // 0xFX55 Store the values of registers V0 to VX inclusive in memory 
                //        starting at address I
                //        I is set to I + X + 1 after operation
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Store the values of registers V0 to V${hexStr(x, 0, false)} ` +
                    `inclusive in memory starting at address ${hexStr(this.I, 4)}\n`;

                for (let i = 0; i <= x; i++) {
                    this.memory[this.I + i] = this.V[i];
                }
                this.I += x + 1;
            }
            else if (lower === 0x65) {
                // 0xFX65 Fill registers V0 to VX inclusive with the values 
                //        stored in memory starting at address I
                //        I is set to I + X + 1 after operation
                if (DEBUG) this.debugMsg +=
                    `${hexStr(opcode, 4)} @${hexStr(this.programCounter, 4)}: ` +
                    `Fill registers V0 to V${hexStr(x, 0, false)} inclusive with the ` +
                    `values stored in memory starting at address ${hexStr(this.I, 4)}\n`;

                for (let i = 0; i <= x; i++) {
                    this.V[i] = this.memory[this.I + i];
                }
                this.I += x + 1;
            }
        }
        this.programCounter += 2;
    }

    /**
     * Outputs V and I registers to screen
     */
    printRegisters() {
        const info = document.querySelector(".info");

        info.innerHTML = "PC   I    Stack  V0 V1 V2 V3 V4 V5 V6 V7 V8 V9 VA VB VC VD VE VF  Delay Sound\n";
        info.innerHTML += `${hexStr(this.programCounter, 4, false)} `;
        info.innerHTML += `${hexStr(this.I, 4, false)} `;
        info.innerHTML += `${hexStr(this.stackPointer, 4, false)}   `;
        for (let i = 0; i < this.V.length; i++) {
            info.innerHTML += `${hexStr(this.V[i], 2, false)} `;
        }
        info.innerHTML += ` ${hexStr(this.delayTimer, 2, false)}    `;
        info.innerHTML += `${hexStr(this.soundTimer, 2, false)}     `;
    }

    updateCanvas() {
        let imageData = this.canvasCtx.getImageData(0, 0, 64, 32);
        const data = imageData.data;
        for (let i = 0; i < (32 * 64) / 8; i++) {
            let mask = 128;
            for (let b = 0; b < 8; b++) {
                let dIdx = (i * 8 + b) * 4;
                if (this.memory[i + 0xF00] & mask) {
                    // white
                    data[dIdx] = 255; // red
                    data[dIdx + 1] = 255; // green
                    data[dIdx + 2] = 255; // blue
                    data[dIdx + 3] = 255; // alpha
                }
                else {
                    // black
                    data[dIdx] = 32; // red
                    data[dIdx + 1] = 32; // green
                    data[dIdx + 2] = 32; // blue
                    data[dIdx + 3] = 255; // alpha
                }
                mask >>= 1;
            }
        }
        this.canvasCtx.putImageData(imageData, 0, 0);
    }
}

/**
 * Returns number as a hex string of a certain length with optional prefix
 */
function hexStr(num, length, prefix) {
    let str = "";
    if (prefix === undefined || prefix === true) str += "0x";
    else if (prefix === false) str = "";
    else str = prefix;
    return str + num
        .toString(16)
        .toUpperCase()
        .padStart(length, "0");
}

export { Chip8 };
