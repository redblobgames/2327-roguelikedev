/*!
 * From https://www.redblobgames.com/x/2327-roguelike-dev/
 * Copyright 2023 Red Blob Games <redblobgames@gmail.com>
 * @license Apache-2.0 <https://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * Some utility functions I use often
 */

export function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
export function lerp(a, b, t) { return a * (1-t) + b * t; }
export function unlerp(a, b, t) { return (t - a) / (b - a); }
export function rescale(v, from_lo, from_hi, to_lo, to_hi) { return lerp(to_lo, to_hi, unlerp(from_lo, from_hi, v)); }
export function mod(a, b) { return (a % b + b) % b; }
export function randRange(lo, hi) { return Math.floor(Math.random() * (hi-lo)) + lo; }
export function randInt(lo, hi) { return randRange(lo, hi+1); }
