type Colonist = any;

type Position = {x: number; y: number; toString(): string; equals(p: Position): boolean;};
type Rect = {left: number; right: number; top: number; bottom: number;};

type ItemType = 'rawfood' | 'cookedfood';
type Item = {id: string; type: ItemType; pos: Position | Object;};

type FurnitureShape = {
    stand: Position;
    inputs: Array<{type: ItemType; pos: Position}>;
    output: ItemType;
    sprites: Array<{type: string, pos: Position}>;
    ticks: number;
};
                  
type Door = {pos: Position; room1: Room; room2: Room;};
type RoomType = 'open' | 'wilderness' | 'dining' | 'bedroom' | 'kitchen' | 'farm';
type Room = {
    type: RoomType;
    q: number; r: number;
    hash: number;
    rect: Rect;
    unlocked: boolean;
    furniture: Array<Position>;
};

type GameMap = {
    bounds: Rect;
    tiles: { get(pos: Position): string; };
    roomRows: number; roomCols: number;
    rooms: Array<Room>;
    walkable: Map<string, {pos: Position; in: Room|Door}>;
    wildernessEnds: Map<string, number>;
    doors: Set<Door>;
    items: Array<Item>;
};

type Job = {
    id: string;
    type: string;
    room: Room;
    furniture: Position;
    colonist: Colonist;
    item: Item | undefined;
    dest: Position;
    stand: Position | undefined;
    timeCompleted: number | null | undefined;
};
