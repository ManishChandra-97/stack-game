import test from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a32, mulberry32 } from '../src/game/rng.js';
import { createDailyDeck, dailySeed } from '../src/game/daily.js';
test('FNV and mulberry are deterministic', () => { assert.equal(fnv1a32('stack'), fnv1a32('stack')); const a = mulberry32(123), b = mulberry32(123); assert.deepEqual([a(),a(),a()], [b(),b(),b()]); });
test('daily decks repeat per date and vary by date', () => { assert.equal(dailySeed('2026-09-03'), 'stack-daily-v1:2026-09-03'); assert.deepEqual(createDailyDeck('2026-09-03'), createDailyDeck('2026-09-03')); assert.notDeepEqual(createDailyDeck('2026-09-03')[0], createDailyDeck('2026-09-04')[0]); });
