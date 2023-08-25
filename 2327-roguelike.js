/*!
 * From https://www.redblobgames.com/x/2327-roguelike-dev/
 * Copyright 2023 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 */

/// <reference path="types.d.ts"/>

import {Pos, unlockRoom, unlockableRoomList, generateMap} from "./mapgen.js";
import {clamp} from "./util.js";

// Drawing area
/** @type {HTMLCanvasElement} */
export const canvas = document.querySelector("#game");
export const ctx = canvas.getContext('2d');
const CANVAS_SCALE = window.devicePixelRatio ?? 1; // Handle hi-dpi displays, but also responsive layout
canvas.width *= CANVAS_SCALE;
canvas.height *= CANVAS_SCALE;

/** Convert from event coordinate space (on the page) to Canvas coordinate
 * space (assuming there are no transforms on the canvas)
 * @param {PointerEvent} event
 * @returns {Position}
 */
function convertPixelToCanvasCoord(event) {
    const bounds = canvas.getBoundingClientRect();
    return Pos(
        (event.x - bounds.left) / bounds.width * canvas.width,
        (event.y - bounds.top) / bounds.height * canvas.height,
    );
}


//////////////////////////////////////////////////////////////////////
// Simulation

const roomCharacteristics = {
    // map the room type to things we need to know about how the room works
    wilderness: {
        color: "hsl(100 30% 60%)",
        furnitureShape: {
            name: "berries",
            ticks: 1,
            stand: Pos(0, 0),
            inputs: [],
            output: 'rawfood',
            sprites: [{type: 'cactus', pos: Pos(0, 0)}],
        },
    },
    open: {
        color: "hsl(0 0% 40%)",
        furnitureShape: null,
    },
    dining: {
        furnitureShape: {
            name: "table",
            ticks: 20,
            stand: Pos(0, 1),
            inputs: [{type: 'rawfood', pos: Pos(0, 0)}],
            output: null,
            sprites: [{type: 'table', pos: Pos(0, 0)}],
        },
        // TODO: needs to reduce hunger
    },
    bedroom: {
        furnitureShape: {
            name: "bed",
            ticks: 60,
            stand: Pos(0, 0),
            inputs: [],
            output: null,
            sprites: [{type: 'bed', pos: Pos(0, 0)}],
        },
        // TODO: needs to reduce sleepiness
    },
    tool_shop: {
        // NOTE: test of multi-input production
        furnitureShape: {
            name: "crafting",
            ticks: 60,
            stand: Pos(0, 1),
            inputs: [
                {type: 'iron', pos: Pos(-1, 0)},
                {type: 'wood', pos: Pos(0, -1)},
            ],
            output: 'axe',
            sprites: [{type: 'table', pos: Pos(0, 0)}],
        },
    },
};

/**
 * Is a position within the bounds of a room?
 * @param {Room} room
 * @param {Position} pos
 * @returns {boolean}
 */
function positionInRoom(room, pos) {
    return room.rect.left+1 <= pos.x && pos.x < room.rect.right
        && room.rect.top+1 <= pos.y && pos.y < room.rect.bottom;
}

/**
 * Is there a room at a given position?
 * @param {Position} pos
 * @returns {Room?}
 */
function roomAtPosition(pos) {
    let roomOrDoor = map.walkable.get(pos.toString())?.in;
    return roomOrDoor?.type ? roomOrDoor : undefined;
}

/**
 * For a given room, calculate which positions would be occupied by a piece of furniture
 * @param {Room} room
 * @param {Position} pos
 * @returns {Map<string, Position>} - a Map instead of a Set because of lack of value types in JS
 */
function positionsOccupiedByFurniture(room, pos) {
    /** @type{Map<string, Position>} */
    let result = new Map();
    function add(relativeCoord) {
        if (relativeCoord) {
            let worldCoord = Pos(relativeCoord.x + pos.x, relativeCoord.y + pos.y);
            result.set(worldCoord.toString(), worldCoord);
        }
    }

    const shape = roomCharacteristics[room.type].furnitureShape;
    if (shape) {
        add(shape.stand);
        for (let v of shape.inputs) add(v.pos);
        for (let v of shape.sprites) add(v.pos);
    }
    return result;
}


