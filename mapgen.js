/*!
 * From https://www.redblobgames.com/x/2327-roguelike-dev/
 * Copyright 2023 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * Map generation
 */

/// <reference path="mapgen.d.ts"/>

import {offgridCellToRect} from "./offgrid.js";
import {lerp} from "./util.js";

/** @type {Room} */
const WILDERNESS_ROOM = {
    q: -1, r: NaN, hash: NaN,
    rect: {top: -Infinity, bottom: Infinity},
    unlocked: true,
    unlock() { throw "wilderness always unlocked"; },
};

function wildernessMap({x, y}) {
    return x < 10 + 5 * Math.cos(y*0.1)
        ? 'river'
        : 'plains';
}

function tileId(x, y) {
    return `${x}:${y}`;
}

/**
 * @param {number} x
 * @param {number} y
 * @returns {Position}
 */
export function Pos(x, y) {
    return {
        x, y,
        toString() { return tileId(this.x, this.y); },
        equals(other) { return this.x === other.x && this.y === other.y; },
    };
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
    let walkable = new Map();
    let wildernessEnds = new Map();
    for (let y = bounds.top; y < bounds.bottom; y++) {
        wildernessEnds.set(y, bounds.left + ROOM_START_LEFT + ROOM_AVERAGE_WIDTH);
    }

    const roomRows = Math.floor((bounds.bottom - bounds.top) / ROOM_AVERAGE_HEIGHT) - 1;
    const roomCols = Math.floor((bounds.right - bounds.left - ROOM_START_LEFT) / ROOM_AVERAGE_WIDTH - 1);
    for (let r = 0; r < roomRows; r++) {
        for (let q = 0; q < roomCols; q++) {
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
                unlocked: false,
            };
            rooms.push(room);

            // Need to keep track of the leftmost wall for each row
            for (let y = rect.top; y <= rect.bottom; y++) {
                wildernessEnds.set(y, Math.min(rect.left, wildernessEnds.get(y)));
            }
        }
    }

    for (let y = bounds.top; y < bounds.bottom; y++) {
        for (let x = bounds.left; x < wildernessEnds.get(y); x++) {
            let pos = Pos(x, y);
            if (wildernessMap(pos) !== 'river') {
                walkable.set(pos.toString(), pos);
            }
        }
    }

    return {roomCols, roomRows, rooms, walkable, wildernessEnds};
}

function addDoors(roomRows, roomCols, rooms) {
    // Underlying the offgrid rooms is an original grid with q,r
    // coordinates. Each room gets connected to the four rooms
    // adjacent to it on the original grid

    function roomAt(q, r) { return rooms.find((room) => room.q === q && room.r === r); }

    /** @type {Set<Door>} */
    let doors = new Set();
    
    for (let r = 0; r < roomRows; r++) {
        for (let q = 0; q < roomCols; q++) {
            let room = roomAt(q, r);
            
            // Dig door on left, with the left column leading to the wilderness
            let leftRoom = roomAt(q-1, r);
            if (!leftRoom) leftRoom = WILDERNESS_ROOM; // wilderness
            let x = room.rect.left;
            let top = Math.max(room.rect.top, leftRoom.rect.top);
            let bottom = Math.min(room.rect.bottom, leftRoom.rect.bottom);
            let y = Math.round(lerp(top+1, bottom-1, room.hash));
            doors.add({
                room1: room,
                room2: leftRoom,
                pos: Pos(x, y),
            });
            
            // Dig door on top, except on the top row
            let topRoom = roomAt(q, r-1);
            if (topRoom) {
                let y = room.rect.top;
                let left = Math.max(room.rect.left, topRoom.rect.left);
                let right = Math.min(room.rect.right, topRoom.rect.right);
                let x = Math.round(lerp(left+1, right-1, room.hash));
                doors.add({
                    room1: room,
                    room2: topRoom,
                    pos: Pos(x, y),
                });
            }
        }
    }

    return {doors};
}

export function generateMap() {
    const bounds = {left: 0, right: 100, top: 0, bottom: 100};

    const {roomRows, roomCols, rooms, walkable, wildernessEnds} = generateRooms(bounds);
    const {doors} = addDoors(roomRows, roomCols, rooms, walkable);

    return {
        bounds,
        tiles: {
            /**
             * @param {Position} pos
             */
            get(pos) {
                if (pos.x < bounds.left || pos.x >= bounds.right
                    || pos.y < bounds.top || pos.y >= bounds.bottom) return 'void';
                if (pos.x < wildernessEnds.get(pos.y)) return wildernessMap(pos);
                if (!walkable.has(pos.toString())) return 'void';
                return 'desert';
            },
        },
        roomRows, roomCols,
        rooms,
        walkable,
        wildernessEnds,
        doors,
    };
}

export function unlockRoom(map, room) {
    const {rect} = room;
    room.unlocked = true;
    for (let y = rect.top + 1; y < rect.bottom; y++) {
        for (let x = rect.left + 1; x < rect.right; x++) {
            let pos = Pos(x, y);
            map.walkable.set(pos.toString(), pos);
        }
    }
    for (let door of map.doors) {
        if (door.room1 === room || door.room2 === room) {
            map.walkable.set(door.pos.toString(), door.pos);
        }
    }
}

const UNLOCKABLE_ROOM_LIMIT = 3;
/**
 * Unlockable rooms are connected to an unlocked
 * room AND are limited in number
 */
export function unlockableRoomList(map) {
    let candidates = /** @type {Set<Room>} */(new Set());
    // Easiest way to find the unlockable rooms is to check the doors
    for (let door of map.doors) {
        if (door.room1.unlocked !== door.room2.unlocked) {
            if (!door.room1.unlocked) candidates.add(door.room1);
            if (!door.room2.unlocked) candidates.add(door.room2);
        }
    }
    // Sorting by hash is easy and consistent across frames
    let rooms = Array.from(candidates);
    rooms.sort((a, b) => a.hash - b.hash);
    return rooms.slice(0, UNLOCKABLE_ROOM_LIMIT);
}
