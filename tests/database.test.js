import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createStore } from '../src/db/database.js';
test('daily runs persist a deterministic current round and advance', () => { const dir = mkdtempSync(path.join(os.tmpdir(), 'stack-test-')); const store = createStore(path.join(dir, 'stack.db')); const first = store.create('daily'); const second = store.create('daily'); assert.deepEqual(first.round, second.round); const result = store.resolve(first.run.id, 'SAFE'); if (!result.result.isBust) { const next = store.continueRun(first.run.id); assert.equal(next.round.roundNumber, 2); } store.close(); });
