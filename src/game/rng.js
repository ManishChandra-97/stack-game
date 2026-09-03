export function fnv1a32(input) { let hash = 0x811c9dc5; for (let i = 0; i < input.length; i += 1) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 0x01000193); } return hash >>> 0; }
export function mulberry32(seed) { let state = seed >>> 0; return () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const uniform = (rng, min, max) => min + rng() * (max - min);
export function weightedPick(rng, values, weights) { let roll = rng(); for (let i = 0; i < weights.length; i += 1) { roll -= weights[i]; if (roll < 0) return values[i]; } return values.at(-1); }
