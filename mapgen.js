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

function toKey(x, y) {
    return `${x}:${y}`;
}

function generateRooms(bounds) {
    const SEED = 123456;
    const EDGE = 0.1;
    const ROOM_START_LEFT = 20;
    const ROOM_AVERAGE_WIDTH = 12;
    const ROOM_AVERAGE_HEIGHT = 5;
    
    /** @type {Room[]} */
    let rooms = [];

    // The walkable areas are computed in two different ways:
    // 1. To the *left* of the leftmost room, all tiles are walkable.
    //    I need to calculate the leftmost wall for this.
    // 2. Within each room, all tiles are walkable.
    let walkable = new Set();
    let leftmostWall = new Map();
    for (let y = bounds.top; y < bounds.bottom; y++) {
        leftmostWall.set(y, bounds.left + ROOM_START_LEFT + ROOM_AVERAGE_WIDTH);
    }
    
    for (let r = 0; r < Math.floor((bounds.bottom - bounds.top) / ROOM_AVERAGE_HEIGHT) - 1; r++) {
        for (let q = 0; q < Math.floor((bounds.right - bounds.left - ROOM_START_LEFT) / ROOM_AVERAGE_WIDTH - 1); q++) {
            let offgrid = offgridCellToRect(q, r, SEED, EDGE);
            let rect = {
                left: bounds.left + ROOM_START_LEFT + Math.round(offgrid.left * ROOM_AVERAGE_WIDTH),
                right: bounds.left + ROOM_START_LEFT + Math.round(offgrid.right * ROOM_AVERAGE_WIDTH),
                top: bounds.top + Math.round(offgrid.top * ROOM_AVERAGE_HEIGHT),
                bottom: bounds.top + Math.round(offgrid.bottom * ROOM_AVERAGE_HEIGHT),
            };
            let room = {
                q, r,
                rect,
                hash: offgrid.hash,
            };
            rooms.push(room);

            // Need to keep track of the leftmost wall for each row
            for (let y = rect.top; y <= rect.bottom; y++) {
                leftmostWall.set(y, Math.min(rect.left, leftmostWall.get(y)));
            }
            
            // Mark the interior of the room as walkable
            for (let y = rect.top + 1; y < rect.bottom; y++) {
                for (let x = rect.left + 1; x < rect.right; x++) {
                    walkable.add(toKey(x, y));
                }
            }
        }
    }

    for (let y = bounds.top; y < bounds.bottom; y++) {
        for (let x = bounds.left; x < leftmostWall.get(y); x++) {
            walkable.add(toKey(x, y));
        }
    }

    return {rooms, walkable};
}

export function generateMap() {
    const bounds = {left: 0, right: 100, top: 0, bottom: 100};

    const {rooms, walkable} = generateRooms(bounds);
    
    return {
        bounds,
        tiles: {
            get({x, y}) {
                if (x < bounds.left || x >= bounds.right
                    || y < bounds.top || y >= bounds.bottom) return 'void';
                if (!walkable.has(toKey(x, y))) return 'void';
                return x < 10 + 5 * Math.cos(y*0.1)
                    ? 'river'
                    : 'plains';
            },
        },
        walkable,
        rooms,
    };
}