/**
 * Is a given position open (buildable) in a room?
 * @param {Room} room
 * @param {Position} pos
 * @returns {boolean}
 */
function isPositionInRoomBuildable(room, pos) {
    // It needs to be in an unlocked room
    if (!room.unlocked) return false;
    if (!positionInRoom(room, pos)) return false;
    // and it can't overlap with any furniture already in the room
    for (let f of room.furniture) {
        for (let p of positionsOccupiedByFurniture(room, f).values()) {
            if (pos.equals(p)) return false;
        }
    }
    // If we didn't find anything bad, we're good
    return true;
}


class Colonist {
    constructor(pos) {
        /** @type {Position} */
        this.pos = pos;
        /** @type {Position[]} - reverse order of tiles to visit */
        this.path = [];
        // TODO: status like sleepiness, hunger - would go up over time
        /** @type {Item | null} - can hold one item */
        this.inventory = null;
    }

    simulate() {
        function randomDestination() {
            const numberOfDestinations = map.walkable.size;
            let i = Math.floor(Math.random() * numberOfDestinations);
            return Array.from(map.walkable.values())[i].pos;
        }

        if (this.path.length > 0) {
            // If there's a path, we'll move one step closer to the goal
            this.pos = this.path.pop();
        } else {
            // HACK: pickup/dropoff test with one colonist and one item

            /** @type {Position} */
            let dest; // decide where to go

            // No path, want to pick up or drop off an item
            let item = findItemOnTile(this.pos);
            if (!this.inventory && item) {
                // Ok, the item is right here, so let's pick it up
                // and take it to a random place
                itemPickUp(this, item);
                dest = randomDestination();
            } else if (!this.inventory) {
                // No item here, and we're carrying nothing,
                // so let's go pick up an item
                dest = map.items[0].pos; // assume it's on the ground
            } else if (item) {
                // We are carrying the item, but can't
                // drop it here, so find a place to drop
                dest = randomDestination();
            } else {
                // We already are carrying the item, and
                // we can drop it here
                itemDrop(this, this.inventory);
                dest = randomDestination();
            }

            let bfs = breadthFirstSearch(map, this.pos, dest);
            if (!bfs) {
                console.warn("WARN bfs no path", this.pos.toString(), "to", dest.toString())
                return;
            }
            let current = dest;
            while (!current.equals(this.pos)) {
                this.path.push(current)
                current = bfs.came_from[current];
            }
        }
    }
}

const simulation = { // global
    TICKS_PER_SECOND: 10,
    tickId: 1, // start from 1 because I also use this as a truthy value
    colonists: [],
    init() {
        for (let x = 20; x < 25; x++) {
            for (let y = 10; y < 15; y++) {
                this.colonists.push(new Colonist(Pos(x, y)));
            }
        }
        // HACK: pickup/dropoff test with one colonist and one item
        this.colonists.splice(1);
        itemCreate('rawfood', this.colonists[0]);
    },
    simulate() {
        this.tickId++;
        for (let colonist of this.colonists) {
            colonist.simulate();
        }
    },
};

//////////////////////////////////////////////////////////////////////
// Items

/**
 * @param {Position | Object} pos
 * @returns {pos is Position}
 */
function isItemPosOnGround(pos) {
    return pos && 'x' in pos;
}

/**
 * @param {Position} pos
 * @returns {Item | null}
 */
function findItemOnTile(pos) {
    for (let item of map.items) {
        if (isItemPosOnGround(item.pos) && pos.equals(item.pos)) return item;
    }
    return null;
}

/**
 * @param {ItemType} type
 * @param {Colonist} colonist
 * @returns {Item}
 */
