import { DAILY_DECK_SIZE } from './constants.js';
import { createRound } from './engine.js';
import { fnv1a32, mulberry32 } from './rng.js';
export function localDate(date = new Date()) { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 10); }
export function dailySeed(date) { return `stack-daily-v1:${date}`; }
export function createDailyDeck(date) { const rng = mulberry32(fnv1a32(dailySeed(date))); const deck = []; let prior = null; for (let i = 1; i <= DAILY_DECK_SIZE; i += 1) { const round = createRound(i, prior, rng); deck.push(round); prior = round.hiddenState; } return deck; }
