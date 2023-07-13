/*!
 * From https://www.redblobgames.com/x/2327-roguelike-dev/
 * Copyright 2023 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 */

import {offgridCellToRect} from "./offgrid.js";

/**
 * @typedef {Object} Rect  - half-open intervals
 * @property {number} left
 * @property {number} right
 * @property {number} top
 * @property {number} bottom
 */

/**
 * @typedef {Object} Room
 * @property {boolean} unlocked
 * @property {Rect} rect
 */


export function generateMap() {
    const bounds = {left: 0, right: 100, top: 0, bottom: 30};

    const SEED = 123456;
    const EDGE = 0.1;
    const ROOM_START_LEFT = 20;
    const ROOM_AVERAGE_WIDTH = 12;
    const ROOM_AVERAGE_HEIGHT = 5;
    
    /** @type {Room[]} */
    let rooms = [];
    for (let r = 0; r < 10; r++) {
        for (let q = 0; q < 3; q++) {
            let offgrid = offgridCellToRect(q, r, SEED, EDGE);
            let rect = {
                left: Math.round(offgrid.left * ROOM_AVERAGE_WIDTH),
                right: Math.round(offgrid.right * ROOM_AVERAGE_WIDTH),
                top: Math.round(offgrid.top * ROOM_AVERAGE_HEIGHT),
                bottom: Math.round(offgrid.bottom * ROOM_AVERAGE_HEIGHT),
            };
            let room = {
                q, r,
                rect,
                hash: offgrid.hash,
            };
            rooms.push(room);
        }
    }
    
    return {
        bounds,
        tiles: {
            get({x, y}) { return x < 0 || y < 0 || x >= 100 | y >= 30 ? 'void' : x < 20 + 10 * Math.cos(y*0.1)  ? 'river' : 'plains'; },
        },
        rooms,
    };
}


