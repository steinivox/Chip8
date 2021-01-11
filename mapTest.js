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