function itemCreate(type, colonist) {
    if (colonist.inventory !== null) throw `Can't create item ${type}, colonist inventory not empty`;
    let item = {type, pos: colonist};
    map.items.push(item);
    colonist.inventory = item;
    return item;
}

/**
 * @param {Item} item
 */
function itemDestroy(item) {
    if (!isItemPosOnGround(item.pos)) throw `Can't destroy ${item} unless on the ground`;
    item.pos = null;
    let i = map.items.indexOf(item);
    if (i < 0) throw `Item ${item} not found in items list`;
    map.items.splice(i, 1);
}

/**
 * @param {Colonist} colonist;
 * @param {Item} item
 */
function itemPickUp(colonist, item) {
    let pos = item.pos;
    if (isItemPosOnGround(pos) && !colonist.pos.equals(pos)) throw `Can't pick up item ${item.type}, not where colonist is`;
    if (colonist.inventory !== null) throw `Can't pick up item ${item.type}, colonist inventory not empty`;
    item.pos = colonist;
    colonist.inventory = item;
}

/**
 * @param {Item} item
 * @param {Colonist} colonist;
 */
function itemDrop(colonist, item) {
    if (item.pos !== colonist) throw `Can't drop item ${item.type} that's not carried`;
    if (findItemOnTile(colonist.pos) !== null) throw `Can't drop item ${item.type} because tile occupied`;
    item.pos = colonist.pos;
    colonist.inventory = null;
}

//////////////////////////////////////////////////////////////////////
// Map

/** @type{GameMap} */
const map = generateMap(); // global
for (let room of map.rooms) { // HACK: for testing
    if (room.q < 2) unlockRoom(map, room);
}
map.rooms[0].furniture = [Pos(map.rooms[0].rect.left + 2, map.rooms[0].rect.top + 1)];

const camera = { // global
    pos: Pos(NaN, NaN),
    set(x, y) {
        const halfwidth = Math.min(this.VIEWWIDTH, map.bounds.right - map.bounds.left) / 2;
        const halfheight = Math.min(this.VIEWHEIGHT, map.bounds.bottom - map.bounds.top) / 2;
        const margin = 0.33; // allow the camera to extend this many tiles past the map, to show that we're at the edge
        this.pos = Pos(
            clamp(x, map.bounds.left + halfwidth - margin, map.bounds.right - halfwidth + margin),
            clamp(y, map.bounds.top + halfheight - margin, map.bounds.bottom - halfheight + margin)
        );
    },
    // For picking:
    /** @returns {Position} */
    convertCanvasToWorldCoord({x, y}) {
        const left = this.pos.x - this.VIEWWIDTH / 2;
        const top = this.pos.y - this.VIEWHEIGHT / 2;
        return Pos(
            Math.floor(x / this.TILE_SIZE + left),
            Math.floor(y / this.TILE_SIZE + top),
        );
    },
    // For zooming:
    _z: 4,
    get z() { return this._z; },
    set z(newZ) { this._z = clamp(newZ, 2, 10); },
    get TILE_SIZE() { return 100 / this.z * CANVAS_SCALE; },
    get VIEWWIDTH() { return canvas.width / this.TILE_SIZE; },
    get VIEWHEIGHT() { return canvas.height / this.TILE_SIZE; },
};
camera.set(30, 5);


//////////////////////////////////////////////////////////////////////
// Pathfinding

/**
 * @param {Object} map
 * @param {Position} start
 * @param {Position} goal
 */
