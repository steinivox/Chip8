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
        let chars =
            [0xF0, 0x90, 0x90, 0x90, 0xF0,
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
                0xF0, 0x80, 0xF0, 0x80, 0x80];
        for (let i = 0; i < chars.length; i++) {
            this.memory[i] = chars[i];
        }

        // load the game into memory, starting at address 0x200
        this.address = 0x200;
        for (let i = 0; i < program.length; i++) {
            this.memory[i + this.address] = program[i];
        }

        var audioCtx = new window.AudioContext();
        this.beeper = audioCtx.createOscillator();

        this.beeper.type = 'square';
        this.beeper.frequency.setValueAtTime(440, audioCtx.currentTime); // value in hertz
        this.beeper.connect(audioCtx.destination);
        this.beeping = false;

        this.delayTimer = 0;
        this.soundTimer = 0;

        // decrement timers at 60hz
        setInterval(() => {
            if (this.delayTimer !== 0) this.delayTimer--;
            if (this.soundTimer !== 0) {
                this.soundTimer--;
                if (!this.beeping && this.soundTimer >= 2) {
                    this.beeper.start();
                    this.beeping = true;
                }
            }
            else if (this.beeping) {
                this.beeper.stop();
            }
        }, 1 / 60 * 1000);

        this.canvas = document.querySelector("canvas");
        this.canvasCtx = this.canvas.getContext("2d");
        this.canvas.width = 64;
        this.canvas.height = 32;

        this.keyMap = {
            "1": 0x1, "2": 0x2, "3": 0x3, "4": 0xc,
            "q": 0x4, "w": 0x5, "e": 0x6, "r": 0xd,
            "a": 0x7, "s": 0x8, "d": 0x9, "f": 0xe,
            "z": 0xa, "x": 0x0, "c": 0xb, "v": 0xf,
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

        this.opmap = {
            0x0: {
                0xE0: () => console.log("--opmap: Clear the screen"),
                0xEE: () => console.log("--opmap: Return from a subroutine"),
            },
            0x10: () => console.log("--opmap: 1NNN Jump to address NNN"),
            0x20: () => console.log("--opmap: 2NNN Execute subroutine starting at address NNN"),
            0x30: () => console.log("--opmap: 3XNN Skip the following instruction if the value of register VX equals NN"),
            0x40: () => console.log("--opmap: 4XNN Skip the following instruction if the value of register VX is not equal to NN"),
            0x50: () => console.log("--opmap: 5XY0 Skip the following instruction if the value of register VX is equal to the value of register VY"),
            0x60: () => console.log("--opmap: 6XNN Store number NN in register VX"),
            0x70: () => console.log("--opmap: 7XNN Add the value NN to register VX"),
        
            0x80: {
                0x00: () => console.log("--opmap: 8XY0 Store the value of register VY in register VX"),
                0x01: () => console.log("--opmap: 8XY1 Set VX to VX OR VY"),
                0x02: () => console.log("--opmap: 8XY2 Set VX to VX AND VY"),
                0x03: () => console.log("--opmap: 8XY3 Set VX to VX XOR VY"),
                0x04: () => console.log("--opmap: 8XY4 Add the value of register VY to register VX"),
                0x05: () => console.log("--opmap: 8XY5 Subtract the value of register VY from register VX"),
                0x06: () => console.log("--opmap: 8XY6 Store the value of register VY shifted right one bit in register VX"),
                0x07: () => console.log("--opmap: 8XY7 Set register VX to the value of VY minus VX"),
                0x0E: () => console.log("--opmap: 8XYE Store the value of register VY shifted left one bit in register VX"),
            },
        
            0x90: () => console.log("--opmap: 9XY0 Skip the following instruction if the value of register VX is not equal to the value of register VY"),
            0xA0: () => console.log("--opmap: ANNN Store memory address NNN in register I"),
            0xB0: () => console.log("--opmap: BNNN Jump to address NNN + V0"),
            0xC0: () => console.log("--opmap: CXNN Set VX to a random number with a mask of NN"),
            0xD0: () => console.log("--opmap: DXYN Draw a sprite at position VX, VY with N bytes of sprite data starting at the address stored in I"),
        
            0xE0: {
                0x9E: () => console.log("--opmap: EX9E Skip the following instruction if the key corresponding to the hex value currently stored in register VX is pressed"),
                0xA1: () => console.log("--opmap: EXA1 Skip the following instruction if the key corresponding to the hex value currently stored in register VX is not pressed"),
            },
        
            0xF0: {
                0x07: () => console.log("--opmap: FX07 Store the current value of the delay timer in register VX"),
                0x0A: () => console.log("--opmap: FX0A Wait for a keypress and store the result in register VX"),
                0x15: () => console.log("--opmap: FX15 Set the delay timer to the value of register VX"),
                0x18: () => console.log("--opmap: FX18 Set the sound timer to the value of register VX"),
                0x1E: () => console.log("--opmap: FX1E Add the value stored in register VX to register I"),
                0x29: () => console.log("--opmap: FX29 Set I to the memory address of the sprite data corresponding to the hexadecimal digit stored in register VX"),
                0x33: () => console.log("--opmap: FX33 Store the binary-coded decimal equivalent of the value stored in register VX at addresses I, I+1, and I+2"),
                0x55: () => console.log("--opmap: FX55 Store the values of registers V0 to VX inclusive in memory starting at address I"),
                0x65: () => console.log("--opmap: FX65 Fill registers V0 to VX inclusive with the values stored in memory starting at address I"),
            },
        };

        // main loop
        this.cycle = timestamp => {
            // console.log(1 / ((timestamp - this.lastTime) / 1000), "hz");
            if (TIME) console.time("cycle");

            this.main();
            this.printRegisters();

            this.lastTime = timestamp;
            if (!this.halt) window.requestAnimationFrame(this.cycle);
            // if (!this.halt) setTimeout(this.cycle, period - (performance.now() - t0));

            if (TIME) console.timeEnd("cycle");
        };
        window.requestAnimationFrame(this.cycle);
        // setTimeout(this.cycle, period);
    }

    /**
     * The address register, which is named I, is 16 bits wide and is used with 
     * several opcodes that involve memory operations. 
     */
    set I(val) {
        // limit I to 16bits
        this._I = val & (1 << 16) - 1;
    }
    get I() {
        return this._I;
    }

    /**
     * Main opcode decoder
     */
    main() {
        //Danger!------------------------------------------------

        if (TIME) console.time("map_main");
        let upper = this.memory[this.address];
        let lower = this.memory[this.address + 1];

        (this.opmap[upper & 0xF0][lower] ||
            this.opmap[upper & 0xF0][lower & 0x0F] ||
            this.opmap[upper & 0xF0]
        )();

        if (TIME) console.timeEnd("map_main");

        //-------------------------------------------------------

        // main: 1.6ms
        const opcode = (this.memory[this.address] << 8) | this.memory[this.address + 1];
        if (TIME) console.time("main");
        const x = (opcode & 0x0F00) >> 8;
        const y = (opcode & 0x00F0) >> 4;
        const NNN = opcode & 0x0fff;
        const NN = opcode & 0x00ff;
        if (opcode === 0x00E0) {
            // 0x00E0 Clear the screen
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Clear the screen`);

            for (let i = 0xF00; i < this.memory.length; i++) {
                this.memory[i] = 0;
            }
        }
        else if (opcode === 0x00EE) {
            // 0x00EE Return from a subroutine
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Return from a subroutine`);

            // get old address from stack
            this.address = ((this.memory[this.stackPointer] << 8) | this.memory[this.stackPointer - 1]);// - 2;
            // if (DEBUG) console.debug(`\tRead ${hexStr(this.address + 2, 4)} from stack @ H${hexStr(this.stackPointer, 4)} - L${hexStr(this.stackPointer - 1, 4)}`);

            // move stack pointer up
            this.stackPointer += 2;
        }
        else if ((opcode & 0xF000) === 0x1000) {
            // 0x1NNN Jump to address NNN            
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Jump to address ${hexStr(NNN, 4)}`);
            this.address = NNN - 2;
        }
        else if ((opcode & 0xF000) === 0x2000) {
            // 0x2NNN Execute subroutine starting at address NNN
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Execute subroutine starting at address ${hexStr(NNN, 4)}`);

            // move stack pointer down to empty pos
            this.stackPointer -= 2;

            // save current address on stack
            this.memory[this.stackPointer] = (this.address & 0xff00) >> 8; // high byte
            this.memory[this.stackPointer - 1] = (this.address & 0x00ff); // high byte

            // if (DEBUG) console.debug(`\tStoring ${hexStr(this.address, 4)} on stack @ H${hexStr(this.stackPointer, 4)} - L${hexStr(this.stackPointer - 1, 4)}`);

            // get old address from stack for debugging
            // let readback = ((this.memory[this.stackPointer] << 8) | this.memory[this.stackPointer - 1]);
            // if (DEBUG) console.debug(`\tRead ${hexStr(readback, 4)} back from stack @ H${hexStr(this.stackPointer, 4)} - L${hexStr(this.stackPointer - 1, 4)}`);

            // jump to address NNN
            this.address = NNN - 2;

        }
        else if ((opcode & 0xF000) === 0x3000) {
            // 0x3XNN Skip the following instruction if the value of register VX equals NN
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Skip the following instruction if the value of register V${hexStr(x, 0, false)} equals ${hexStr(NN, 2)}`);

            if (this.V[x] === NN) {
                this.address += 2;
            }
        }
        else if ((opcode & 0xF000) === 0x4000) {
            // 0x4XNN Skip the following instruction if the value of register VX is not equal to NN
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Skip the following instruction if the value of register V${hexStr(x, 0, false)} is not equal to ${hexStr(NN, 2)}`);

            if (this.V[x] !== NN) {
                this.address += 2;
            }
        }
        else if ((opcode & 0xF000) === 0x5000) {
            // 0x5XY0 Skip the following instruction if the value of register VX is equal to the value of register VY
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Skip the following instruction if the value of register V${hexStr(x, 0, false)}  is equal to the value of register V${hexStr(x, 0, false)}`);

            if (this.V[x] === this.V[y]) {
                this.address += 2;
            }
        }
        else if ((opcode & 0xF000) === 0x6000) {
            // 0x6XNN Store number NN in register VX
            const num = opcode & 0x00FF;
            this.V[x] = num;
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Store number ${hexStr(num)} in register V${hexStr(x, 0, false)}`);
        }
        else if ((opcode & 0xF000) === 0x7000) {
            // 0x7XNN Add the value NN to register VX
            const num = opcode & 0x00FF;
            this.V[x] += num;
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Add ${hexStr(num)} to register V${hexStr(x, 0, false)}`);
        }

        else if ((opcode & 0xF00F) === 0x8000) {
            // 0x8XY0 Store the value of register VY in register VX
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Store the value of register V${hexStr(y, 0, false)} in register V${hexStr(x, 0, false)}`);
            this.V[x] = this.V[y];
        }
        else if ((opcode & 0xF00F) === 0x8001) {
            // 0x8XY1 Set VX to VX OR VY
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Set V${hexStr(x, 0, false)} to V${hexStr(x, 0, false)} OR V${hexStr(y, 0, false)}`);
            this.V[x] |= this.V[y];
        }
        else if ((opcode & 0xF00F) === 0x8002) {
            // 0x8XY2 Set VX to VX AND VY
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Set V${hexStr(x, 0, false)} to V${hexStr(x, 0, false)} AND V${hexStr(y, 0, false)}`);
            this.V[x] &= this.V[y];
        }
        else if ((opcode & 0xF00F) === 0x8003) {
            // 0x8XY3 Set VX to VX XOR VY
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Set V${hexStr(x, 0, false)} to V${hexStr(x, 0, false)} XOR V${hexStr(y, 0, false)}`);
            this.V[x] ^= this.V[y];
        }

        else if ((opcode & 0xF00F) === 0x8004) {
            // 0x8XY4 Add the value of register VY to register VX
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Add the value of register V${hexStr(y, 0, false)} to register V${hexStr(x, 0, false)}`);

            const oldVx = this.V[x];
            this.V[x] += this.V[y];

            // Set VF to 01 if a carry occurs
            // Set VF to 00 if a carry does not occur
            if (oldVx + this.V[y] !== this.V[x]) {
                this.V[0xF] = 1;
            }
            else {
                this.V[0xF] = 0;
            }
        }

        else if ((opcode & 0xF00F) === 0x8005) {
            // 0x8XY5 Subtract the value of register VY from register VX
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Subtract the value of register V${hexStr(y, 0, false)} from register V${hexStr(x, 0, false)}`);

            const oldVx = this.V[x];
            this.V[x] -= this.V[y];

            // Set VF to 00 if a borrow occurs
            // Set VF to 01 if a borrow does not occur
            if (oldVx - this.V[y] !== this.V[x]) {
                this.V[0xF] = 0;
            }
            else {
                this.V[0xF] = 1;
            }
        }
        else if ((opcode & 0xF00F) === 0x8006) {
            // 0x8XY6 Store the value of register VY shifted right one bit in register VX
            //        Set register VF to the least significant bit prior to the shift
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Store the value of register V${hexStr(y, 0, false)} shifted right one bit in register V${hexStr(x, 0, false)}`);

            this.V[0xF] = this.V[y] & 1;
            this.V[x] = this.V[y] >> 1;
        }
        else if ((opcode & 0xF00F) === 0x8007) {
            // 0x8XY7 Set register VX to the value of VY minus VX
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Set register V${hexStr(x, 0, false)} to the value of V${hexStr(y, 0, false)} minus V${hexStr(x, 0, false)}`);

            const oldVx = this.V[x];
            this.V[x] = this.V[y] - this.V[x];

            // Set VF to 00 if a borrow occurs
            // Set VF to 01 if a borrow does not occur
            if (this.V[y] - oldVx !== this.V[y]) {
                this.V[0xF] = 0;
            }
            else {
                this.V[0xF] = 1;
            }
        }
        else if ((opcode & 0xF00F) === 0x800E) {
            // 0x8XYE Store the value of register VY shifted left one bit in register VX
            //        Set register VF to the most significant bit prior to the shift
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Store the value of register V${hexStr(y, 0, false)} shifted left one bit in register V${hexStr(x, 0, false)}`);

            this.V[0xF] = (this.V[y] & 0x8000) >> 15;
            this.V[x] = this.V[y] << 1;
        }
        else if ((opcode & 0xF000) === 0x9000) {
            // 0x9XY0 Skip the following instruction if the value of 
            // register VX is not equal to the value of register VY
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Skip the following instruction if the value of register VX is not equal to the value of register VY`);

            if (this.V[x] !== this.V[y]) {
                this.address += 2;
            }
        }
        else if ((opcode & 0xF000) === 0xA000) {
            // 0xANNN Store memory address NNN in register I
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Store memory address ${hexStr(NNN, 4)} in register I`);
            this.I = NNN;
        }
        else if ((opcode & 0xF000) === 0xB000) {
            // 0xBNNN Jump to address NNN + V0
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Jump to address ${hexStr(NNN, 4)} + ${hexStr(this.V[0], 4)}`);

            this.address = NNN + this.V[0] - 2;
        }
        else if ((opcode & 0xF000) === 0xC000) {
            // 0xCXNN Set VX to a random number with a mask of NN
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Set V${hexStr(x, 0, false)} to a random number with a mask of ${hexStr(NN)}`);

            this.V[x] = Math.floor(Math.random() * 0xFF) & NN;
        }
        else if ((opcode & 0xF000) === 0xD000) {
            // 0xDXYN Draw a sprite at position VX, VY with N bytes of sprite data starting at the address stored in I
            //        Set VF to 01 if any set pixels are changed to unset, and 00 otherwise

            const N = opcode & 0x000f;
            const startPos = this.V[x] + 64 * this.V[y];

            const byteNr = Math.floor(startPos / 8);
            const bitNr = startPos % 8;

            this.V[0xF] = 0;
            for (let i = 0; i < N; i++) {
                let orgByte = this.memory[0xF00 + byteNr + i];
                let orgByte2 = this.memory[0xF00 + byteNr + i + 1];

                this.memory[0xF00 + byteNr + (i * 64 / 8)] ^= this.memory[this.I + i] >> bitNr;
                this.memory[0xF00 + byteNr + (i * 64 / 8) + 1] ^= this.memory[this.I + i] << 8 - bitNr;

                // Set VF to 01 if any set pixels are changed
                if ((this.memory[0xF00 + byteNr + i] & orgByte) !== orgByte) this.V[0xF] = 1;
                if ((this.memory[0xF00 + byteNr + i] & orgByte2) !== orgByte2) this.V[0xF] = 1;
            }

            this.updateCanvas();

            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Draw a sprite at position x${this.V[x]}, y${this.V[y]} with ${N} bytes of sprite data starting at the address stored in I (${this.I.toString(2)})`);
            // console.info(`Opcode not fully implemented (${hexStr(opcode, 4)} @${hexStr(this.address, 4)}).\n0xDXYN Draw a sprite at position x${this.V[x]}, y${this.V[y]} with ${N} bytes of sprite data starting at the address stored in I (${this.I.toString(2)})`);
        }
        else if ((opcode & 0xF00F) === 0xE00E) {
            // 0xEX9E Skip the following instruction 
            // if the key corresponding to the hex value 
            // currently stored in register VX is pressed
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Skip the following instruction if the key corresponding to the hex value currently stored in register VX is pressed`);

            if (this.keys[this.V[x]]) {
                this.address += 2;
            }
        }
        else if ((opcode & 0xF00F) === 0xE001) {
            // 0xEXA1 Skip the following instruction 
            // if the key corresponding to the hex value 
            // currently stored in register VX is not pressed
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Skip the following instruction if the key corresponding to the hex value currently stored in register VX is not pressed`);

            if (!this.keys[this.V[x]]) {
                this.address += 2;
            }
        }

        else if ((opcode & 0xF0FF) === 0xF007) {
            // 0xFX07 Store the current value of the delay timer in register VX
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Store the current value of the delay timer in register V${hexStr(x, 0, false)}`);

            this.V[x] = this.delayTimer;
        }
        else if ((opcode & 0xF0FF) === 0xF00A) {
            // 0xFX0A Wait for a keypress and store the result in register VX
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Wait for a keypress and store the result in register V${hexStr(x, 0, false)}`);

            this.halt = true;
            document.onkeypress = e => {
                this.V[x] = this.keyMap[e.key];
                this.halt = false;
                window.requestAnimationFrame(this.cycle);
                // setTimeout(this.cycle, period);
            };
        }
        else if ((opcode & 0xF0FF) === 0xF015) {
            // 0xFX15 Set the delay timer to the value of register VX
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Set the delay timer to the value of register V${hexStr(x, 0, false)}`);

            this.delayTimer = this.V[x];
        }
        else if ((opcode & 0xF0FF) === 0xF018) {
            // 0xFX18 Set the sound timer to the value of register VX
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Set the sound timer to the value of register V${hexStr(x, 0, false)}`);

            this.soundTimer = this.V[x];
        }
        else if ((opcode & 0xF0FF) === 0xF01E) {
            // 0xFX1E Add the value stored in register VX to register I
            // !!! should this sum VX and I or overwrite I with VX? !!!
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Add the value stored in register V${hexStr(x, 0, false)} to register I`);
            // if (DEBUG) console.warn("!!! should 0xFX1E sum VX and I or overwrite I with VX? !!!");

            this.I += this.V[x];
        }
        else if ((opcode & 0xF0FF) === 0xF029) {
            // 0xFX29 Set I to the memory address of the sprite data corresponding to 
            //        the hexadecimal digit stored in register VX
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Set I to the memory address of the sprite data corresponding to the hexadecimal digit stored in register V${hexStr(x, 0, false)}`);

            this.I = this.V[x] * 5;
        }
        else if ((opcode & 0xF0FF) === 0xF033) {
            // 0xFX33 Store the binary-coded decimal equivalent of the value 
            //        stored in register VX at addresses I, I+1, and I+2
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Store the binary-coded decimal equivalent of the value stored in register V${hexStr(x, 0, false)} at addresses I (${hexStr(this.I, 4)}), I+1, and I+2`);

            let nr = this.V[x];
            for (let i = 2; i >= 0; i--) {
                const a = nr % 10;
                nr -= a;
                nr /= 10;
                this.memory[this.I + i] = a;
            }
        }
        else if ((opcode & 0xF0FF) === 0xF055) {
            // 0xFX55 Store the values of registers V0 to VX inclusive in memory 
            //        starting at address I
            //        I is set to I + X + 1 after operation
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Store the values of registers V0 to V${hexStr(x, 0, false)} inclusive in memory starting at address ${hexStr(this.I, 4)}`);

            for (let i = 0; i <= x; i++) {
                this.memory[this.I + i] = this.V[i];
            }
            this.I += x + 1;
        }
        else if ((opcode & 0xF0FF) === 0xF065) {
            // 0xFX65 Fill registers V0 to VX inclusive with the values 
            //        stored in memory starting at address I
            //        I is set to I + X + 1 after operation
            if (DEBUG) console.debug(`${hexStr(opcode, 4)} @${hexStr(this.address, 4)}: Fill registers V0 to V${hexStr(x, 0, false)} inclusive with the values stored in memory starting at address ${hexStr(this.I, 4)}`);

            for (let i = 0; i <= x; i++) {
                this.V[i] = this.memory[this.I + i];
            }
            this.I += x + 1;
        }
        else {
            // throw new Error(`Illegal opcode ${hexStr(opcode, 4)} at address ${hexStr(this.address, 4)}`);
            console.error(`Illegal opcode ${hexStr(opcode, 4)} at address ${hexStr(this.address, 4)}`);
            this.halt = true;
        }

        this.address += 2;

        if (TIME) console.timeEnd("main");
    }

    /**
     * Outputs V and I registers to screen
     */
    printRegisters() {
        const regEle = document.querySelector(".registers");
        regEle.innerHTML = "";

        regEle.innerHTML += `address:    ${hexStr(this.address, 4)}\n`;
        for (let i = 0; i < this.V.length; i++) {
            regEle.innerHTML += `V${hexStr(i, 1, false)}:         ${hexStr(this.V[i], 4)}\n`;
        }
        regEle.innerHTML += `I:          ${hexStr(this._I, 4)}\n`;
        regEle.innerHTML += `delayTimer: ${hexStr(this.delayTimer, 4)}\n`;
        regEle.innerHTML += `soundTimer: ${hexStr(this.soundTimer, 4)}\n`;

        // let binStr = byte => {
        //     return byte
        //         .toString(2)
        //         .padStart(8, "0")
        //         .split("")
        //         .join(" ") + " ";
        // };
        // regEle.innerHTML += "\nscreen ram:\n  ";
        // for (let i = 0xF00; i < this.memory.length; i++) {
        //     regEle.innerHTML += binStr(this.memory[i]);
        //     if ((i + 1) % (64 / 8) === 0) regEle.innerHTML += "\n  ";
        // }
    }

    updateCanvas() {
        if (TIME) console.time("draw");
        var imageData = this.canvasCtx.getImageData(0, 0, 64, 32);
        const data = imageData.data;
        for (let i = 0; i < (32 * 64) / 8; i++) {
            let mask = 128;
            for (let b = 0; b < 8; b++) {
                let dIdx = (i * 8 + b) * 4;
                if (this.memory[i + 0xF00] & mask) {
                    // white
                    data[dIdx] = 255;       // red
                    data[dIdx + 1] = 255;  // green
                    data[dIdx + 2] = 255; // blue
                    data[dIdx + 3] = 255;// alpha
                }
                else {
                    // black
                    data[dIdx] = 32;        // red
                    data[dIdx + 1] = 32;   // green
                    data[dIdx + 2] = 32;  // blue
                    data[dIdx + 3] = 255;// alpha
                }
                mask >>= 1;
            }
        }
        this.canvasCtx.putImageData(imageData, 0, 0);
        if (TIME) console.timeEnd("draw");
    }
}

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
    const game = window.location.search.replace("?", "").toUpperCase() || "PONG";
    document.querySelector(".game").textContent = game;
    const chip8 = new Chip8(await fetchGame(game));
})();