/*!
 * From https://www.redblobgames.com/x/2327-roguelike-dev/
 * Copyright 2023 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 */

const DEBUG = false;

function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }


let camera = {
    x: 0,
    y: 0,
    zoom: 1,
};

// Drawing area
/** @type {HTMLCanvasElement} */
export const canvas = document.querySelector("#game");
export const ctx = canvas.getContext('2d');

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

// Tile map view -- TODO: should be zoomable
const TILE_SIZE = DEBUG? 12 : 25;
const VIEWWIDTH = canvas.width / TILE_SIZE;
const VIEWHEIGHT = canvas.height / TILE_SIZE;

if (window.devicePixelRatio && window.devicePixelRatio !== 1) {
    // Handle hi-dpi displays
    canvas.width *= window.devicePixelRatio;
    canvas.height *= window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

//////////////////////////////////////////////////////////////////////
// PLACEHOLDERS

const simulation = {
    TICKS_PER_SECOND: 10,
    tickId: 0,
};

//////////////////////////////////////////////////////////////////////
// Map

const map = {
    bounds: {left: -100, right: 100, top: -100, bottom: 100},
    tiles: {
        get({x, y}) { return x < 0 || y < 0? 'void' : x < 20 + 10 * Math.cos(y*0.1)  ? 'river' : 'plains'; },
    },
};

//////////////////////////////////////////////////////////////////////
// Rendering
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
    const halfwidth = VIEWWIDTH / 2;
    const halfheight = VIEWHEIGHT / 2;
    let offset = {
        x: clamp(camera.x + 0.5,
                 map.bounds.left + halfwidth,
                 map.bounds.right - halfwidth + 1),
        y: clamp(camera.y + 0.5,
                 map.bounds.top + halfheight,
                 map.bounds.bottom - halfheight + 1),
    };

    const dx = halfwidth - offset.x;
    const dy = halfheight - offset.y;
    let view = {
        left: Math.floor  (offset.x - halfwidth),
        right: Math.ceil  (offset.x + halfwidth),
        top: Math.floor   (offset.y - halfheight),
        bottom: Math.ceil (offset.y + halfheight),
    };
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(TILE_SIZE, TILE_SIZE);
    ctx.translate(dx, dy);

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
    ctx.lineWidth = 1/(TILE_SIZE/512);
    ctx.strokeStyle = "black";
    for (let y = view.top; y < view.bottom; y++) {
        for (let x = view.left; x < view.right; x++) {
            let tile = map.tiles.get({x, y});
            let index = animationIndex(x, y - (tile !== 'river'? 0 : Math.floor(simulation.tickId/simulation.TICKS_PER_SECOND)));
            let renderCandidates = tileRenders[tile] ?? ["red"];
            let render = renderCandidates[index % renderCandidates.length];
            drawTile(x, y, null, render);
        }
    }
    ctx.restore();

    // Agents are drawn on top of most everything else (except the cursor)
    ctx.save();
    /*
    ctx.lineJoin = 'bevel'; // some of the game-icons have sharp corners
    for (let agent of simulation.agents) {
        let {x, y} = agent.location;
        if (view.left <= x && x < view.right
            && view.top <= y && y < view.bottom) {
            let color = "yellow";
            if (agent.health < simulation.AGENT_HUNGRY) color = "orange";
            if (agent.health < simulation.AGENT_STARVING) color = "red";
            if (agent.health === 0) color = "black";
            if (agent.health < 0) color = "purple"; // debugging
            if (agent.dest && agent.health > 0) {
                ctx.strokeStyle = "white";
                ctx.lineWidth = 0.02;
                ctx.beginPath();
                ctx.moveTo(x + 0.5, y + 0.5);
                ctx.lineTo(agent.dest.x + 0.5, agent.dest.y + 0.5);
                ctx.stroke();
            }
            ctx.lineWidth = 1/(TILE_SIZE/512);
            ctx.strokeStyle = "black";
            drawTile(x, y, agent.appearance.sprite, color);
            ctx.font = '0.4px monospace';
            ctx.lineWidth = 2 / TILE_SIZE;
            ctx.fillStyle = "white";
            ctx.textAlign = 'center';
            const label = agent.id.replace("agent-", "");
            ctx.strokeText(label, x+0.5, y+0.9);
            ctx.fillText(label, x+0.5, y+0.9);
        }
    }
    */
    
    ctx.restore();
    
    ctx.restore();
}

const main = {
    init() {
        render();
        this.loop();

        canvas.addEventListener('pointerdown',    (e) => this.dragStart(e));
        canvas.addEventListener('pointerup',      (e) => this.dragEnd(e));
        canvas.addEventListener('pointercancel',  (e) => this.dragEnd(e));
        canvas.addEventListener('pointermove',    (e) => this.dragMove(e));
        canvas.addEventListener('touchstart',     (e) => e.preventDefault());
    },

    dragState: null,

    dragStart(event) {
        if (event.button !== 0) return; // left button only
        let {x, y} = convertPixelToCanvasCoord(event);
        this.dragState = {cx: camera.x, cy: camera.y,
                          ox: x, oy: y};
        event.currentTarget.setPointerCapture(event.pointerId);
    },

    dragEnd(_event) {
        this.dragState = null;
    },

    dragMove(event) {
        if (!this.dragState) return;
        // Invariant: I want the position under the cursor
        // to stay the same tile. HACK: don't understand yet
        // why dividing by 2 makes this work
        let {x, y} = convertPixelToCanvasCoord(event);
        const {cx, cy, ox, oy} = this.dragState;
        camera.x = cx + (ox - x)/TILE_SIZE/2;
        camera.y = cy + (oy - y)/TILE_SIZE/2;
        render();
    },
    
    loop() {
        if (document.hasFocus() && document.activeElement === canvas) {
            simulation.tickId++;
            render();
        }
        setTimeout(() => this.loop(), 1000/simulation.TICKS_PER_SECOND);
    }
}

main.init();