function breadthFirstSearch(map, start, goal) {
    // see https://www.redblobgames.com/pathfinding/a-star/introduction.html
    // for the algorithm itself, and this hack to make paths prettier with bfs:
    // https://www.redblobgames.com/pathfinding/a-star/implementation.html#ties-checkerboard-neighbors
    const DIRS1 = [[-1, 0], [0, +1], [+1, 0], [0, -1]];
    const DIRS2 = [...DIRS1].reverse();
    let cost_so_far = {}; cost_so_far[start] = 0;
    let came_from = {}; came_from[start] = null;
    let fringes = [[start]];
    for (let k = 0; fringes[k].length > 0; k++) {
        fringes[k+1] = [];
        for (let pos of fringes[k]) {
            if (pos.equals(goal)) return {cost_so_far, came_from};
            const parity = (pos.x + pos.y) % 2;
            for (let [dx, dy] of parity === 0? DIRS1 : DIRS2) {
                let neighbor = Pos(pos.x + dx, pos.y + dy);
                if (cost_so_far[neighbor] === undefined
                    && map.walkable.has(neighbor.toString())) {
                    cost_so_far[neighbor] = k+1;
                    came_from[neighbor] = pos;
                    fringes[k+1].push(neighbor);
                }
            }
        }
    }
    throw "Path not found - should never happen";
}


//////////////////////////////////////////////////////////////////////
// Rendering
function setMessage(str) {
    document.querySelector("#messages").textContent = str;
}

const sprites = await (async function() {
    async function S(icon) {
        // This relies on the way game-icons.net svgs are structured,
        // as a single <path d="…"/>
        const url = `./game-icons/${icon}.svg`;
        const stream = await fetch(url);
        const svg = await stream.text();
        return new Path2D(svg.replace(/.* d="/, "").replace(/".*/, ""));
    }

    return {
        person:     await S("delapouite/person"),
        rooster:    await S("delapouite/rooster"),
        grass:      await S("delapouite/grass"),
        wheat:      await S("lorc/wheat"),
        rawfood:    await S("delapouite/grain-bundle"),
        wall:       await S("delapouite/stone-wall"),
        cactus:     await S("delapouite/cactus"),
        door:       await S("delapouite/door"),
        move:       await S("delapouite/move"),
        square:     await S("delapouite/square"),
        sprout:     await S("lorc/sprout"),
        table:      await S("delapouite/table"),
        desk:       await S("delapouite/desk"),
        bed:        await S("delapouite/bed"),
        digdug:     await S("lorc/dig-dug"),
        mining:     await S("lorc/mining"),
        anvil_impact: await S("lorc/anvil-impact"),
        hand_saw: await S("delapouite/hand-saw"),
        fishing_pole: await S("delapouite/fishing-pole"),
        watering_can: await S("delapouite/watering-can"),
        footprint: await S("lorc/footprint"),
        stop_sign: await S("delapouite/stop-sign"),
        check_mark: await S("delapouite/check-mark"),
    };
})();


