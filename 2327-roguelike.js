/*!
 * From https://www.redblobgames.com/x/2327-roguelike-dev/
 * Copyright 2023 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 */

import {Pos, generateMap} from "./mapgen.js";
import {clamp} from "./util.js";

// Drawing area
/** @type {HTMLCanvasElement} */
export const canvas = document.querySelector("#game");
export const ctx = canvas.getContext('2d');
const CANVAS_SCALE = window.devicePixelRatio ?? 1; // Handle hi-dpi displays, but also responsive layout
canvas.width *= CANVAS_SCALE;
canvas.height *= CANVAS_SCALE;

/** Convert from event coordinate space (on the page) to Canvas coordinate
 * space (assuming there are no transforms on the canvas) */
function convertPixelToCanvasCoord(event) {
    const canvas = event.currentTarget; // should be the same as the global 'canvas' var
    const bounds = canvas.getBoundingClientRect();
    return {
        x: (event.x - bounds.left) / bounds.width * canvas.width,
        y: (event.y - bounds.top) / bounds.height * canvas.height,
    };
}



//////////////////////////////////////////////////////////////////////
// Simulation

class Colonist {
    constructor(pos) {
        /** @type {Position} */
        this.pos = pos;
        /** @type {Position[]} - reverse order of tiles to visit */
        this.path = [];
    }

