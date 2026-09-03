import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound, difficultyForRound, publicRound, resolveChoice } from '../src/game/engine.js';
import { mulberry32 } from '../src/game/rng.js';
test('difficulty follows the specified progression', () => { assert.equal(difficultyForRound(1), 0); assert.equal(difficultyForRound(5), .2); assert.equal(difficultyForRound(15), .7); assert.equal(difficultyForRound(21), 1); });
test('public rounds do not leak engine fields', () => { const round = createRound(1, null, mulberry32(42)); const publicState = JSON.stringify(publicRound(round)); ['hiddenState','Probability','Loss','Roll','seed'].forEach(key => assert.equal(publicState.includes(key), false)); assert.equal(publicRound(round).options.length, 3); });
test('scores are server-rounded and bust at or below 20', () => { const round = { safeProbability: 1, safeGain: .08, safeLoss: .8, safeRoll: 0 }; assert.equal(resolveChoice(100, round, 'SAFE').scoreAfter, 108); round.safeProbability = 0; assert.equal(resolveChoice(100, round, 'SAFE').scoreAfter, 20); assert.equal(resolveChoice(100, round, 'SAFE').isBust, true); });