const render = {
    /** @type {null | Rect} */
    view: null,
    // css cursor to use
    cursor: '',

    // Local flags to change the rendering
    highlightedRoom: null,

    begin() {
        const halfwidth = camera.VIEWWIDTH / 2;
        const halfheight = camera.VIEWHEIGHT / 2;

        this.view = {
            left: Math.floor  (camera.pos.x - halfwidth),
            right: Math.ceil  (camera.pos.x + halfwidth),
            top: Math.floor   (camera.pos.y - halfheight),
            bottom: Math.ceil (camera.pos.y + halfheight),
        };

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(camera.TILE_SIZE, camera.TILE_SIZE);
        ctx.translate(halfwidth, halfheight); // move from top left to center of screen
        ctx.translate(-camera.pos.x, -camera.pos.y); // move center by the camera offset
        ctx.lineJoin = 'bevel'; // some of the game-icons have sharp corners

        if (canvas.style.cursor !== this.cursor) canvas.style.cursor = this.cursor;
    },
    end() {
        this.view = null; // to help catch rendering outside of begin/end
        ctx.restore();
    },

    drawTile(x, y, sprite, color, options={}) {
        if (typeof x !== 'number' || typeof y !== 'number') throw "invalid pos";
        const defaultPath = new Path2D("M 0,0 l 512,0 l 0,512 l -512,0 z");
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1/512, 1/512);
        if (options.scale) ctx.scale(options.scale, options.scale);
        ctx.stroke(sprites[sprite] ?? defaultPath);
        ctx.fillStyle = color;
        ctx.fill(sprites[sprite] ?? defaultPath);
        ctx.restore();
    },

    drawTileLabel(label, x, y, options={}) {
        let scale = options.scale ?? 0.4;
        const maxWidth = options.maxWidth ?? Infinity;
        const maxHeight = options.maxHeight ?? Infinity;
        ctx.font = `${scale.toFixed(2)}px monospace`;
        const metrics = ctx.measureText(label);
        // TODO: bug -- below scale 0.25, firefox doesn't draw anything!
        // if (scale !== 0.4 && scale !== 2) console.log(scale, metrics)
        if (metrics.width > maxWidth || metrics.actualBoundingBoxAscent > maxHeight) {
            scale *= Math.min(maxWidth / metrics.width, maxHeight / metrics.actualBoundingBoxAscent);
            ctx.font = `${scale.toFixed(2)}px monospace`;
        }
        ctx.lineWidth = 2 / camera.TILE_SIZE;
        ctx.strokeStyle = "black";
        ctx.fillStyle = "white";
        ctx.textAlign = 'center';
        ctx.strokeText(label, x+0.5, y+0.9);
        ctx.fillText(label, x+0.5, y+0.9);
    },

    drawBackground() {
        // Tile backgrounds
        const tileRenders = {
            void: ["hsl(300, 10%, 20%)", "hsl(300 5% 10%)"],
            grass: ["hsl(100 30% 50%)", "hsl(110 30% 49%)", "hsl(90 35% 50%)", "hsl(100 35% 50%)"],
            plains: ["hsl(80 30% 60%)", "hsl(90 35% 61%)", "hsl(70 40% 59%)", "hsl(80 40% 60%)"],
            desert: ["hsl(50 20% 70%)", "hsl(50 15% 70%)", "hsl(50 25% 70%)", "hsl(45 20% 70%)"],
            river: ["hsl(220 50% 44%)", "hsl(240 50% 43%)", "hsl(230 50% 45%)", "hsl(230 50% 42%)"],
        };
        function animationIndex(x, y) {
            return (x & 7) ^ (y & 7) ^ (((x+y) & 4) ? 0xff : 0);
        }

        ctx.save();
        ctx.lineJoin = 'bevel'; // some of the game-icons have sharp corners
        ctx.lineWidth = 1/(camera.TILE_SIZE/512);
        ctx.strokeStyle = "black";
        for (let y = this.view.top; y < this.view.bottom; y++) {
            for (let x = this.view.left; x < this.view.right; x++) {
                let tile = map.tiles.get(Pos(x, y));
                let index = animationIndex(x, y - (tile !== 'river'? 0 : Math.floor(simulation.tickId/simulation.TICKS_PER_SECOND)));
                let renderCandidates = tileRenders[tile] ?? ["red"];
                let render = renderCandidates[index % renderCandidates.length];
                this.drawTile(x, y, null, render);
            }
        }
        ctx.restore();
    },

    drawDoors() {
        ctx.save();
        for (let door of map.doors) {
            let {x, y} = door.pos;
            if (this.view.left <= x && x < this.view.right
                && this.view.top <= y && y < this.view.bottom) {
                if (!door.room1.unlocked && !door.room2.unlocked) continue;
                let color = `hsl(30 30% 30%)`;
                ctx.lineWidth = 1/(camera.TILE_SIZE/512);
                ctx.strokeStyle = (door.room1.unlocked && door.room2.unlocked) ? "white" : "black";
                this.drawTile(x, y, 'door', color);
            }
        }
        ctx.restore();
    },

    drawRooms() {
        ctx.save();
        let unlockableRooms = unlockableRoomList(map);
        for (let room of map.rooms) {
            let unlockable = unlockableRooms.indexOf(room) >= 0;
            if (!room.unlocked && !unlockable) continue;
            let alpha = room.unlocked ? 0.5 : 0.1;
            if (main.uiMode === 'room' && unlockable) alpha = 1.0;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = roomCharacteristics[room.type].color ?? `hsl(${360 * room.hash|0} 50% 50%)`;
            ctx.strokeStyle = "white";
            ctx.lineWidth = room === this.highlightedRoom ? 0.25 : 0.05;
            ctx.beginPath();
            ctx.rect(room.rect.left+1, room.rect.top+1, room.rect.right-room.rect.left-1, room.rect.bottom-room.rect.top-1);
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.stroke();
            ctx.globalAlpha = camera.z / 10.0;
            this.drawTileLabel(room.unlocked? room.type : "?",
                               (room.rect.left+room.rect.right)/2, room.rect.bottom-1,
                               {
                                   scale: 2,
                                   maxWidth: room.rect.right-room.rect.left-2,
                                   maxHeight: room.rect.bottom-room.rect.top-1.5
                               });
        }
        ctx.restore();
    },

    drawFurniture() {
        ctx.save();
        for (let room of map.rooms) {
            const furnitureData = roomCharacteristics[room.type];
            if (!furnitureData) continue;
            for (let {x, y} of room.furniture) {
                if (this.view.left <= x && x < this.view.right
                    && this.view.top <= y && y < this.view.bottom) {
                    let color = furnitureData.color ?? "white";
                    ctx.lineWidth = 1/(camera.TILE_SIZE/512);
                    ctx.strokeStyle = "black";
                    if (furnitureData.furnitureShape.stand) {
                        this.drawTile(x + furnitureData.furnitureShape.stand.x,
                                      y + furnitureData.furnitureShape.stand.y,
                                      'footprint', "hsl(120 30% 70% / 0.2)");
                    }
                    for (let input of furnitureData.furnitureShape.inputs) {
                        this.drawTile(x + input.pos.x, y + input.pos.y,
                                      input.type, "hsl(120 50% 50% / 0.3)");
                    }
                    for (let sprite of furnitureData.furnitureShape.sprites) {
                        this.drawTile(x + sprite.pos.x, y + sprite.pos.y,
                                      sprite.type, color);
                    }
                }
            }
        }
        ctx.restore();
    },

    /**
     * if there's a room at this position, draw yes/no squares
     * showing whether furniture is allowed
     */
    drawFurnitureCandidateAt(pos) {
        pos = Pos(Math.floor(pos.x), Math.floor(pos.y));
        let room = roomAtPosition(pos);
        if (!room || !room.unlocked) return;
        let positions = positionsOccupiedByFurniture(room, pos).values();
        ctx.save();
        ctx.lineWidth = 1/(camera.TILE_SIZE/512);
        ctx.strokeStyle = "black";
        ctx.globalAlpha = 0.75;
        for (let p of positions) {
            if (isPositionInRoomBuildable(room, p)) {
                this.drawTile(p.x, p.y, null, "hsl(200 50% 50%)");
                this.drawTile(p.x, p.y, 'check_mark', "white");
            } else {
                this.drawTile(p.x, p.y, null, "hsl(0 75% 50%)");
                this.drawTile(p.x, p.y, 'stop_sign', "white");
            }
        }
        ctx.restore();
    },

    drawCreatures() {
        ctx.save();
        for (let colonist of simulation.colonists) {
            let {x, y} = colonist.pos;
            if (this.view.left <= x && x < this.view.right
                && this.view.top <= y && y < this.view.bottom) {
                let color = `hsl(60, 100%, 75%)`;
                ctx.lineWidth = 1/(camera.TILE_SIZE/512);
                ctx.strokeStyle = "black";
                this.drawTile(x, y, 'person', color);
                if (camera.z < 4) this.drawTileLabel("dwarf", x, y);
                ctx.lineWidth = 0.1;
                ctx.strokeStyle = "hsl(0 0% 100% / 0.25)";
                ctx.translate(0.5, 0.5);
                ctx.beginPath();
                ctx.moveTo(x, y);
                for (let i = colonist.path.length-1; i >= 0; i--) {
                    ctx.lineTo(colonist.path[i].x, colonist.path[i].y);
                }
                ctx.stroke();
                ctx.translate(-0.5, -0.5);
            }
        }
        ctx.restore();
    },

    drawItems(where) {
        ctx.save();
        for (let item of map.items) {
            let pos =
                (where === 'ground' && isItemPosOnGround(item.pos)) ? item.pos
                : (where === 'inventory' && !isItemPosOnGround(item.pos)) ? item.pos.pos
                : null;
            if (!pos) continue;
            if (this.view.left <= pos.x && pos.x < this.view.right
                && this.view.top <= pos.y && pos.y < this.view.bottom) {
                let color = `hsl(200 50% 50%)`;
                ctx.lineWidth = 1/(camera.TILE_SIZE/512);
                ctx.strokeStyle = "black";
                this.drawTile(pos.x, pos.y, item.type, color, {scale: where === 'ground'? 1.0 : 0.4});
            }
        }
        ctx.restore();
    },

    all() {
        this.begin();

        this.drawBackground();
        this.drawRooms();
        this.drawDoors();
        this.drawFurniture();
        if (main.uiMode === 'furniture') this.drawFurnitureCandidateAt(main.pointerState);
        this.drawItems('ground');
        this.drawCreatures();
        this.drawItems('inventory');

        this.end();
    },
};


