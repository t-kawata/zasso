// PX-349 @verifies C001 @verifies C002 @verifies C003 @verifies C004 @verifies C005 @verifies C006
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeGif,
  estimateGifBytes,
  fitFramesToCeiling,
} from '../../.claude/scripts/conver/progress-gif/engine.js';

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function u16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

// [::TICKET::] PX-349 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-349 --for-spec --no-implementation-order`.
function countImageDescriptors(bytes) {
  let count = 0;
  for (let index = 0; index < bytes.length - 1; index += 1) {
    if (bytes[index] === 0x2c) count += 1;
  }
  return count;
}

test('encodeGif writes a GIF89a header, dimensions, loop and trailer', () => {
  const width = 4;
  const height = 3;
  const frames = [
    new Uint8Array(width * height).fill(0),
    new Uint8Array(width * height).fill(1),
  ];
  const gif = encodeGif({ width, height, frames, delayCs: 10 });
  assert.equal(String.fromCharCode(...gif.slice(0, 6)), 'GIF89a');
  assert.equal(u16(gif, 6), width);
  assert.equal(u16(gif, 8), height);
  assert.equal(gif[10] & 0x80, 0x80);
  assert.ok(gif.includes(0x21) && gif.includes(0xff));
  assert.equal(gif[gif.length - 1], 0x3b);
  assert.ok(countImageDescriptors(gif) >= 1);
});

test('encodeGif is deterministic for identical frames', () => {
  const width = 2;
  const height = 2;
  const frames = [new Uint8Array([0, 1, 2, 3])];
  const first = encodeGif({ width, height, frames, delayCs: 10 });
  const second = encodeGif({ width, height, frames: [new Uint8Array([0, 1, 2, 3])], delayCs: 10 });
  assert.deepEqual(Buffer.from(first), Buffer.from(second));
});

test('estimateGifBytes grows with pixels and frames', () => {
  const small = estimateGifBytes({ width: 100, height: 100 }, { frames: 10 });
  const large = estimateGifBytes({ width: 200, height: 200 }, { frames: 20 });
  assert.ok(large > small);
  assert.ok(small > 0);
});

test('fitFramesToCeiling reduces only when the estimate exceeds the ceiling', () => {
  const below = fitFramesToCeiling({ width: 100, height: 100 }, 120, 100 * 1024 * 1024);
  assert.equal(below.frames, 120);
  assert.equal(below.warnings.length, 0);
  const above = fitFramesToCeiling({ width: 4000, height: 4000 }, 120, 1024 * 1024);
  assert.ok(above.frames < 120);
  assert.ok(above.frames >= 20);
  assert.ok(above.warnings.length > 0);
});
