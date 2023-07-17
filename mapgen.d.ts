type Position = {x: number; y: number; toString(): string; equals(p: Position): boolean;};
type Rect = {left: number; right: number; top: number; bottom: number;};
type Room = {unlocked: boolean; rect: Rect;};
type Door = {room1: Room; room2: Room; pos: Position;};
