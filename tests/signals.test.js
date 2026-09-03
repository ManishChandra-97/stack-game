import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSignals } from '../src/game/signals.js';
import { mulberry32 } from '../src/game/rng.js';
test('signals are bounded and have five trend marks', () => { const result = makeSignals('favorable', .4, mulberry32(4)); assert.ok(result.signalStrength >= 0 && result.signalStrength <= 100); assert.ok(result.volatility >= 0 && result.volatility <= 100); assert.equal(result.trend.length, 5); });
