// @verifies C005
// [::TICKET::] PX-175: canonical JSON idempotence property tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-175 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { canonicalSerialize } from '../../../.claude/scripts/workspacify-tree/lib/canonical-json.mjs';

function createRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const KEY_POOL = ['alpha', 'beta', 'gamma', 'delta', 'zzz', 'a', 'longer-key-name'];

function generateValue(random, depth) {
  const kindRoll = depth > 3 ? 0 : random();
  if (kindRoll < 0.3) {
    return Math.floor(random() * 100000) - 50000;
  }
  if (kindRoll < 0.55) {
    const picks = ['plain text', 'has "quotes"', 'line\\nbreak', '日本語テキスト', 'tab\tchar'];
    return picks[Math.floor(random() * picks.length)];
  }
  if (kindRoll < 0.7) {
    return random() < 0.5;
  }
  if (kindRoll < 0.85) {
    const arr = [];
    const len = Math.floor(random() * 4);
    for (let i = 0; i < len; i++) arr.push(generateValue(random, depth + 1));
    return arr;
  }
  const obj = {};
  const len = Math.floor(random() * 5);
  for (let i = 0; i < len; i++) {
    obj[KEY_POOL[Math.floor(random() * KEY_POOL.length)]] = generateValue(random, depth + 1);
  }
  return obj;
}

test('property: canonicalSerialize is idempotent and round-trips for random values', () => {
  const random = createRandom(123456);
  for (let run = 0; run < 100; run++) {
    const value = generateValue(random, 0);
    const once = canonicalSerialize(value);
    const parsed = JSON.parse(once);
    const twice = canonicalSerialize(parsed);
    assert.equal(twice, once, 'run ' + run + ' must be idempotent');
    assert.deepEqual(parsed, value, 'run ' + run + ' must round-trip');
    assert.equal(once.endsWith('\n'), true, 'trailing LF');
    assert.equal(once.includes('\r'), false, 'LF only');
    assert.equal(once.includes('\t'), false, 'no tabs in indentation');
  }
});

test('property: any single-character mutation changes the serialized bytes', () => {
  const random = createRandom(777);
  for (let run = 0; run < 60; run++) {
    const value = generateValue(random, 0);
    const once = canonicalSerialize(value);
    // Flip one ASCII character in the serialized output.
    const pos = Math.floor(random() * once.length);
    const originalCode = once.charCodeAt(pos);
    const mutated = once.slice(0, pos) + String.fromCharCode(originalCode === 97 ? 98 : 97) + once.slice(pos + 1);
    assert.notEqual(
      sha256Hex(Buffer.from(mutated, 'utf8')),
      sha256Hex(Buffer.from(once, 'utf8')),
      'run ' + run + ' tamper at ' + pos + ' must change the content hash'
    );
  }
});