const main = {
    /** @type {null | {cx: number, cy: number, ox: number, oy: number}} */
    dragState: null,
    /** @type {{[key: string]: null | number}} */
    keyState: {
        // maps to either null if not being held or a timestamp if it is down
        // only keys in this map are tracked (and preventDefault-ed)
        r: null,
        f: null,
    },
    // last known position of the pointer, in world coordinates
    // TODO: convert the whole program to use sx, sy for screen (canvas) and wx, wy for world
    pointerState: Pos(0, 0),

    init() {
        simulation.init();
        this.render();
        this.loop();

        for (let event of ['Click', 'PointerDown', 'PointerUp', 'PointerCancel', 'PointerMove', 'Wheel', 'KeyDown', 'KeyUp', 'Blur']) {
            let el = (event === 'KeyUp' || event === 'Blur')? window : canvas;
            el.addEventListener(event.toLowerCase(), (e) => {
                // Try calling state_onEvent and also onEvent
                for (let handlerCandidate of [`${this.uiMode}_on${event}`, `on${event}`]) {
                    if (handlerCandidate in this) {
                        this[handlerCandidate](e);
                    }
                }
            });
        }
    },

    /** @type {'stopped' | 'view' | 'room' | 'furniture'} */
    get uiMode() {
        if (!document.hasFocus())              return 'stopped';
        if (document.activeElement !== canvas) return 'stopped';
        if (this.keyState.r)                   return 'room';
        if (this.keyState.f)                   return 'furniture';
        return 'view';
    },

    onPointerMove(event) {
        this.pointerState = camera.convertCanvasToWorldCoord(convertPixelToCanvasCoord(event));
    },

    view_onPointerDown(event) {
        if (event.button !== 0) return; // left button only
        let {x, y} = convertPixelToCanvasCoord(event);
        this.dragState = {cx: camera.pos.x, cy: camera.pos.y, ox: x, oy: y};
        event.currentTarget.setPointerCapture(event.pointerId);
    },

    view_onPointerUp(_event) {
        this.dragState = null;
    },

    view_onPointerCancel(_event) {
        this.dragState = null;
    },

    view_onPointerMove(event) {
        if (!this.dragState) return;
        // Invariant: I want the position under the cursor
        // to stay the same tile.
        let {x, y} = convertPixelToCanvasCoord(event);
        const {cx, cy, ox, oy} = this.dragState;
        camera.set(cx + (ox - x)/camera.TILE_SIZE, cy + (oy - y)/camera.TILE_SIZE);
        this.render();
    },

    view_onWheel(event) {
        // NOTE: the deltaX, deltaY values are in the deltaMode units,
        // which varies across browsers. The wheelDeltaX, wheelDeltaY
        // are always in pixel units.
        event.preventDefault();
        // TODO: implement invariant: I want the position under
        // the cursor to stay the same tile.
        camera.z = camera.z - event.wheelDeltaY / 1000;
        camera.set(camera.pos.x, camera.pos.y); // to make sure the bounds are still valid
        this.render();
    },

    room_onClick(event) {
        if (event.button !== 0) return; // left button only
        let pos = camera.convertCanvasToWorldCoord(convertPixelToCanvasCoord(event));
        // Unlock the room if it's locked
        let room = roomAtPosition(pos);
        if (room && unlockableRoomList(map).indexOf(room) >= 0) {
            unlockRoom(map, room);
            this.render();
        } // TODO: else show error message?
    },

    furniture_onClick(event) {
        if (event.button !== 0) return; // left button only
        let pos = camera.convertCanvasToWorldCoord(convertPixelToCanvasCoord(event));
        let room = roomAtPosition(pos);
        if (!room) return; // either invalid pos, or no room; TODO: show error message?
        let positions = positionsOccupiedByFurniture(room, pos).values();
        for (let p of positions) if (!isPositionInRoomBuildable(room, p)) return; // TODO: error message?
        room.furniture.push(pos);
        this.render();
    },

    onBlur(_event) {
        // We can't track keys when we don't have focus, so assume they were released
        for (let key of Object.keys(this.keyState)) {
            this.keyState[key] = null;
        }
        this.render();
    },

    onKeyDown(event) {
        if (this.keyState[event.key] === undefined) return; // ignore keys we aren't tracking

        // Keydown and keyup are not symmetric. Keydown is conservative,
        // only considering it down if there are no modifiers.
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        if (event.repeat) return;
        this.keyState[event.key] = simulation.tickId;
        this.render();
    },

    onKeyUp(event) {
        if (this.keyState[event.key] === undefined) return; // ignore keys we aren't tracking

        // Keydown and keyup are not symmetric. Keyup releases the key
        // even if there are modifiers.
        this.keyState[event.key] = null;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        event.preventDefault(); // Don't prevent default if a modifier is pressed
        // NOTE: doesn't handle the edge case of press R, press Shift, release R,
        // because that sends keydown key === 'r' followed by keyup key === 'R'
        this.render();
    },

    render() {
        // NOTE: it would be cleaner for this object, to calculate
        // render flags based on uiMode, but instead I made uiMode
        // global so that the render functions can look at it and
        // change their behavior
        render.all();
    },

    loop() {
        render.highlightedRoom = null;
        switch (this.uiMode) {
        case 'stopped':
            render.cursor = 'wait';
            setMessage(`Click to focus`);
            break;
        case 'view':
            render.cursor = 'move';
            simulation.simulate();
            this.render();
            setMessage(`R to unlock rooms, F to place furniture, or drag the mouse to scroll`);
            break;
        case 'room':
            render.highlightedRoom = roomAtPosition(this.pointerState);
            render.cursor = unlockableRoomList(map).indexOf(render.highlightedRoom) >= 0 ? 'pointer' : 'cell';
            this.render();
            setMessage("Click to unlock a room");
            break;
        case 'furniture':
            let room = roomAtPosition(this.pointerState);
            render.cursor = room?.unlocked ? 'crosshair' : 'no-drop';
            this.render();
            let shape = roomCharacteristics[room?.type]?.furnitureShape;
            let message = "Move mouse to where you want to build furniture";
            if (room && room.unlocked) {
                if (shape) message = `Click to place ${shape.name} in ${room.type}`;
                else message = "No furniture allowed in this room";
            }
            setMessage(message);
            break;
        }

        setTimeout(() => this.loop(), 1000/simulation.TICKS_PER_SECOND);
    }
}


main.init();