    simulate() {
        if (this.path.length > 0) {
            // If there's a path, we'll move one step closer to the goal
            this.pos = this.path.pop();
        } else {
            // If no path, let's find a path to a random destination
            const numberOfDestinations = map.walkable.size;
            let i = Math.floor(Math.random() * numberOfDestinations);
            let dest = Array.from(map.walkable.values())[i];

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
    tickId: 0,
    colonists: [],
    init() {
        for (let x = 20; x < 25; x++) {
            for (let y = 10; y < 15; y++) {
                this.colonists.push(new Colonist(Pos(x, y)));
            }
        }
    },
    simulate() {
        this.tickId++;
        for (let colonist of this.colonists) {
            colonist.simulate();
        }
    },
};

//////////////////////////////////////////////////////////////////////
// Map

const map = generateMap(); // global

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
    // For zooming:
    _z: 10,
    get z() { return this._z; },
    set z(newZ) { this._z = clamp(newZ, 2, 10); },
    get TILE_SIZE() { return 100 / this.z * CANVAS_SCALE; },
    get VIEWWIDTH() { return canvas.width / this.TILE_SIZE; },
    get VIEWHEIGHT() { return canvas.height / this.TILE_SIZE; },
};
camera.set(0, 0);


//////////////////////////////////////////////////////////////////////
// Pathfinding

/**
 * @param {Map} map
 * @param {Position} start
 * @param {Position} goal
 */
function breadthFirstSearch(map, start, goal) {
    /* see https://www.redblobgames.com/pathfinding/a-star/introduction.html */
    const DIRS = [[-1, 0], [0, +1], [+1, 0], [0, -1]];
    let cost_so_far = {}; cost_so_far[start] = 0;
    let came_from = {}; came_from[start] = null;
    let fringes = [[start]];
    for (let k = 0; fringes[k].length > 0; k++) {
        fringes[k+1] = [];
        for (let pos of fringes[k]) {
            if (pos.equals(goal)) return {cost_so_far, came_from};
            for (let [dx, dy] of DIRS) {
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
    return null; // TODO: path not found - should never happen
}

//////////////////////////////////////////////////////////////////////
// Rendering
function setMessage(str) {
    document.querySelector("#messages").textContent = str;
}

const sprites = await (async function() {
    async function S(url) {
        // This relies on the way game-icons.net svgs are structured,
        // as a single <path d="…"/>
        const stream = await fetch(url);
        const svg = await stream.text();
        return new Path2D(svg.replace(/.* d="/, "").replace(/".*/, ""));
    }
    
    return {
        person:     await S("./game-icons/delapouite/person.svg"),
        rooster:    await S("./game-icons/delapouite/rooster.svg"),
        grass:      await S("./game-icons/delapouite/grass.svg"),
        wheat:      await S("./game-icons/lorc/wheat.svg"),
        wall:       await S("./game-icons/delapouite/stone-wall.svg"),
        cactus:     await S("./game-icons/delapouite/cactus.svg"),
        door:       await S("./game-icons/delapouite/door.svg"),
        move:       await S("./game-icons/delapouite/move.svg"),
        square:     await S("./game-icons/delapouite/square.svg"),
        sprout:     await S("./game-icons/lorc/sprout.svg"),
    };
})();


export function render() {
    const halfwidth = camera.VIEWWIDTH / 2;
    const halfheight = camera.VIEWHEIGHT / 2;

    let view = {
        left: Math.floor  (camera.pos.x - halfwidth),
        right: Math.ceil  (camera.pos.x + halfwidth),
        top: Math.floor   (camera.pos.y - halfheight),
        bottom: Math.ceil (camera.pos.y + halfheight),
    };

    setMessage(`Camera ${camera.pos.x.toFixed(2)},${camera.pos.y.toFixed(2)} view ${view.left},${view.right} to ${view.top},${view.bottom}`);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(camera.TILE_SIZE, camera.TILE_SIZE);
    ctx.translate(halfwidth, halfheight); // move from top left to center of screen
    ctx.translate(-camera.pos.x, -camera.pos.y); // move center by the camera offset

    // Tile backgrounds
    const tileRenders = {
        void: ["hsl(300, 10%, 20%)", "hsl(300 5% 10%)"],
        grass: ["hsl(100 30% 50%)", "hsl(110 30% 49%)", "hsl(90 35% 50%)", "hsl(100 35% 50%)"],
        plains: ["hsl(80 30% 60%)", "hsl(90 35% 61%)", "hsl(70 40% 59%)", "hsl(80 40% 60%)"],
        desert: ["hsl(50 20% 70%)", "hsl(50 15% 70%)", "hsl(50 25% 70%)", "hsl(45 20% 70%)"],
        river: ["hsl(220 50% 44%)", "hsl(240 50% 43%)", "hsl(230 50% 45%)", "hsl(230 50% 42%)"],
    };
    const defaultPath = new Path2D("M 0,0 l 512,0 l 0,512 l -512,0 z");
    function drawTile(x, y, sprite, color) {
        ctx.translate(x, y);
        ctx.scale(1/512, 1/512);
        ctx.stroke(sprites[sprite] ?? defaultPath);
        ctx.fillStyle = color;
        ctx.fill(sprites[sprite] ?? defaultPath);
        ctx.scale(512, 512);
        ctx.translate(-x, -y);
    }
    function animationIndex(x, y) {
        return (x & 7) ^ (y & 7) ^ (((x+y) & 4) ? 0xff : 0);
    }
    
    ctx.save();
    ctx.lineJoin = 'bevel'; // some of the game-icons have sharp corners
    ctx.lineWidth = 1/(camera.TILE_SIZE/512);
    ctx.strokeStyle = "black";
    for (let y = view.top; y < view.bottom; y++) {
        for (let x = view.left; x < view.right; x++) {
            let tile = map.tiles.get(Pos(x, y));
            let index = animationIndex(x, y - (tile !== 'river'? 0 : Math.floor(simulation.tickId/simulation.TICKS_PER_SECOND)));
            let renderCandidates = tileRenders[tile] ?? ["red"];
            let render = renderCandidates[index % renderCandidates.length];
            drawTile(x, y, null, render);
        }
    }
    ctx.restore();

    // Agents are drawn on top of most everything else (except the cursor)
    ctx.save();

    ctx.lineJoin = 'bevel'; // some of the game-icons have sharp corners
    for (let door of map.doors) {
        let {x, y} = door.pos;
        if (view.left <= x && x < view.right
            && view.top <= y && y < view.bottom) {
            let color = `hsla(${360 * door.room1.hash|0}, 50%, 50%, 0.8)`;
            // TODO: turn this into a helper function that draws a tile and also the label
            ctx.lineWidth = 1/(camera.TILE_SIZE/512);
            ctx.strokeStyle = "white";
            drawTile(x, y, 'door', color);
            /*
            ctx.font = '0.4px monospace';
            ctx.lineWidth = 2 / TILE_SIZE;
            ctx.fillStyle = "white";
            ctx.textAlign = 'center';
            const label = "door";
            ctx.strokeText(label, x+0.5, y+0.9);
            ctx.fillText(label, x+0.5, y+0.9);
            */
        }
    }

    /* draw rooms */
    for (let room of map.rooms) {
        ctx.fillStyle = `hsla(${360 * room.hash|0}, 50%, 50%, 0.5)`;
        ctx.strokeStyle = "white";
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.rect(room.rect.left+1, room.rect.top+1, room.rect.right-room.rect.left-1, room.rect.bottom-room.rect.top-1);
        ctx.fill();
        ctx.stroke();
    }

    /* draw creatures */
    for (let colonist of simulation.colonists) {
        let {x, y} = colonist.pos;
        if (view.left <= x && x < view.right
            && view.top <= y && y < view.bottom) {
            let color = `hsl(60, 100%, 75%)`;
            // TODO: turn this into a helper function that draws a tile and also the label
            ctx.lineWidth = 1/(camera.TILE_SIZE/512);
            ctx.strokeStyle = "black";
            drawTile(x, y, 'person', color);
            if (camera.z < 4) {
                ctx.font = '0.4px monospace';
                ctx.lineWidth = 2 / camera.TILE_SIZE;
                ctx.fillStyle = "white";
                ctx.textAlign = 'center';
                const label = "dwarf";
                ctx.strokeText(label, x+0.5, y+0.9);
                ctx.fillText(label, x+0.5, y+0.9);
            }
        }
    }        
    
    ctx.restore();
    
    ctx.restore();
}

const main = {
    init() {
        simulation.init();
        render();
        this.loop();

        canvas.addEventListener('pointerdown',    (e) => this.dragStart(e));
        canvas.addEventListener('pointerup',      (e) => this.dragEnd(e));
        canvas.addEventListener('pointercancel',  (e) => this.dragEnd(e));
        canvas.addEventListener('pointermove',    (e) => this.dragMove(e));
        canvas.addEventListener('wheel',          (e) => this.onWheel(e));
        canvas.addEventListener('touchstart',     (e) => e.preventDefault());
    },

    dragState: null,

    dragStart(event) {
        if (event.button !== 0) return; // left button only
        let {x, y} = convertPixelToCanvasCoord(event);
        this.dragState = {cx: camera.pos.x, cy: camera.pos.y, ox: x, oy: y};
        event.currentTarget.setPointerCapture(event.pointerId);
    },

    dragEnd(_event) {
        this.dragState = null;
    },

    dragMove(event) {
        if (!this.dragState) return;
        // Invariant: I want the position under the cursor
        // to stay the same tile.
        let {x, y} = convertPixelToCanvasCoord(event);
        const {cx, cy, ox, oy} = this.dragState;
        camera.set(cx + (ox - x)/camera.TILE_SIZE, cy + (oy - y)/camera.TILE_SIZE);
        render();
    },

    onWheel(event) {
        // NOTE: the deltaX, deltaY values are in the deltaMode units,
        // which varies across browsers. The wheelDeltaX, wheelDeltaY
        // are always in pixel units.
        event.preventDefault();
        // TODO: adjust based on the mouse position too
        camera.z = camera.z - event.wheelDeltaY / 1000;
        render();
    },
    
    loop() {
        if (document.hasFocus() && document.activeElement === canvas) {
            simulation.simulate();
            render();
        } else {
            setMessage(`Click to focus`);
        }
        setTimeout(() => this.loop(), 1000/simulation.TICKS_PER_SECOND);
    }
}

main.init();
