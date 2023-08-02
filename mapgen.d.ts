type Position = {x: number; y: number; toString(): string; equals(p: Position): boolean;};
type Rect = {left: number; right: number; top: number; bottom: number;};

type ItemType = 'rawfood' | 'cookedfood';
type Item = {pos: Position | Object; type: ItemType;};

type FurnitureShape = {
    stand: Position;
    inputs: Array<{type: ItemType; pos: Position}>;
    output: ItemType;
    sprites: Array<{type: string, pos: Position}>;
    ticks: number;
};
                  
type Door = {pos: Position; room1: Room; room2: Room;};
type RoomType = 'open' | 'wilderness' | 'dining' | 'bedroom';
type Room = {
    type: RoomType;
    q: number; r: number;
    hash: number;
    rect: Rect;
    unlocked: boolean;
    furniture: Array<Position>;
};
