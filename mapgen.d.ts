type Position = {x: number; y: number; toString(): string; equals(p: Position): boolean;};
type Rect = {left: number; right: number; top: number; bottom: number;};
type Room = {q: number; r: number; hash: number; rect: Rect; unlocked: boolean; unlock(): void};
type Door = {room1: Room; room2: Room; pos: Position;};
