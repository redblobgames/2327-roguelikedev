/*!
 * From https://www.redblobgames.com/x/2327-roguelike-dev/
 * based on https://gitlab.com/chriscox/offgrid/
 * which is MIT licensed, copyright Chris Cox
 */
'use strict';

/**
 * Adapted OAATHash hash function from
 * https://github.com/bryc/code/blob/master/jshash/hashes/__otherhashes__.js
 * which is public domain https://github.com/bryc/code/issues/18
 * 
 * @param {integer} x - integer grid cell
 * @param {integer} y - integer grid cell
 * @param {integer} seed - random seed
 * @return {float} a value between 0.0 and 1.0
 */

function hashXY_float(x, y, seed) {
    let data = [x, y, seed];
    let hash = 1;
    for (let i = 0; i < data.length; i++) {
        hash += data[i];
        hash += hash << 10;
        hash ^= hash >>> 6;
    }
    hash += hash << 3;
    hash ^= hash >>> 11;
    hash += hash << 15;
    return (hash >>> 0) / (2 ** 32);
}


// javascript port of Chris Cox's c++ function

// all boxes will be between (2*edge) and (2.0-2*edge) in dimension
// with average size 1.0
function box_random( x, y, seed, edge ) {
    const range = 1.0 - 2.0 * edge;
    
    let random = hashXY_float(x, y, seed);
    let result = edge + range * random;
    
    return result;
}


// javascript port of Chris Cox's c++ function
/**
 * 
 * @param {number} x - integer grid cell
 * @param {number} y - integer grid cell
 * @param {number} seed - for the random number generator
 * @param {number} edge - from 0.0 to 0.5
 * @return {{left, top, right, bottom, hash, parity}} rectangle
 */
export function offgridCellToRect(x, y, seed, edge) {
    // checkerboard even and odd, vertical and horizontal limits
    const even = ((x ^ y) & 0x01) === 0;
    const hash = hashXY_float(x, y, seed);
    if (even) {
        return {
            parity: 'even',
            hash,
            left: x + box_random(x, y, seed, edge),
            top: y + box_random(x+1, y, seed, edge),
            right: x + box_random(x+1, y+1,seed, edge) + 1,
            bottom: y + box_random(x, y+1, seed, edge) + 1,
        };
    } else {
        return {
            parity: 'odd',
            hash,
            top: y + box_random(x, y, seed, edge),
            left: x + box_random(x, y+1, seed, edge),
            bottom: y + box_random(x+1, y+1, seed, edge) + 1,
            right: x + box_random(x+1, y, seed, edge) + 1,
        };
    }
}
